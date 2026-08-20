import "server-only";

import { formatRupeesPlain } from "@/lib/helpers/currency";
import { toWhatsappDestination } from "@/lib/whatsapp/aisensy";

/**
 * Who gets an automated WhatsApp fee reminder, and what it says.
 *
 * The recipient list is derived from `v_workbook_student_financials` on every
 * run and never stored. That is the whole design: a parent who paid yesterday
 * is absent from today's query, so "stop messaging the ones who paid" needs no
 * un-tagging, no list maintenance, and cannot drift out of sync with the
 * ledger. The only persisted state is the send log, which exists to stop
 * duplicates, not to define the audience.
 */

/**
 * The deadline is hardcoded in the Meta-approved template body — it reads
 * "अंतिम तिथि: 25 अगस्त 2026" and warns of a ₹1,000-per-installment late fee
 * "after that". There is no date variable to override, so from 26 August this
 * template tells families to beat a deadline that has already passed and
 * promises a penalty that has already been levied.
 *
 * Get a replacement template approved before changing this date.
 */
export const FEE_REMINDER_TEMPLATE_DEADLINE = "2026-08-25";

/**
 * Slot order inside the approved "Fees Collection August" template, confirmed
 * on 2026-08-20 by sending P1..P4 markers and reading the message that arrived:
 *
 *   प्रिय P1,                        -> parent name
 *   P2 (P3) की ... किश्त 1 एवं 2     -> student name, class
 *   देय राशि: रु. P4                 -> amount; the template supplies "रु."
 *
 * Four slots. Sending five is rejected with "Template params does not match
 * the campaign", which is how the count was established.
 */
export const FEE_REMINDER_PARAM_ORDER = [
  "parentName",
  "studentName",
  "studentClass",
  "dueAmount",
] as const;

/** Families who have paid at most this much have effectively paid nothing. */
export const DEFAULT_MAX_TOTAL_PAID = 1100;

export type ReminderRecipient = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  parentName: string;
  studentClass: string;
  destination: string;
  usedMotherPhone: boolean;
  /** Installments 1 + 2 of this session, in whole rupees. */
  dueAmount: number;
  totalPaid: number;
};

export type ReminderSkipCounts = {
  nothingPendingOnFirstTwo: number;
  leftAndNeverPaid: number;
  noCallFlagged: number;
  rteStudent: number;
  noPhoneOnRecord: number;
  phoneUnusable: number;
};

export type ReminderAudience = {
  recipients: ReminderRecipient[];
  skipped: ReminderSkipCounts;
  /** Named, because these families can never be reached by WhatsApp at all. */
  unreachable: string[];
};

const SELECT_COLUMNS = [
  "student_id",
  "admission_no",
  "student_name",
  "father_name",
  "father_phone",
  "mother_phone",
  "class_label",
  "record_status",
  "total_paid",
  "inst1_pending",
  "inst2_pending",
].join(", ");

type FinancialRow = {
  student_id: string;
  admission_no: string | null;
  student_name: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_phone: string | null;
  class_label: string | null;
  record_status: string | null;
  total_paid: number | null;
  inst1_pending: number | null;
  inst2_pending: number | null;
};

function titleCase(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
    .trim();
}

/** The session the office is actually working in. */
export async function resolveCurrentSessionLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string> {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("session_label")
    .eq("is_current", true)
    .maybeSingle();

  if (error) throw new Error(`Could not resolve the current session: ${error.message}`);
  if (!data?.session_label) {
    throw new Error("No academic session is marked is_current. Refusing to guess which ledger to message parents about.");
  }
  return data.session_label as string;
}

