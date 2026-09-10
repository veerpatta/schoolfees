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
  isLateFeeSource,
  type LateFeeBasis,
  type LateFeeSource,
} from "@/modules/whatsapp/domain/late-fee";
import {
  buildInstallmentCalendar,
  DEFAULT_PRE_DUE_WINDOW_DAYS,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import {
  campaignNameFor,
  isLedgerQuotedSituation,
  noticeValuesFrom,
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  PROMISE_DUE_LOOKAHEAD_DAYS,
  TEMPLATE_INSTALLMENTS,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { campaignNamesForNotice } from "@/modules/whatsapp/domain/family-notice";
import {
  DEFAULT_MAX_TOTAL_PAID as AUDIENCE_DEFAULT_MAX_TOTAL_PAID,
  isInstallmentMatch,
  isPromiseFilter,
  isQuoteBasis,
  isTri,
  AUDIENCE_SHORTCUTS,
  NOTICE_FACT_LABELS,
  NOTICE_FACTS,
  parseIdList,
  presetFor,
  shortcutFilters,
  type AudienceShortcutKey,
  type AudienceFilters,
  type InstallmentMatch,
  type NoticeFact,
  type PromiseFilter,
  type QuoteBasis,
  type Tri,
} from "@/modules/whatsapp/domain/audience";
import { daysBetweenIsoDates } from "@/platform/helpers/date";

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

/** Re-exported from `domain/audience`, which the browser may import. */
export const DEFAULT_MAX_TOTAL_PAID = AUDIENCE_DEFAULT_MAX_TOTAL_PAID;

/**
 * A whole reminder run: who it goes to (`AudienceFilters`) and what it says.
 *
 * The two halves used to be one. `situation` gated the audience as well as
 * picking the campaign, so "send the overdue wording to the fee-due families"
 * was not expressible. Since 2026-09-08 the audience is decided by the filters
 * alone — see `domain/audience.ts` — and `situation` decides only the message.
 */
export type ReminderFilters = AudienceFilters & {
  sessionLabel: string;
  /**
   * Which notice is being sent. It no longer changes who is on the list, but it
   * still travels in the query string: the send action re-derives everything
   * from these values, and it decides which campaign name is billed.
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
  /**
   * Which of the two late-fee modes this run is in — the ledger's real figure,
   * or the amount above typed once for everybody. See `LateFeeSource`.
   *
   * In the query string like the rest of the run: the send action rebuilds
   * everything from these values, and a mode it could not see would quote a
   * different number than the office read on screen.
   */
  lateFeeSource: LateFeeSource;
  /**
   * What the SCHOOL'S POLICY charges, resolved from the live fee policy.
   *
   * Deliberately NOT in the query string — it is a fact about the school, the
   * same on every load, and putting it in a URL is how a stale bookmark starts
   * quoting last term's rate. `resolveReminderContext` supplies it.
   */
  policyLateFeeAmount: number;
  /**
   * How many days ahead a courtesy notice looks, and therefore which
   * installments the calendar calls active.
   *
   * In the query string like every other audience-changing setting: the send
   * action rebuilds the list from these same values, and a window it could not
   * see would message a different set of families than the office ticked.
   */
  preDueWindowDays: number;
};

/**
 * What a screen with nothing in its query string opens on.
 *
 * The audience half is the **Overdue** shortcut, NOT `DEFAULT_SITUATION`'s
 * preset. That is the point of the split finally showing up in the default: the
 * opening template is "Fee due" because it is the commonest wording, and the
 * opening audience is "everyone past a due date" because that is who a reminder
 * is for. Deriving the second from the first is what made the two feel welded
 * together, and it opened the screen on a narrower list (families who have paid
 * nothing at all) than the office almost always wanted.
 */
export const DEFAULT_REMINDER_FILTERS: Omit<
  ReminderFilters,
  "sessionLabel" | "lastDate" | "lateFeeAmount"
> = {
  ...shortcutFilters("overdue", {
    activeInstallments: TEMPLATE_INSTALLMENTS,
    nextInstallment: null,
  }),
  classId: null,
  includeRte: false,
  includeStudentIds: [],
  excludeStudentIds: [],
  situation: DEFAULT_SITUATION,
  language: DEFAULT_LANGUAGE,
  lateFeeBasis: DEFAULT_LATE_FEE_BASIS,
  // `fee_due` is not ledger-quoted, so its mode is the typed lever — which is
  // what a screen with nothing in its query string has always done.
  lateFeeSource: "custom",
  policyLateFeeAmount: 0,
  preDueWindowDays: DEFAULT_PRE_DUE_WINDOW_DAYS,
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
  /**
   * What the CALENDAR says is active today — installments already past their due
   * date plus any inside the pre-due window.
   *
   * Resolved here rather than in the audience so that everything downstream sees
   * one installment set: the filter, the `Installment 1 and 2` phrase in slot
   * {{4}}, and the sentence on screen explaining what was filtered. They used to
   * be able to disagree, and a message naming installments the audience had not
   * been built from is the kind of error a parent finds first.
   */
  defaultInstallments: readonly number[] = TEMPLATE_INSTALLMENTS,
  /**
   * The basis the office last put on a message, remembered by the screen. Null
   * falls back per notice. Never applied to `prevyear`, which opens on "not
   * charged" whatever was last used, because carry-forward never accrues one.
   */
  defaultLateFeeBasis: LateFeeBasis | null = null,
  /**
   * The one installment the calendar says falls due next, for the courtesy
   * notices' preset. Null when the session has no readable schedule, which
   * simply means that preset opens on the active set instead.
   */
  options: { nextInstallment?: number | null; policyLateFeeAmount?: number } = {},
): ReminderFilters {
  const number = (key: string, fallback: number) => {
    const raw = read(key);
    if (raw === null || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  /** An absent key means "take the notice's preset"; a blank one means "no limit". */
  const optionalNumber = (key: string, fallback: number | null) => {
    const raw = read(key);
    if (raw === null) return fallback;
    if (raw.trim() === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const namedSituation = isNoticeSituation(read("situation"));
  const situation = namedSituation ? (read("situation") as NoticeSituation) : DEFAULT_SITUATION;

  const presetContext = {
    activeInstallments:
      defaultInstallments.length > 0 ? defaultInstallments : TEMPLATE_INSTALLMENTS,
    nextInstallment: options.nextInstallment ?? null,
  };

  /**
   * What every filter opens on before the office touches it. An explicit query
   * parameter always wins — that is the whole point of the split — but a link
   * written before it carries none of them and must still name the same
   * families.
   *
   * Which preset depends on whether a notice was actually NAMED. A bookmark
   * saying `?situation=overdue_final` is honoured with that notice's own
   * audience. A bare `/protected/reminders` is not a link at all, so it opens
   * on the default AUDIENCE rather than on the default notice's audience —
   * otherwise the screen greeted the office with `fee_due`'s preset, which is
   * families who have paid nothing whatsoever (132 today) rather than everyone
   * who is late (345). The commonest wording and the commonest audience are
   * different questions, which is the whole reason they were separated.
   */
  const preset = namedSituation
    ? presetFor(situation, presetContext)
    : shortcutFilters("overdue", presetContext);

  /**
   * An ABSENT key means "whatever the preset says". A key that is present but
   * empty means the office unticked all four — no installment constraint at
   * all — which is a real answer and not the same thing.
   *
   * The filter form always emits the key, so unticking every box reaches here
   * as `""` rather than as nothing. Getting this wrong makes the four
   * checkboxes impossible to clear: they would spring back to the preset.
   */
  const rawInstallments = read("installments");
  const installments = (rawInstallments || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => value >= 1 && value <= 4);

  // Blank (or whitespace) is the office clearing every box. A value that HAD
  // content but no valid installment — `0,9,banana` from a hand-edited URL —
  // falls back to the preset rather than silently widening the audience to
  // everybody: garbage must not be read as a deliberate "no constraint".
  const clearedByHand = rawInstallments !== null && rawInstallments.trim() === "";
  const resolvedInstallments = clearedByHand
    ? []
    : installments.length > 0
      ? [...new Set(installments)].sort()
      : [...preset.installments];

  const pick = <T,>(key: string, guard: (value: unknown) => value is T, fallback: T): T => {
    const raw = read(key);
    return guard(raw) ? raw : fallback;
  };

  return {
    sessionLabel,
    maxTotalPaid: optionalNumber("maxTotalPaid", preset.maxTotalPaid),
    minTotalPaid: optionalNumber("minTotalPaid", preset.minTotalPaid),
    installments: resolvedInstallments,
    installmentMatch: pick<InstallmentMatch>(
      "installmentMatch",
      isInstallmentMatch,
      preset.installmentMatch,
    ),
    minDueAmount: number("minDueAmount", preset.minDueAmount),
    lateFee: pick<Tri>("lateFee", isTri, preset.lateFee),
    overdue: pick<Tri>("overdue", isTri, preset.overdue),
    carryForward: pick<Tri>("carryForward", isTri, preset.carryForward),
    promise: pick<PromiseFilter>("promise", isPromiseFilter, preset.promise),
    quote: pick<QuoteBasis>("quote", isQuoteBasis, preset.quote),
    classId: read("classId")?.trim() || null,
    includeRte: read("includeRte") === "on",
    // Named by hand, and therefore the office's most recent word on this
    // family — see `loadReminderAudience` for exactly what an include gets
    // past and what it never does.
    includeStudentIds: parseIdList(read("include")),
    excludeStudentIds: parseIdList(read("exclude")),
    // An unrecognised value falls back rather than throwing: a hand-edited URL
    // must not be able to take the screen down.
    situation,
    language: isNoticeLanguage(read("language")) ? (read("language") as NoticeLanguage) : DEFAULT_LANGUAGE,
    lastDate: read("lastDate")?.trim() || defaultLastDate,
    lateFeeAmount: number("lateFeeAmount", defaultLateFeeAmount),
    // Absent means "whatever this template did before the two modes existed":
    // the three ledger-quoted notices read the ledger, the other nine used the
    // typed lever. Every pre-2026-09-10 link lands on what it always did.
    lateFeeSource: isLateFeeSource(read("lateFeeSource"))
      ? (read("lateFeeSource") as LateFeeSource)
      : isLedgerQuotedSituation(situation)
        ? "ledger"
        : "custom",
    policyLateFeeAmount: Math.max(0, Math.round(Number(options.policyLateFeeAmount) || 0)),
    // Clamped rather than validated away: a hand-edited 999 would quietly put
    // every installment in the year on the courtesy notice.
    preDueWindowDays: Math.min(
      60,
      number("preDueWindowDays", DEFAULT_REMINDER_FILTERS.preDueWindowDays),
    ),
    lateFeeBasis: isLateFeeBasis(read("lateFeeBasis"))
      ? (read("lateFeeBasis") as LateFeeBasis)
      // Carry-forward never accrues a late fee in the ledger, so that notice
      // opens on "not charged" and quoting one is a deliberate act. Every other
      // notice opens on what the office last used, then on the policy.
      : read("situation") === "prevyear"
        ? situationFallbackBasis("prevyear")
        : (defaultLateFeeBasis ?? situationFallbackBasis(read("situation"))),
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
  /** The class's place in the school's own order, for grouping. */
  classSortOrder: number;
  /**
   * Route name as recorded. Null covers TWO different families — one that walks
   * to school, and one charged a custom amount with no route — so never read it
   * alone. `transportFeeAmount` is what separates them.
   */
  transportRoute: string | null;
  /** What this student is charged for transport, however it was arranged. */
  transportFeeAmount: number;
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
  /**
   * What the LEDGER is charging this family in late fees on passed installments.
   *
   * Read from `v_workbook_installment_balances`, never derived here. Zero for a
   * family with nothing overdue. `late_fee_applied` is the only notice that
   * quotes it, and on that notice it is not editable.
   */
  lateFeeApplied: number;
  /** Fees only on those same passed rows — `pending_amount`, never plus the fee. */
  lateFeeFeesPending: number;
  /** The installments carrying that late fee, for the notice's context line. */
  lateFeeInstallments: number[];
  /**
   * The passed installments this family still owes fees on, per the calendar
   * — `overdue_final` names these. Late fee or not: a family whose late fee
   * was waived is still overdue on the fees.
   */
  overdueInstallments: number[];
  /** The date this family gave, when their latest contact was a promise. */
  promisedOn: string | null;
  /**
   * The IST date the office spoke with the family for that promise, ISO.
   * `promise_due` reads it back to them as "spoken on".
   */
  promiseContactedOn: string | null;
  /**
   * The language THIS family reads, from `student_collection_flags`. Null means
   * they have never been asked, so the run's language applies.
   */
  preferredLanguage: NoticeLanguage | null;
  /**
   * The other parent's number, when one is on file, usable, and not the same
   * digits as the primary.
   *
   * Only reached after two delivered notices leave the family still on the list
   * — see `chooseDestinations`.
   */
  secondaryDestination: string | null;
  /** Delivered notices logged for this family this session, any campaign. */
  sentCount: number;
  /**
   * True when the office named this student by hand rather than the filters
   * finding them. Shown on the row, because it is the one line on the list a
   * filter cannot explain.
   */
  includedByHand: boolean;
  /**
   * Slots the SELECTED template needs that this family cannot fill — see
   * `missingFactsFor`. Empty for almost everybody.
   */
  missingFacts: NoticeFact[];
  /**
   * Those same facts as a sentence a person can act on, composed HERE.
   *
   * "Message needs a late fee on the ledger" tells the office what to do;
   * "Message needs 1 missing" tells them only that something is wrong. The
   * phrase is built server-side rather than in the workspace because the
   * workspace is a client component and `/protected/reminders` sits under a
   * gzip ceiling that only ratchets down — six label strings in the browser to
   * render one of them is the same trade the template bodies already lost.
   *
   * Empty string when nothing is missing.
   */
  missingFactsLabel: string;
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
  /**
   * The family has already told the office when they will pay, and that date has
   * not arrived yet.
   *
   * Held back from every notice except `promise_lapsed`. Chasing a family inside
   * their own promise window is how a promise that was going to hold stops
   * holding, and it is the office's own record saying so.
   */
  promiseOpen: number;
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
  classSortOrder: number;
  transportFeeAmount: number;
  /** The three below are carried for the collection lists, which put a paused
   * family on a teacher's sheet: they are held back from a MESSAGE, not from
   * owing the money. */
  transportRoute: string | null;
  parentName: string;
  destination: string | null;
  reason: "never" | "snoozed" | "too_soon" | "promise_open";
  cadence: ReminderCadence;
  /** When they come back, for `snoozed` and `too_soon`. */
  returnsOn: string | null;
  dueAmount: number;
};

export type ReminderFlags = {
  cadence: ReminderCadence;
  snoozedUntil: string | null;
  /** Null is the normal state and means "follow the run", not "Hindi". */
  preferredLanguage: NoticeLanguage | null;
};

export type ClassOption = { classId: string; label: string; count: number };

export type ReminderAudience = {
  candidates: ReminderCandidate[];
  skipped: ReminderSkipCounts;
  /** Students the office dropped by hand, counted so the screen can offer them back. */
  excludedByHand: number;
  /** Named, because WhatsApp can never reach these families at all. */
  unreachable: Array<{
    studentId: string;
    admissionNo: string;
    studentName: string;
    studentClass: string;
    classSortOrder: number;
    transportRoute: string | null;
    transportFeeAmount: number;
    parentName: string;
    /**
     * The number ON RECORD, unusable or absent. `/reminders/unreachable` exists
     * to get this fixed, and the office needs to see what is currently there.
     */
    phoneOnRecord: string | null;
    dueAmount: number;
    /**
     * True when this family would ALSO have survived the notice, the minimum and
     * the class filter — i.e. they belong on this collection list.
     *
     * The array itself is deliberately broader: a family with no number is
     * unreachable whichever notice is selected, and `/reminders/unreachable`
     * reads all of them. Only the collection lists filter on this flag.
     */
    matchesNotice: boolean;
  }>;
  /** Held back by a cadence or a snooze — reversible, so shown and undoable. */
  paused: PausedFamily[];
  classOptions: ClassOption[];
  /**
   * How many families each AUDIENCE SHORTCUT would reach, counted in the same
   * pass as the selected filter set.
   *
   * Keyed by shortcut, not by notice. They were keyed by notice while the
   * chips were named after notices, which is exactly the confusion this
   * replaced: a count under "Fee due" told you nothing about whether that chip
   * changed the message or the list.
   */
  counts: Record<AudienceShortcutKey, number>;
  /**
   * How many families ON THE CURRENT LIST each template would have to quote a
   * missing fact at.
   *
   * The template chips show this instead of an audience count, because that is
   * now the only thing about a template that depends on who is on the list.
   */
  noticeGaps: Record<NoticeSituation, number>;
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
  // The school's own class order — Nursery, JKG, SKG, 1..10, then the four
  // streams. Alphabetical would open a classwise list on "11 Arts".
  "sort_order",
  // Route grouping on the collection lists. Already on the matview, so these
  // are three more columns on a select that was running anyway — no join, no
  // migration. `transport_fee` is not decoration: a student charged through
  // `student_fee_overrides.custom_transport_fee_amount` has NO route, so the
  // name alone cannot tell "walks to school" from "pays Rs 14,000 a year".
  "transport_route_name",
  "transport_route_code",
  "transport_fee",
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
  sort_order: number | null;
  transport_route_name: string | null;
  transport_route_code: string | null;
  transport_fee: number | null;
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
 * Everything the filters, the quote basis and the templates can ask about one
 * family, gathered once.
 *
 * A plain struct rather than the matview row, so the three pure functions below
 * are testable without a Supabase stub and cannot drift from what the loop
 * actually computed. It replaced a twelve-boolean `qualifies` record — the
 * thing that made the audience inseparable from the message.
 */
export type CandidateFacts = {
  totalPaid: number;
  /** Fees still pending on installments 1-4, in order. Fees only, never a late fee. */
  installmentPending: [number, number, number, number];
  /** What the LEDGER is charging in late fees on passed rows. Read, never derived. */
  lateFeeApplied: number;
  /** Fees still pending on those same late-fee rows. */
  ledgerFeesPending: number;
  /** Passed installments still carrying fees, whatever the late fee is doing. */
  overdueInstallments: number[];
  overdueAmount: number;
  nextInstallmentNo: number | null;
  nextInstallmentPending: number;
  /** Everything owed across this session's four installments. Never last year's. */
  balanceDue: number;
  prevYearBalance: number;
  promisedOn: string | null;
  promiseOpen: boolean;
  promiseDueSoon: boolean;
  promiseLapsed: boolean;
};

function pendingOn(facts: CandidateFacts, installment: number): number {
  return facts.installmentPending[installment - 1] ?? 0;
}

/**
 * The figure the message will name, from the basis the office chose.
 *
 * Was a `switch (filters.situation)`. That switch is precisely why "send the
 * overdue wording to the fee-due families" could not be expressed: the amount
 * came from the template, so changing the template silently changed the money.
 *
 * `ledger_fees` quotes FEES only, never fees plus the late fee — those reach
 * the message in separate slots because the ledger keeps them in separate
 * columns, and folding them together is the first place "a late fee is not a
 * fee" would break.
 */
export function quotedAmountFor(
  quote: QuoteBasis,
  facts: CandidateFacts,
  installments: readonly number[],
): number {
  switch (quote) {
    case "selected":
      return installments.reduce((sum, installment) => sum + pendingOn(facts, installment), 0);
    case "session":
      return facts.balanceDue;
    case "overdue":
      return facts.overdueAmount;
    case "next":
      return facts.nextInstallmentPending;
    case "ledger_fees":
      return facts.ledgerFeesPending;
    case "prev_year":
      return facts.prevYearBalance;
  }
}

/** "Either" always passes; otherwise the fact has to match. */
function triMatches(rule: Tri, value: boolean): boolean {
  return rule === "any" || (rule === "yes") === value;
}

/**
 * Does this family survive the office's filters?
 *
 * Deliberately NOT in here, and both omissions are load-bearing:
 *
 * - **The class.** Class options are counted before the class filter is
 *   applied, or picking a class empties the dropdown that picked it.
 * - **`promise: "skip_open"`.** A family inside their own promise is PAUSED,
 *   not filtered — a reversible decision the office can see and undo, shown in
 *   its own list. Every other promise value is a real filter and is applied
 *   here.
 *
 * The minimum is applied by the caller, which already holds the quoted amount.
 */
export function matchesAudienceFilters(
  filters: Pick<
    AudienceFilters,
    | "installments"
    | "installmentMatch"
    | "maxTotalPaid"
    | "minTotalPaid"
    | "lateFee"
    | "overdue"
    | "carryForward"
    | "promise"
  >,
  facts: CandidateFacts,
): boolean {
  if (filters.installments.length > 0) {
    const pending = filters.installments.map((installment) => pendingOn(facts, installment));
    // "all" is "nothing has been received on any of these"; "any" is "still
    // owing on at least one". Asking the wrong one is what put 87 fully
    // paid-up families on the live balance list.
    const ok =
      filters.installmentMatch === "all"
        ? pending.every((amount) => amount > 0)
        : pending.some((amount) => amount > 0);
    if (!ok) return false;
  }

  // Inclusive ceiling — "paid so far, at most 1100" keeps a family who paid
  // exactly the academic fee, which is the whole point of that threshold.
  if (filters.maxTotalPaid !== null && facts.totalPaid > filters.maxTotalPaid) return false;
  // EXCLUSIVE floor — "paid so far, over 1100". The two are complements, so a
  // family cannot fall in both bands or in neither.
  if (filters.minTotalPaid !== null && facts.totalPaid <= filters.minTotalPaid) return false;

  if (!triMatches(filters.lateFee, facts.lateFeeApplied > 0)) return false;
  if (!triMatches(filters.overdue, facts.overdueInstallments.length > 0)) return false;
  if (!triMatches(filters.carryForward, facts.prevYearBalance > 0)) return false;

  switch (filters.promise) {
    case "any":
    case "skip_open":
      break;
    case "open":
      if (!facts.promiseOpen) return false;
      break;
    case "due_soon":
      if (!facts.promiseDueSoon) return false;
      break;
    case "lapsed":
      if (!facts.promiseLapsed) return false;
      break;
    case "none":
      if (facts.promisedOn) return false;
      break;
  }

  return true;
}

/**
 * The missing slots as a sentence, e.g. "a late fee on the ledger".
 *
 * Composed here, in a `server-only` module, so the six labels never reach the
 * browser — see `ReminderCandidate.missingFactsLabel`.
 */
export function describeMissingFacts(missing: readonly NoticeFact[]): string {
  if (missing.length === 0) return "";
  const named = missing.map((fact) => NOTICE_FACT_LABELS[fact]);
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/**
 * Which of a template's slots this family cannot fill.
 *
 * The price of letting any template reach any audience: "Late fee applied" sent
 * to a family with no late fee renders ₹0, and "Promise due" to a family with
 * no promise renders a blank date. The office asked for the freedom and there
 * are real uses for it — a waiver notice to a family about to accrue one — so
 * this warns rather than refuses. It must never do so silently.
 */
export function missingFactsFor(
  situation: NoticeSituation,
  facts: CandidateFacts,
  quotedAmount: number,
  /**
   * Which late-fee mode the run is in.
   *
   * Load-bearing, and its absence was a bug for one day: this read
   * `facts.lateFeeApplied` — the LEDGER's figure — whatever the run was doing.
   * In `custom` mode the message never touches the ledger, it prints the amount
   * the office typed, so "this family has no late fee" is not a problem the
   * message has. It reported 89 of 89 families broken on a run that would have
   * printed ₹4,000 to every one of them.
   */
  lateFeeSource: LateFeeSource = "ledger",
): NoticeFact[] {
  const has: Record<NoticeFact, boolean> = {
    // Custom mode supplies the number itself, so there is nothing to be missing.
    late_fee: lateFeeSource === "custom" || facts.lateFeeApplied > 0,
    promise: Boolean(facts.promisedOn),
    prev_year: facts.prevYearBalance > 0,
    amount: quotedAmount > 0,
  };
  return NOTICE_FACTS[situation].filter((fact) => !has[fact]);
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
  /**
   * What today makes of the fee calendar.
   *
   * Passed in rather than read here: the schedule comes from
   * `getFeePolicySummary`, and a `domain/` file reaching into `fees/data` is the
   * cross-layer import `npm run quality:architecture` exists to stop. Both
   * callers already hold the policy.
   *
   * An empty calendar is a valid state — a session with no schedule yet — and
   * simply means the calendar-driven notices reach nobody.
   */
  calendar: InstallmentCalendar = buildInstallmentCalendar({
    schedule: [],
    today: istToday(),
    windowDays: filters.preDueWindowDays,
  }),
): Promise<ReminderAudience> {
  // `campaignNameFor`, not `campaignFor`: the screen must be able to SHOW an
  // unapproved notice's audience and count while refusing to send it. Falling
  // back to a name that cannot match keeps `sentToday` empty rather than
  // throwing here and blanking the whole page.
  const campaignName = campaignNameFor(filters.situation, filters.language) ?? "";

  const [
    { data: rows, error },
    noCallIds,
    sentToday,
    reminderFlags,
    lastSent,
    carryForward,
    appliedLateFees,
    promises,
  ] = await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select(SELECT_COLUMNS)
      .eq("session_label", filters.sessionLabel),
    loadNoCallStudentIds(supabase, filters.sessionLabel),
    // Both names this notice can log under today — see `campaignNamesForNotice`.
    loadSentToday(
      supabase,
      filters.sessionLabel,
      campaignName ? campaignNamesForNotice(filters.situation, filters.language) : [],
    ),
    loadReminderFlags(supabase, filters.sessionLabel),
    loadLastSentOn(supabase, filters.sessionLabel),
    loadCarryForward(supabase, filters.sessionLabel),
    loadAppliedLateFees(supabase, filters.sessionLabel, istToday()),
    loadLatestPromises(supabase, filters.sessionLabel),
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
    promiseOpen: 0,
  };
  const unreachable: ReminderAudience["unreachable"] = [];
  const paused: PausedFamily[] = [];
  const candidates: ReminderCandidate[] = [];
  const classCounts = new Map<string, ClassOption>();
  const counts = Object.fromEntries(
    AUDIENCE_SHORTCUTS.map((entry) => [entry.key, 0]),
  ) as Record<AudienceShortcutKey, number>;
  // How many of the final candidates each template would have to quote a
  // missing fact at. Zero for almost every combination; non-zero is what the
  // template chips warn about now that they no longer gate the audience.
  const noticeGaps = Object.fromEntries(
    SITUATION_KEYS.map((situation) => [situation, 0]),
  ) as Record<NoticeSituation, number>;
  let excludedByHand = 0;
  const today = istToday();

  // The one installment the courtesy presets are about — window-gated, because
  // whether a polite note is APPROPRIATE is a question about timing.
  const nextDue = calendar.next;
  /**
   * Which installment actually comes next, whatever the window says.
   *
   * What `quote: "next"` resolves against. Using `calendar.next` here made the
   * "Not late yet" audience empty for about 320 days a year: with a 10-day
   * window and installment 3 forty days out, `next` is null, the quoted amount
   * was ₹0, and `minDueAmount: 1` then dropped every family in it.
   */
  const nextAhead = calendar.nextAhead;

  /**
   * What each preset needs to know about today, resolved once.
   *
   * The same values `parseReminderFilters` used to build the SELECTED filter
   * set, so a preset's count and the list you get by clicking it agree.
   */
  const presetContext = {
    activeInstallments:
      calendar.active.length > 0 ? calendar.active : [...TEMPLATE_INSTALLMENTS],
    nextInstallment: nextDue?.installmentNo ?? null,
  };

  for (const row of (rows ?? []) as FinancialRow[]) {
    const totalPaid = Number(row.total_paid ?? 0);

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

    // What the LEDGER is charging this family in late fees, read from
    // `v_workbook_installment_balances`. Never derived here: the view is the only
    // thing that knows about waivers and the accrual rule at once.
    const applied = appliedLateFees.get(row.student_id);
    const lateFeeApplied = applied?.lateFeePending ?? 0;

    // The family's own last word, from the call queue's contact log.
    const promise = promises.get(row.student_id);
    const promisedOn = promise?.promisedOn ?? null;
    const promiseLapsed = Boolean(promisedOn && promisedOn < today);
    const promiseOpen = Boolean(promisedOn && promisedOn >= today);
    // Inside the promise AND close enough to read it back: today or tomorrow.
    // Earlier than that the office chose to trust the family and leave them
    // alone; later than that it is `promise_lapsed`'s business.
    const promiseDaysAway = promisedOn ? daysBetweenIsoDates(today, promisedOn) : null;
    const promiseDueSoon =
      promiseOpen && promiseDaysAway !== null && promiseDaysAway <= PROMISE_DUE_LOOKAHEAD_DAYS;

    // The passed installments this family still owes FEES on, whatever the
    // late fee is doing. A waived late fee does not take a family off this
    // list — and a late fee with no fees behind it does not put them on it.
    // `calendar.overdue` is STRICTLY past, not `calendar.passed`. Those differ
    // by exactly the installment due today, and the ledger, Defaulters, the
    // dashboard and the late-fee rule all agree today's row is not yet
    // overdue — the flat late fee starts tomorrow. Reading `passed` here is
    // what let this screen tell a parent they were late on the one day they
    // were not.
    const overdueInstallments = calendar.overdue.filter(
      (installment) => pendingFor(row, installment) > 0,
    );
    const overdueAmount = overdueInstallments.reduce(
      (sum, installment) => sum + pendingFor(row, installment),
      0,
    );

    const upcomingPending = nextAhead ? pendingFor(row, nextAhead.installmentNo) : 0;

    /**
     * Everything the filters and the templates can ask about this family, in
     * one struct.
     *
     * Built once and read four times: by the selected filter set, by each
     * notice's preset (for the counts on the preset row), by the quote basis,
     * and by the template compatibility check. It used to be twelve booleans in
     * a `qualifies` record, which is exactly why the audience could not be
     * separated from the message.
     */
    const facts: CandidateFacts = {
      totalPaid,
      installmentPending: [
        Number(row.inst1_pending ?? 0),
        Number(row.inst2_pending ?? 0),
        Number(row.inst3_pending ?? 0),
        Number(row.inst4_pending ?? 0),
      ],
      lateFeeApplied,
      ledgerFeesPending: applied?.feesPending ?? 0,
      overdueInstallments,
      overdueAmount,
      nextInstallmentNo: nextAhead?.installmentNo ?? null,
      nextInstallmentPending: upcomingPending,
      balanceDue,
      prevYearBalance,
      promisedOn,
      promiseOpen,
      promiseDueSoon,
      promiseLapsed,
    };

    // What the message will actually name. A basis the office chose, not a
    // `switch` on which template is going out — that switch is what made the
    // two inseparable. The ledger-quoted bases still quote FEES only, never
    // fees plus the late fee: those reach the message in separate slots because
    // the ledger keeps them in separate columns.
    const dueAmount = quotedAmountFor(filters.quote, facts, filters.installments);

    // Does this family survive the filters the office actually set? The class
    // and the open-promise hold-back are deliberately NOT in here — see
    // `matchesAudienceFilters`.
    const matchesFilters =
      matchesAudienceFilters(filters, facts) && dueAmount >= filters.minDueAmount;

    // Named by hand on the screen. An include joins the list whatever the
    // filters say, and whatever the cadence says: naming a family IS the more
    // recent decision, and a "too soon for their cadence" hold-back the office
    // has just overruled by typing their admission number is not a hold-back.
    const namedByHand = filters.includeStudentIds.includes(row.student_id);

    // Dropped by hand. Wins over everything, including an include, and applied
    // before the counters so an excluded family is not reported as skipped by a
    // filter they in fact matched.
    if (filters.excludeStudentIds.includes(row.student_id)) {
      excludedByHand += 1;
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
    if (!filters.includeRte && /RTE/i.test(admissionNo)) {
      skipped.rteStudent += 1;
      continue;
    }

    const studentClass = row.class_label ?? "";
    const transportRoute = row.transport_route_name?.trim() || null;
    const transportFeeAmount = Number(row.transport_fee ?? 0);
    const classSortOrder = Number(row.sort_order ?? 0);
    const parentName = titleCase(row.father_name) || "अभिभावक";
    const fatherDestination = toWhatsappDestination(row.father_phone);
    const motherDestination = toWhatsappDestination(row.mother_phone);
    const destination = fatherDestination ?? motherDestination;
    if (!destination) {
      if (!row.father_phone && !row.mother_phone) {
        skipped.noPhoneOnRecord += 1;
        unreachable.push({
          // Carried so the screen can link straight to the edit page. Fixing the
          // number is the only thing that gets this family off the list, and
          // making somebody search for them by name is how it stays undone.
          studentId: row.student_id,
          admissionNo,
          studentName: titleCase(row.student_name),
          studentClass,
          classSortOrder,
          transportRoute,
          transportFeeAmount,
          parentName,
          phoneOnRecord: row.father_phone ?? row.mother_phone ?? null,
          dueAmount,
          // Everything this needs is already in scope — the facts and the
          // quoted amount are computed above the phone check — so the flag
          // costs nothing and, critically, changes nothing about who lands in
          // the array. `/reminders/unreachable` still reads all of them.
          matchesNotice:
            (matchesFilters || namedByHand) &&
            (!filters.classId || row.class_id === filters.classId),
        });
      } else {
        skipped.phoneUnusable += 1;
      }
      continue;
    }

    // Counted here — after the guards that decide whether we could contact this
    // family at all, and BEFORE the office's own filters — so every preset
    // button shows who it would reach, not just the one already applied.
    //
    // A PRESET count, not a notice count. Since the template stopped gating the
    // audience, "how many does Balance reach" is only answerable as "how many
    // would Balance's preset reach", which is what these buttons put back.
    for (const entry of AUDIENCE_SHORTCUTS) {
      const shortcut = shortcutFilters(entry.key, presetContext);
      const shortcutAmount = quotedAmountFor(shortcut.quote, facts, shortcut.installments);
      if (
        matchesAudienceFilters(shortcut, facts) &&
        shortcutAmount >= shortcut.minDueAmount
      ) {
        counts[entry.key] += 1;
      }
    }

    // Now the office's own filters. A family who does not match them is not
    // "skipped by the notice" any more — the notice has no say in it.
    if (!matchesFilters && !namedByHand) {
      // Split so the sentence under the list can say WHICH filter did it. Below
      // the minimum is the one staff most often set by accident.
      //
      // `dueAmount > 0` first, and it is not cosmetic. The default basis is now
      // the OVERDUE figure, which is ₹0 for every family who owes nothing late
      // — so without this guard each of them was reported as "below the minimum
      // you set", and the office reads that as a threshold they got wrong. A
      // family who owes nothing on the chosen basis is clear; "below minimum"
      // is for a family who owes something, just less than was asked for.
      if (dueAmount > 0 && dueAmount < filters.minDueAmount) skipped.belowMinimum += 1;
      else skipped.installmentsClear += 1;
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
    const history = lastSent.get(row.student_id) ?? null;
    const lastSentOn = history?.lastSentOn ?? null;

    const pause = (reason: PausedFamily["reason"], returnsOn: string | null) => {
      paused.push({
        studentId: row.student_id,
        admissionNo,
        studentName: titleCase(row.student_name),
        studentClass,
        classSortOrder,
        transportRoute,
        transportFeeAmount,
        parentName,
        destination,
        reason,
        cadence,
        returnsOn,
        dueAmount,
      });
    };

    // Everything from here to the push is a HUMAN decision the office can see
    // and reverse, not the ledger saying nothing is owed. Naming a family by
    // hand overrules all of it — that is the more recent human decision, and a
    // cadence hold-back the office has just typed an admission number to get
    // past is not a hold-back.
    if (!namedByHand) {
      // The family has already said when they will pay, and that day has not
      // come. `skip_open` is the promise filter's default, so this still holds
      // on every notice it always held on; choosing any other promise filter is
      // the office saying it means to chase inside the window.
      if (promiseOpen && filters.promise === "skip_open") {
        skipped.promiseOpen += 1;
        pause("promise_open", promisedOn);
        continue;
      }

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
    }

    candidates.push({
      studentId: row.student_id,
      admissionNo,
      studentName: titleCase(row.student_name),
      parentName,
      studentClass,
      classId: row.class_id,
      classSortOrder,
      transportRoute,
      transportFeeAmount,
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
      lateFeeApplied,
      lateFeeFeesPending: applied?.feesPending ?? 0,
      lateFeeInstallments: applied?.installments ?? [],
      overdueInstallments,
      promisedOn,
      promiseContactedOn: istDateOf(promise?.contactedAt ?? null),
      preferredLanguage: flags?.preferredLanguage ?? null,
      // The number NOT being used. `destination` already picked the better of
      // the two, so this is whichever one it did not take.
      secondaryDestination:
        [fatherDestination, motherDestination].find(
          (candidateNumber) => candidateNumber && candidateNumber !== destination,
        ) ?? null,
      sentCount: history?.sentCount ?? 0,
      includedByHand: namedByHand,
      // Which of the SELECTED template's slots this family cannot fill. Empty
      // for almost everybody; non-empty is the price of letting any template go
      // to any audience, and the screen says so rather than sending ₹0.
      missingFacts: missingFactsFor(filters.situation, facts, dueAmount, filters.lateFeeSource),
      missingFactsLabel: describeMissingFacts(
        missingFactsFor(filters.situation, facts, dueAmount, filters.lateFeeSource),
      ),
    });

    for (const situation of SITUATION_KEYS) {
      if (missingFactsFor(situation, facts, dueAmount, filters.lateFeeSource).length > 0) {
        noticeGaps[situation] += 1;
      }
    }
  }

  candidates.sort((left, right) => right.dueAmount - left.dueAmount);
  paused.sort((left, right) => right.dueAmount - left.dueAmount);

  return {
    candidates,
    skipped,
    excludedByHand,
    unreachable,
    paused,
    classOptions: [...classCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
    counts,
    noticeGaps,
  };
}

const SITUATION_KEYS: readonly NoticeSituation[] = [
  "upcoming",
  "upcoming_final",
  "fee_due",
  "balance",
  "overdue_final",
  "late_fee_applied",
  "late_fee_waiver",
  "waiver_last_call",
  "promise_due",
  "promise_lapsed",
  "exam_clearance",
  "prevyear",
];

/**
 * What the LEDGER is charging in late fees, per student, on installments whose
 * due date has passed.
 *
 * Read straight out of `v_workbook_installment_balances` and never recomputed
 * here. The late fee is one of the few figures in this app that TypeScript must
 * not derive: `waive_late_fee` learned the same lesson from the other side, by
 * reading a matview that stores 0 for a fee that is still accruing. The view is
 * the only thing that knows about waivers, carry-forward rows charging zero, and
 * the candidate-aware accrual rule at once.
 *
 * Scoped to `late_fee_pending > 0`, so a family whose late fee has been waived
 * or paid is absent rather than present with a zero — the notice is about a fee
 * that is on the account right now.
 */
async function loadAppliedLateFees(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  today: string,
): Promise<Map<string, AppliedLateFee>> {
  const { data, error } = await supabase
    .from("v_workbook_installment_balances")
    .select(
      "student_id, installment_no, due_date, pending_amount, late_fee_pending, late_fee_status, total_pending, is_carry_forward",
    )
    .eq("session_label", sessionLabel)
    .gt("late_fee_pending", 0);

  // Failing open would send a "late fee applied" notice quoting nothing, which
  // is a message a parent would rightly bring to the counter.
  if (error) throw new Error(`Could not read applied late fees: ${error.message}`);

  const byStudent = new Map<string, AppliedLateFee>();
  for (const row of (data ?? []) as Array<{
    student_id: string;
    installment_no: number | null;
    due_date: string | null;
    pending_amount: number | null;
    late_fee_pending: number | null;
    late_fee_status: string | null;
    total_pending: number | null;
    is_carry_forward: boolean | null;
  }>) {
    // Carry-forward rows carry a late-fee rate of 0 deliberately; one showing a
    // pending late fee would be a data fault, not an audience.
    if (row.is_carry_forward) continue;
    // Only what the calendar agrees is OVERDUE — strictly past, matching
    // `calendar.overdue` and the ledger. This is the second copy of that one
    // boundary, and it moved from `> today` to `>= today` with the first: a
    // late fee cannot exist on its own due date, because the flat charge starts
    // the day after. In practice no such row is ever returned, which is exactly
    // why this would have sat here disagreeing with the calendar unnoticed.
    const dueDate = String(row.due_date ?? "");
    if (!dueDate || dueDate >= today) continue;

    const installmentNo = Number(row.installment_no ?? 0);
    const lateFee = Number(row.late_fee_pending ?? 0);
    const fees = Number(row.pending_amount ?? 0);
    const existing = byStudent.get(row.student_id);

    byStudent.set(row.student_id, {
      // A family can be late on more than one installment; the notice quotes
      // the sum of what is actually charged.
      lateFeePending: (existing?.lateFeePending ?? 0) + lateFee,
      feesPending: (existing?.feesPending ?? 0) + fees,
      totalPending:
        (existing?.totalPending ?? 0) + Number(row.total_pending ?? fees + lateFee),
      // The most recent passed installment names the notice.
      installments: [...(existing?.installments ?? []), installmentNo]
        .filter((no) => no > 0)
        .sort((a, b) => a - b),
      statuses: [...(existing?.statuses ?? []), String(row.late_fee_status ?? "none")],
    });
  }
  return byStudent;
}

export type AppliedLateFee = {
  /** `late_fee_pending`, summed across passed installments. Fees are NOT in here. */
  lateFeePending: number;
  /** `pending_amount` on those same rows — fees only, per the ledger's split. */
  feesPending: number;
  /** `total_pending` — the one figure that is legitimately a sum. */
  totalPending: number;
  installments: number[];
  statuses: string[];
};

/**
 * The latest recorded promise per student, whether or not it has come due.
 *
 * `defaulter_contacts` is append-only, so "the family's position" is the most
 * recent row and nothing else. `snooze_until` carries the promised date when the
 * outcome is `promised_pay` — the same column the call queue reads, rather than
 * a second promise store that would disagree with the one the collectors use.
 *
 * A family whose latest contact is anything else has no live promise, even if
 * they promised last month: a later "no answer" is the office recording that the
 * promise did not hold.
 */
async function loadLatestPromises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, PromiseState>> {
  const { data, error } = await supabase
    .from("defaulter_contacts")
    .select("student_id, outcome, snooze_until, contacted_at")
    .eq("session_label", sessionLabel)
    .order("contacted_at", { ascending: false });

  // Failing open would message families who have already told the office when
  // they will pay — the single fastest way to lose a promise that was holding.
  if (error) throw new Error(`Could not read contact history: ${error.message}`);

  const latest = new Map<string, PromiseState>();
  for (const row of (data ?? []) as Array<{
    student_id: string;
    outcome: string | null;
    snooze_until: string | null;
    contacted_at: string | null;
  }>) {
    // Ordered newest-first, so the first row seen per student is the latest.
    if (latest.has(row.student_id)) continue;
    latest.set(row.student_id, {
      outcome: String(row.outcome ?? ""),
      promisedOn: row.outcome === "promised_pay" ? row.snooze_until : null,
      contactedAt: row.contacted_at,
    });
  }
  return latest;
}

export type PromiseState = {
  outcome: string;
  /** ISO date the family gave, only when the latest outcome is `promised_pay`. */
  promisedOn: string | null;
  contactedAt: string | null;
};

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
    .select("student_id, whatsapp_cadence, whatsapp_snoozed_until, whatsapp_language")
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
        whatsapp_language: string | null;
      }>
    ).map((row) => [
      row.student_id,
      {
        cadence: row.whatsapp_cadence ?? DEFAULT_CADENCE,
        snoozedUntil: row.whatsapp_snoozed_until,
        // Validated rather than cast: a value the check constraint somehow let
        // through must fall back to the run, not name a campaign that does not
        // exist.
        preferredLanguage: isNoticeLanguage(row.whatsapp_language)
          ? (row.whatsapp_language as NoticeLanguage)
          : null,
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
): Promise<Map<string, { lastSentOn: string; sentCount: number }>> {
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, sent_on")
    .eq("session_label", sessionLabel)
    .eq("status", "sent")
    .order("sent_on", { ascending: false });

  if (error) throw new Error(`Could not read the send history: ${error.message}`);

  const latest = new Map<string, { lastSentOn: string; sentCount: number }>();
  for (const row of (data ?? []) as Array<{ student_id: string; sent_on: string }>) {
    const existing = latest.get(row.student_id);
    if (existing) {
      existing.sentCount += 1;
      continue;
    }
    // Rows arrive newest-first, so the first one seen is the latest.
    latest.set(row.student_id, { lastSentOn: row.sent_on, sentCount: 1 });
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

/**
 * The IST calendar date of a timestamp, or null when it cannot be read.
 *
 * `defaulter_contacts.contacted_at` is a UTC timestamp; a call logged at 11 pm
 * IST is the next day in UTC, and "spoken on" must name the day the office
 * remembers.
 */
export function istDateOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function loadSentToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  campaignNames: readonly string[],
): Promise<Map<string, { status: string; at: string }>> {
  // Scoped to THIS notice since 20260821170000 widened the unique index. A
  // family who got the fee-due notice this morning is still eligible for the
  // previous-session one this afternoon, and the checkbox has to say so.
  //
  // A notice, not a campaign: since 2026-09-04 one notice logs under TWO names
  // — the per-child campaign for a one-child phone, the family campaign for a
  // phone with siblings — and a family messaged under one must not read as
  // un-contacted under the other. The unique index only ever sees one name;
  // this read is what sees both.
  if (campaignNames.length === 0) return new Map();
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    .select("student_id, status, created_at")
    .eq("session_label", sessionLabel)
    .eq("sent_on", istToday())
    .in("campaign_name", campaignNames);

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
