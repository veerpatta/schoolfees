import "server-only";

import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import {
  addDays,
  cadenceGapDays,
  DEFAULT_CADENCE,
  type ReminderCadence,
} from "@/modules/whatsapp/domain/reminder-cadence";
import { TEMPLATE_INSTALLMENTS } from "@/modules/whatsapp/domain/reminder-template";

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
 * The template's own constants — the deadline it hardcodes, the installments it
 * names, the slot order — live in `./reminder-template`, which carries no
 * `server-only` because the screen previews the message live as staff type.
 */

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

/**
 * The one place a reminder filter set is parsed.
 *
 * The screen reads these off the query string; `sendRemindersAction` reads them
 * back off the posted form and rebuilds the audience from scratch. The two MUST
 * agree, because the action's rebuild is what actually decides who gets a
 * message — a default that differs here would message a different set of
 * families than the office ticked. They used to be two copies, and the action's
 * copy hardcoded 1100 / [1,2] / 1 instead of reading the constants.
 *
 * `read` returns the raw value for a key, or null when it is absent — which is
 * how a missing field reaches its default rather than being read as `Number(null)`,
 * i.e. 0, i.e. an audience of nobody.
 */
export function parseReminderFilters(
  read: (key: string) => string | null,
  sessionLabel: string,
): ReminderFilters {
  const number = (key: string, fallback: number) => {
    const raw = read(key);
    if (raw === null || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const installments = (read("installments") || TEMPLATE_INSTALLMENTS.join(","))
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => value >= 1 && value <= 4);

  return {
    sessionLabel,
    maxTotalPaid: number("maxTotalPaid", DEFAULT_REMINDER_FILTERS.maxTotalPaid),
    installments:
      installments.length > 0 ? installments : [...DEFAULT_REMINDER_FILTERS.installments],
    minDueAmount: number("minDueAmount", DEFAULT_REMINDER_FILTERS.minDueAmount),
    classId: read("classId")?.trim() || null,
    includeRte: read("includeRte") === "on",
  };
}

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
  /** How often this family may be messaged, and any temporary skip. */
  cadence: ReminderCadence;
  snoozedUntil: string | null;
  /** Last date a reminder actually went out, from the send log. */
  lastSentOn: string | null;
};

export type ReminderSkipCounts = {
  installmentsClear: number;
  leftAndNeverPaid: number;
  noCallFlagged: number;
  rteStudent: number;
  belowMinimum: number;
  noPhoneOnRecord: number;
  phoneUnusable: number;
  /** Cadence is `never`. */
  whatsappNever: number;
  /** Snoozed to a date still in the future. */
  whatsappSnoozed: number;
  /** Messaged too recently for their cadence. */
  whatsappTooSoon: number;
};

/**
 * A family held back by the office's own settings rather than by the ledger.
 *
 * Surfaced separately from `skipped` because these are reversible decisions a
 * human made, and a decision you cannot see is a decision you cannot undo.
 */
export type PausedFamily = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  studentClass: string;
  reason: "never" | "snoozed" | "too_soon";
  cadence: ReminderCadence;
  /** When they come back, for `snoozed` and `too_soon`. */
  returnsOn: string | null;
  dueAmount: number;
};

export type ReminderFlags = {
  cadence: ReminderCadence;
  snoozedUntil: string | null;
};

export type ClassOption = { classId: string; label: string; count: number };