export async function loadReminderAudience(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  options: { sessionLabel: string; maxTotalPaid?: number; includeRte?: boolean },
): Promise<ReminderAudience> {
  const maxTotalPaid = options.maxTotalPaid ?? DEFAULT_MAX_TOTAL_PAID;

  const [{ data: rows, error }, noCallIds] = await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select(SELECT_COLUMNS)
      .eq("session_label", options.sessionLabel)
      .lte("total_paid", maxTotalPaid),
    loadNoCallStudentIds(supabase, options.sessionLabel),
  ]);

  if (error) throw new Error(`Could not read student financials: ${error.message}`);

  const skipped: ReminderSkipCounts = {
    nothingPendingOnFirstTwo: 0,
    leftAndNeverPaid: 0,
    noCallFlagged: 0,
    rteStudent: 0,
    noPhoneOnRecord: 0,
    phoneUnusable: 0,
  };
  const unreachable: string[] = [];
  const recipients: ReminderRecipient[] = [];

  for (const row of (rows ?? []) as FinancialRow[]) {
    const totalPaid = Number(row.total_paid ?? 0);

    // Installments 1 + 2 of THIS session only. The ledger's overdue figure also
    // folds in last year's carry-forward, which for some families is another
    // ₹20,000 — a number the office has never quoted to them. The template says
    // "किश्त 1 एवं 2", so the amount has to mean exactly that.
    const dueAmount = Number(row.inst1_pending ?? 0) + Number(row.inst2_pending ?? 0);
    if (dueAmount <= 0) {
      skipped.nothingPendingOnFirstTwo += 1;
      continue;
    }

    // 'collectable': on the roll, or gone but still owing against what they paid.
    if (!(row.record_status === "active" || totalPaid > 0)) {
      skipped.leftAndNeverPaid += 1;
      continue;
    }

    if (noCallIds.has(row.student_id)) {
      skipped.noCallFlagged += 1;
      continue;
    }

    const admissionNo = String(row.admission_no ?? "");
    if (!options.includeRte && /RTE/i.test(admissionNo)) {
      skipped.rteStudent += 1;
      continue;
    }

    // Father first, mother as fallback. Twenty-two families have no father's
    // number on record and several of those do have the mother's.
    const fatherDestination = toWhatsappDestination(row.father_phone);
    const destination = fatherDestination ?? toWhatsappDestination(row.mother_phone);
    if (!destination) {
      if (!row.father_phone && !row.mother_phone) {
        skipped.noPhoneOnRecord += 1;
        unreachable.push(`${admissionNo} ${titleCase(row.student_name)}`);
      } else {
        skipped.phoneUnusable += 1;
      }
      continue;
    }

    recipients.push({
      studentId: row.student_id,
      admissionNo,
      studentName: titleCase(row.student_name),
      parentName: titleCase(row.father_name) || "अभिभावक",
      studentClass: row.class_label ?? "",
      destination,
      usedMotherPhone: !fatherDestination,
      dueAmount,
      totalPaid,
    });
  }

  recipients.sort((left, right) => right.dueAmount - left.dueAmount);
  return { recipients, skipped, unreachable };
}

/**
 * Families the office has explicitly flagged as do-not-contact.
 *
 * Reuses `student_collection_flags.no_call`, which staff already toggle from
 * the defaulters screen, rather than inventing a second exclusion list that
 * would silently disagree with the first.
 */
async function loadNoCallStudentIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("student_collection_flags")
    .select("student_id")
    .eq("session_label", sessionLabel)
    .eq("no_call", true);

  if (error) {
    // Fail closed would mean messaging nobody; fail open would mean messaging
    // families the office asked us not to touch. The latter is worse, so this
    // throws rather than defaulting to an empty set.
    throw new Error(`Could not read no-call flags: ${error.message}`);
  }
  return new Set(((data ?? []) as Array<{ student_id: string }>).map((row) => row.student_id));
}

/** Values for the template's four slots, in the order the template expects. */
export function buildReminderParams(recipient: ReminderRecipient): string[] {
  return [
    recipient.parentName,
    recipient.studentName,
    recipient.studentClass,
    formatRupeesPlain(recipient.dueAmount),
  ];
}
