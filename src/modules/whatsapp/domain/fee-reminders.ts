import "server-only";

import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import {
  addDays,
  cadenceGapDays,
  DEFAULT_CADENCE,
  type ReminderCadence,
} from "@/modules/whatsapp/domain/reminder-cadence";
import {
  DEFAULT_LATE_FEE_BASIS,
  isLateFeeBasis,
  type LateFeeBasis,
} from "@/modules/whatsapp/domain/late-fee";
import {
  campaignFor,
  noticeValuesFrom,
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  TEMPLATE_INSTALLMENTS,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";

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
 * Campaign names, slot orders and preview bodies live in `./campaigns`, which
 * carries no `server-only` because the screen previews the message live as staff
 * type. This file only decides WHO is on the list.
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
  /**
   * Which notice is being sent. This CHANGES THE AUDIENCE, which is why it lives
   * with the filters and travels in the query string rather than in client
   * state: the action re-derives the list from these same values, and a
   * situation it could not see would message a different set of families than
   * the office ticked.
   */
  situation: NoticeSituation;
  /** Picks the campaign name only. Same families either way. */
  language: NoticeLanguage;
  /**
   * Fills the date slot, DD-MM-YYYY. Chosen by the office, not derived. On
   * `prevyear` this is the settle-by date, which v2 gave that notice.
   */
  lastDate: string;
  /**
   * Slot {{7}}: what the message says a late payment will cost.
   *
   * Deliberately per-run and deliberately NOT the ledger's late fee. This is a
   * lever for getting fees in on time; the app does not charge what it says
   * here, and `describeLateFeeDrift` warns when the two disagree rather than
   * refusing to send.
   */
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
};

export const DEFAULT_REMINDER_FILTERS: Omit<
  ReminderFilters,
  "sessionLabel" | "lastDate" | "lateFeeAmount"
> = {
  maxTotalPaid: DEFAULT_MAX_TOTAL_PAID,
  installments: [...TEMPLATE_INSTALLMENTS],
  minDueAmount: 1,
  classId: null,
  includeRte: false,
  situation: DEFAULT_SITUATION,
  language: DEFAULT_LANGUAGE,
  lateFeeBasis: DEFAULT_LATE_FEE_BASIS,
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
  /** Used when the office has not picked one yet. Already DD-MM-YYYY. */
  defaultLastDate = "",
  /**
   * What the LEDGER charges per installment, from the live fee policy. The
   * opening value for slot 7, so the message agrees with the receipt until
   * somebody deliberately changes it.
   */
  defaultLateFeeAmount = 0,
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
    // An unrecognised value falls back rather than throwing: a hand-edited URL
    // must not be able to take the screen down.
    situation: isNoticeSituation(read("situation")) ? (read("situation") as NoticeSituation) : DEFAULT_SITUATION,
    language: isNoticeLanguage(read("language")) ? (read("language") as NoticeLanguage) : DEFAULT_LANGUAGE,
    lastDate: read("lastDate")?.trim() || defaultLastDate,
    lateFeeAmount: number("lateFeeAmount", defaultLateFeeAmount),
    lateFeeBasis: isLateFeeBasis(read("lateFeeBasis"))
      ? (read("lateFeeBasis") as LateFeeBasis)
      // Carry-forward never accrues a late fee in the ledger, so that notice
      // opens on "not charged" and quoting one is a deliberate act.
      : situationFallbackBasis(read("situation")),
  };
}

