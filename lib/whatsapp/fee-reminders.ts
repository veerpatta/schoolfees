import "server-only";

import { formatRupeesPlain } from "@/lib/helpers/currency";
import { toWhatsappDestination } from "@/lib/whatsapp/aisensy";

/**
 * Who is eligible for a WhatsApp fee reminder, and what the message says.
 *
 * The list is derived from `v_workbook_student_financials` every time the
 * screen loads and is never stored. That is the whole point: a parent who paid
 * yesterday is absent from today's list, so "stop chasing the ones who paid"
 * needs no un-ticking, no tag to clear, and cannot drift away from the ledger.
 * The only persisted state is the send log, which exists to prevent duplicates
 * — not to define the audience.
 */

/**
 * The deadline printed inside the approved template body.
 *
 * "Fees Collection August" reads `अंतिम तिथि: 25 अगस्त 2026` and warns of a
 * ₹1,000-per-installment late fee "after that". There is no date variable to
 * override. From the 26th the message is factually wrong, so the screen warns
 * and the server action refuses. Approve a replacement template before moving
 * this date.
 */
export const FEE_REMINDER_TEMPLATE_DEADLINE = "2026-08-25";

/**
 * The installments the approved template's wording actually names: it says
 * "किश्त 1 एवं किश्त 2" in fixed text. Filter on anything else and the message
 * will still claim installments 1 and 2, so the screen warns when the selection
 * differs.
 */
export const TEMPLATE_INSTALLMENTS = [1, 2] as const;

/**
 * Slot order inside the template, confirmed on 2026-08-20 by sending P1..P4
 * markers to a staff number and reading what arrived:
 *
 *   प्रिय P1,                       -> parent name
 *   P2 (P3) की ... किश्त 1 एवं 2    -> student name, class
 *   देय राशि: रु. P4                -> amount, plain grouped digits; the
 *                                      template supplies the "रु." itself
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

export const DEFAULT_MAX_TOTAL_PAID = 1100;

export type ReminderFilters = {
  sessionLabel: string;
  /** Families who have paid at most this much have effectively paid nothing. */
  maxTotalPaid: number;
  /** Every one of these installments must still carry fees. */
  installments: number[];
  /** Skip anyone owing less than this — not worth a paid message. */
  minDueAmount: number;
  classId: string | null;
  includeRte: boolean;
};

export const DEFAULT_REMINDER_FILTERS: Omit<ReminderFilters, "sessionLabel"> = {
  maxTotalPaid: DEFAULT_MAX_TOTAL_PAID,
  installments: [...TEMPLATE_INSTALLMENTS],
  minDueAmount: 1,
  classId: null,
  includeRte: false,
};

export type ReminderCandidate = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  parentName: string;
  studentClass: string;
  classId: string | null;
  destination: string;
  /** True when the father's number was missing and the mother's was used. */
  usedMotherPhone: boolean;
  /** Sum of the selected installments' pending fees, whole rupees. */
  dueAmount: number;
  totalPaid: number;
  /** Set when this student already has a send logged for today. */
  sentToday: { status: string; at: string } | null;
};

export type ReminderSkipCounts = {
  installmentsClear: number;
  leftAndNeverPaid: number;
  noCallFlagged: number;
  rteStudent: number;
  belowMinimum: number;
  noPhoneOnRecord: number;
  phoneUnusable: number;
};

export type ClassOption = { classId: string; label: string; count: number };

export type ReminderAudience = {
  candidates: ReminderCandidate[];
  skipped: ReminderSkipCounts;
  /** Named, because WhatsApp can never reach these families at all. */
  unreachable: Array<{ admissionNo: string; studentName: string; studentClass: string }>;
  classOptions: ClassOption[];
};

const SELECT_COLUMNS = [
  "student_id",
  "admission_no",
  "student_name",
  "father_name",
  "father_phone",
  "mother_phone",
  "class_id",
  "class_label",
  "record_status",
  "total_paid",
  "inst1_pending",
  "inst2_pending",
  "inst3_pending",
  "inst4_pending",
].join(", ");

type FinancialRow = {
  student_id: string;
  admission_no: string | null;
  student_name: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_phone: string | null;
  class_id: string | null;
  class_label: string | null;
  record_status: string | null;
  total_paid: number | null;
  inst1_pending: number | null;
  inst2_pending: number | null;
  inst3_pending: number | null;
  inst4_pending: number | null;
};

function titleCase(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
    .trim();
}

function pendingFor(row: FinancialRow, installment: number): number {
  switch (installment) {
    case 1: return Number(row.inst1_pending ?? 0);
    case 2: return Number(row.inst2_pending ?? 0);
    case 3: return Number(row.inst3_pending ?? 0);
    case 4: return Number(row.inst4_pending ?? 0);
    default: return 0;
  }
}

/** The session the office is working in. */
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
    throw new Error(
      "No academic session is marked is_current. Refusing to guess which ledger to message parents about.",
    );
  }
  return data.session_label as string;
}