export type ReminderAudience = {
  candidates: ReminderCandidate[];
  skipped: ReminderSkipCounts;
  /** Named, because WhatsApp can never reach these families at all. */
  unreachable: Array<{ admissionNo: string; studentName: string; studentClass: string }>;
  /** Held back by a cadence or a snooze — reversible, so shown and undoable. */
  paused: PausedFamily[];
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

/**
 * Bring the financial matviews up to date before quoting money at a parent.
 *
 * `v_workbook_student_financials` is MATERIALIZED. Fifteen triggers — including
 * `student_conventional_discount_assignments` and `conventional_discount_policies`
 * — mark it dirty when fees change, and a pg_cron job drains that queue every
 * two minutes. Which leaves a window: apply a discount, press Send inside those
 * two minutes, and the message quotes the pre-discount amount. Measured on
 * TEST-2026-27: ledger 13,750, matview still 14,250, refresh queued.
 *
 * Measured on production: the drain costs 0ms when nothing is queued (the normal
 * case — it returns false without touching a view) and ~386ms when a refresh is
 * actually pending. That is a cheap price for never quoting a stale figure.
 *
 * Best-effort: if it fails the cron still catches up within two minutes, and a
 * refresh hiccup must not stop the office sending.
 */
export async function drainPendingFinancialRefresh(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<void> {
  try {
    await supabase.rpc("refresh_workbook_materialized_views_if_requested");
  } catch (caught) {
    console.warn("[whatsapp-reminders] financial refresh drain failed", caught);
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
  const [{ data: rows, error }, noCallIds, sentToday, reminderFlags, lastSent] = await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select(SELECT_COLUMNS)
      .eq("session_label", filters.sessionLabel)
      .lte("total_paid", filters.maxTotalPaid),
    loadNoCallStudentIds(supabase, filters.sessionLabel),
    loadSentToday(supabase, filters.sessionLabel),
    loadReminderFlags(supabase, filters.sessionLabel),
    loadLastSentOn(supabase, filters.sessionLabel),
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
    whatsappNever: 0,
    whatsappSnoozed: 0,
    whatsappTooSoon: 0,
  };
  const unreachable: ReminderAudience["unreachable"] = [];
  const paused: PausedFamily[] = [];
  const candidates: ReminderCandidate[] = [];
  const classCounts = new Map<string, ClassOption>();
  const today = istToday();

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

    // The office's own judgement, applied last: everything above is the ledger
    // deciding who owes money, this is a human deciding how often to ask.
    const flags = reminderFlags.get(row.student_id);
    const cadence = flags?.cadence ?? DEFAULT_CADENCE;
    const snoozedUntil = flags?.snoozedUntil ?? null;
    const lastSentOn = lastSent.get(row.student_id) ?? null;

    const pause = (reason: PausedFamily["reason"], returnsOn: string | null) => {
      paused.push({
        studentId: row.student_id,
        admissionNo,
        studentName: titleCase(row.student_name),
        studentClass,
        reason,
        cadence,
        returnsOn,
        dueAmount,
      });
    };

    if (cadence === "never") {
      skipped.whatsappNever += 1;
      pause("never", null);
      continue;
    }

    if (snoozedUntil && snoozedUntil >= today) {
      skipped.whatsappSnoozed += 1;
      pause("snoozed", snoozedUntil);
      continue;
    }

    const gapDays = cadenceGapDays(cadence);
    if (gapDays > 0 && lastSentOn) {
      const nextAllowed = addDays(lastSentOn, gapDays);
      if (nextAllowed > today) {
        skipped.whatsappTooSoon += 1;
        pause("too_soon", nextAllowed);
        continue;
      }
    }

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
      cadence,
      snoozedUntil,
      lastSentOn,
    });
  }

  candidates.sort((left, right) => right.dueAmount - left.dueAmount);
  paused.sort((left, right) => right.dueAmount - left.dueAmount);

  return {
    candidates,
    skipped,
    unreachable,
    paused,
    classOptions: [...classCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Per-family WhatsApp cadence and snooze.
 *
 * Read separately from the no-call flags even though both live on
 * `student_collection_flags`: `no_call` silences every channel, these two are
 * WhatsApp only, and conflating them is how "remind them monthly" would quietly
 * stop the fee collectors calling.
 */
async function loadReminderFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, ReminderFlags>> {
  const { data, error } = await supabase
    .from("student_collection_flags")
    .select("student_id, whatsapp_cadence, whatsapp_snoozed_until")
    .eq("session_label", sessionLabel);

  // Failing open here would message families the office asked us to hold back,
  // which is the whole thing this feature exists to prevent.
  if (error) throw new Error(`Could not read reminder cadence: ${error.message}`);

  return new Map(
    (
      (data ?? []) as Array<{
        student_id: string;
        whatsapp_cadence: ReminderCadence | null;
        whatsapp_snoozed_until: string | null;
      }>
    ).map((row) => [
      row.student_id,
      {
        cadence: row.whatsapp_cadence ?? DEFAULT_CADENCE,
        snoozedUntil: row.whatsapp_snoozed_until,
      },
    ]),
  );
}

/**
 * The last date a reminder actually reached each family.
 *
 * Derived from the send log rather than stored on the student, so the cadence
 * gap is measured against what was really sent and cannot drift. Only `sent`
 * rows count — a failed attempt did not reach anybody, so it must not push the
 * next reminder out.
 */
async function loadLastSentOn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, sent_on")
    .eq("session_label", sessionLabel)
    .eq("status", "sent")
    .order("sent_on", { ascending: false });

  if (error) throw new Error(`Could not read the send history: ${error.message}`);

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ student_id: string; sent_on: string }>) {
    if (!latest.has(row.student_id)) latest.set(row.student_id, row.sent_on);
  }
  return latest;
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