/** `prevyear` opens on "not charged"; the current-year notices on the real policy. */
function situationFallbackBasis(rawSituation: string | null): LateFeeBasis {
  return rawSituation === "prevyear" ? "none" : DEFAULT_LATE_FEE_BASIS;
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
  /**
   * The figure the chosen notice will quote, whole rupees. Which number that is
   * depends on the situation — see `loadReminderAudience`.
   */
  dueAmount: number;
  totalPaid: number;
  /** balance {{5}} — everything still owed on installments 1-4. */
  balanceDue: number;
  /** prevyear {{5}} — what is left of the carried-forward balance. */
  prevYearBalance: number;
  /** prevyear {{4}} — the session that balance came from, e.g. "2025-26". */
  prevSessionLabel: string | null;
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
  /**
   * How many families each notice would reach, counted in the same pass as the
   * selected one. The picker shows live numbers without three round trips, and
   * the office can see that "Balance" is 252 before choosing it.
   */
  counts: Record<NoticeSituation, number>;
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
  const campaignName = campaignFor(filters.situation, filters.language).campaignName;

  const [{ data: rows, error }, noCallIds, sentToday, reminderFlags, lastSent, carryForward] =
    await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select(SELECT_COLUMNS)
      .eq("session_label", filters.sessionLabel),
    loadNoCallStudentIds(supabase, filters.sessionLabel),
    loadSentToday(supabase, filters.sessionLabel, campaignName),
    loadReminderFlags(supabase, filters.sessionLabel),
    loadLastSentOn(supabase, filters.sessionLabel),
    loadCarryForward(supabase, filters.sessionLabel),
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
  const counts: Record<NoticeSituation, number> = { fee_due: 0, balance: 0, prevyear: 0 };
  const today = istToday();

  const wanted = filters.installments.length > 0 ? filters.installments : [...TEMPLATE_INSTALLMENTS];

  for (const row of (rows ?? []) as FinancialRow[]) {
    const totalPaid = Number(row.total_paid ?? 0);

    // Every selected installment must still carry fees — "installments 1 and 2
    // are pending" means both, not either. `pending_amount` is fees only, so a
    // family whose only debt is a late fee is correctly absent.
    const perInstallment = wanted.map((installment) => pendingFor(row, installment));
    const feeDueAmount = perInstallment.reduce((sum, amount) => sum + amount, 0);

    // Everything still owed on THIS session's four installments. Deliberately
    // not `outstanding_amount`, which silently folds in the carry-forward line
    // and would bill last year's balance inside a current-year notice.
    const balanceDue =
      Number(row.inst1_pending ?? 0) +
      Number(row.inst2_pending ?? 0) +
      Number(row.inst3_pending ?? 0) +
      Number(row.inst4_pending ?? 0);

    const carried = carryForward.get(row.student_id);
    const prevYearBalance = carried?.remaining ?? 0;

    // The two current-year notices are mutually exclusive by construction:
    // `maxTotalPaid` (1100) is the academic fee, so at or below it nothing real
    // has been received. Measured live, the overlap between them is zero.
    const nothingReceived = totalPaid <= filters.maxTotalPaid;

    // The installment filter asks a DIFFERENT question of each current-year
    // notice, on purpose.
    //
    // On `fee_due` nothing has been received, so "installments 1 and 2 are
    // pending" means both — `every`.
    //
    // On `balance` the family has paid something, and one who cleared
    // installment 1 but still owes installment 2 is exactly who the notice is
    // for, so `some`. It has to apply at all: it used to be ignored here, and
    // 87 of the 258 families on the live balance list were fully paid up on
    // installments 1 and 2, owing only 3 and 4 — ₹7,77,075 not due until
    // October and January. The office was chasing money nobody owed yet.
    //
    // `prevyear` ignores it entirely. Last year's balance has no installments.
    const qualifies: Record<NoticeSituation, boolean> = {
      fee_due: nothingReceived && perInstallment.every((amount) => amount > 0),
      balance: !nothingReceived && balanceDue > 0 && perInstallment.some((amount) => amount > 0),
      prevyear: prevYearBalance > 0,
    };

    // What this notice will actually quote.
    const dueAmount =
      filters.situation === "fee_due"
        ? feeDueAmount
        : filters.situation === "balance"
          ? balanceDue
          : prevYearBalance;

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

    // Counted here — after the guards that decide whether we could contact this
    // family at all, and BEFORE the notice filter — so every chip in the picker
    // shows who that notice could reach, not just the one already selected.
    for (const situation of SITUATION_KEYS) {
      if (qualifies[situation]) counts[situation] += 1;
    }

    // Now the selected notice. A family who owes nothing on THIS notice is not
    // "skipped by a filter", they are simply not who it is about.
    if (!qualifies[filters.situation]) {
      skipped.installmentsClear += 1;
      continue;
    }

    if (dueAmount < filters.minDueAmount) {
      skipped.belowMinimum += 1;
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
      balanceDue,
      prevYearBalance,
      prevSessionLabel: carried?.sourceSession ?? null,
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
    counts,
  };
}

const SITUATION_KEYS: readonly NoticeSituation[] = ["fee_due", "balance", "prevyear"];

/**
 * What is left of each family's carried-forward balance, and where it came from.
 *
 * A second read, because `v_workbook_student_financials` carries no
 * carry-forward column at all — and its `outstanding_amount` silently INCLUDES
 * the carry-forward line, so the figure cannot be netted out of the matview.
 *
 * `remaining_amount`, never `original_amount`: the latter ignores every payment
 * made against the balance since, and would tell a family who has cleared most
 * of last year that they still owe all of it.
 */
async function loadCarryForward(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, { remaining: number; sourceSession: string | null }>> {
  const { data, error } = await supabase
    .from("v_student_carry_forward_balances")
    .select("student_id, remaining_amount, source_session_label, status")
    .eq("target_session_label", sessionLabel)
    .neq("status", "cancelled");

  // Failing open would send a previous-session notice quoting zero.
  if (error) throw new Error(`Could not read carry-forward balances: ${error.message}`);

  const byStudent = new Map<string, { remaining: number; sourceSession: string | null }>();
  for (const row of (data ?? []) as Array<{
    student_id: string;
    remaining_amount: number | null;
    source_session_label: string | null;
  }>) {
    const existing = byStudent.get(row.student_id);
    const remaining = Number(row.remaining_amount ?? 0);
    byStudent.set(row.student_id, {
      // A student can carry more than one head forward; the notice quotes the total.
      remaining: (existing?.remaining ?? 0) + remaining,
      sourceSession: existing?.sourceSession ?? row.source_session_label,
    });
  }
  return byStudent;
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
 *
 * Deliberately NOT scoped to one campaign, unlike `loadSentToday`. Cadence asks
 * how often a family hears from us at all; per-campaign gaps would let a family
 * set to "weekly" receive three messages a week, one per notice.
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
  campaignName: string,
): Promise<Map<string, { status: string; at: string }>> {
  // Scoped to THIS campaign since 20260821170000 widened the unique index. A
  // family who got the fee-due notice this morning is still eligible for the
  // previous-session one this afternoon, and the checkbox has to say so.
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, status, created_at")
    .eq("session_label", sessionLabel)
    .eq("sent_on", istToday())
    .eq("campaign_name", campaignName);

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

/**
 * The slot values one family's notice will carry.
 *
 * Lives here rather than in the registry because it needs a `ReminderCandidate`,
 * and `campaigns.ts` must stay importable from the browser for the live
 * preview. Not in `actions.ts` either: everything a `"use server"` file exports
 * has to be an async function, and this is a pure projection.
 */
export function noticeValuesFor(
  candidate: ReminderCandidate,
  filters: ReminderFilters,
): NoticeValues {
  // Delegates rather than repeating: the preview on the screen calls the very
  // same function, so the two cannot show different messages.
  return noticeValuesFrom(candidate, filters);
}