export async function loadReminderAudience(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  filters: ReminderFilters,
): Promise<ReminderAudience> {
  const [{ data: rows, error }, noCallIds, sentToday] = await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select(SELECT_COLUMNS)
      .eq("session_label", filters.sessionLabel)
      .lte("total_paid", filters.maxTotalPaid),
    loadNoCallStudentIds(supabase, filters.sessionLabel),
    loadSentToday(supabase, filters.sessionLabel),
  ]);

  if (error) throw new Error(`Could not read student financials: ${error.message}`);

  const skipped: ReminderSkipCounts = {
    installmentsClear: 0,
    leftAndNeverPaid: 0,
    noCallFlagged: 0,
    rteStudent: 0,
    belowMinimum: 0,
    noPhoneOnRecord: 0,
    phoneUnusable: 0,
  };
  const unreachable: ReminderAudience["unreachable"] = [];
  const candidates: ReminderCandidate[] = [];
  const classCounts = new Map<string, ClassOption>();

  const wanted = filters.installments.length > 0 ? filters.installments : [...TEMPLATE_INSTALLMENTS];

  for (const row of (rows ?? []) as FinancialRow[]) {
    const totalPaid = Number(row.total_paid ?? 0);

    // Every selected installment must still carry fees — "installments 1 and 2
    // are pending" means both, not either. `pending_amount` is fees only, so a
    // family whose only debt is a late fee is correctly absent.
    const perInstallment = wanted.map((installment) => pendingFor(row, installment));
    if (perInstallment.some((amount) => amount <= 0)) {
      skipped.installmentsClear += 1;
      continue;
    }
    const dueAmount = perInstallment.reduce((sum, amount) => sum + amount, 0);

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
    if (!filters.includeRte && /RTE/i.test(admissionNo)) {
      skipped.rteStudent += 1;
      continue;
    }

    if (dueAmount < filters.minDueAmount) {
      skipped.belowMinimum += 1;
      continue;
    }

    const studentClass = row.class_label ?? "";
    const fatherDestination = toWhatsappDestination(row.father_phone);
    const destination = fatherDestination ?? toWhatsappDestination(row.mother_phone);
    if (!destination) {
      if (!row.father_phone && !row.mother_phone) {
        skipped.noPhoneOnRecord += 1;
        unreachable.push({
          admissionNo,
          studentName: titleCase(row.student_name),
          studentClass,
        });
      } else {
        skipped.phoneUnusable += 1;
      }
      continue;
    }

    // Class options are counted before the class filter is applied, so picking
    // a class does not empty the dropdown that picked it.
    if (row.class_id) {
      const existing = classCounts.get(row.class_id);
      if (existing) existing.count += 1;
      else classCounts.set(row.class_id, { classId: row.class_id, label: studentClass, count: 1 });
    }

    if (filters.classId && row.class_id !== filters.classId) continue;

    candidates.push({
      studentId: row.student_id,
      admissionNo,
      studentName: titleCase(row.student_name),
      parentName: titleCase(row.father_name) || "अभिभावक",
      studentClass,
      classId: row.class_id,
      destination,
      usedMotherPhone: !fatherDestination,
      dueAmount,
      totalPaid,
      sentToday: sentToday.get(row.student_id) ?? null,
    });
  }

  candidates.sort((left, right) => right.dueAmount - left.dueAmount);

  return {
    candidates,
    skipped,
    unreachable,
    classOptions: [...classCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Families the office has explicitly marked do-not-contact.
 *
 * Reuses `student_collection_flags.no_call`, the toggle staff already use on
 * the defaulters screen, rather than inventing a second exclusion list that
 * would quietly disagree with the first.
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

  // Throws rather than defaulting to an empty set. Failing open here would
  // message the exact families the office asked us to leave alone.
  if (error) throw new Error(`Could not read no-call flags: ${error.message}`);
  return new Set(((data ?? []) as Array<{ student_id: string }>).map((row) => row.student_id));
}

export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function loadSentToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, { status: string; at: string }>> {
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, status, created_at")
    .eq("session_label", sessionLabel)
    .eq("sent_on", istToday());

  // A missing send history is not a reason to refuse to show the list — but it
  // does mean the screen cannot promise nobody was messaged today, so say so
  // rather than rendering an empty column as if it were a clean sheet.
  if (error) throw new Error(`Could not read today's send log: ${error.message}`);

  return new Map(
    ((data ?? []) as Array<{ student_id: string; status: string; created_at: string }>).map(
      (row) => [row.student_id, { status: row.status, at: row.created_at }],
    ),
  );
}

/** Values for the template's four slots, in the order the template expects. */
export function buildReminderParams(
  candidate: Pick<ReminderCandidate, "parentName" | "studentName" | "studentClass" | "dueAmount">,
): string[] {
  return [
    candidate.parentName,
    candidate.studentName,
    candidate.studentClass,
    formatRupeesPlain(candidate.dueAmount),
  ];
}
