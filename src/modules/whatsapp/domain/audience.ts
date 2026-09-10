/**
 * WHO gets a reminder, stated as filters rather than inferred from WHICH
 * message is going out.
 *
 * Until 2026-09-08 the notice did both jobs. `situation` picked the campaign
 * AND gated the audience — `qualifies[situation]` in `fee-reminders.ts` — so
 * "Fee due" meant 92 families, "Balance" meant 196 and "Overdue final" meant
 * 299, and there was no way to say "send the overdue wording to the 92". Worse,
 * `SITUATION_FILTERS` HID the installment, paid-so-far and minimum controls on
 * any notice whose rule ignored them, so the office could not even see the
 * levers it was not allowed to pull.
 *
 * The split is now explicit:
 *
 * - **The template decides what the message SAYS.** Nothing else.
 * - **These filters decide who it GOES TO.** Every one of them applies on every
 *   template, always visible, always overridable.
 * - **`quote` decides which figure the message names.** It used to be a
 *   `switch` on the situation, which is exactly why the two could not be
 *   separated.
 *
 * The notices keep their old audiences as PRESETS (`presetFor`). An absent
 * query parameter falls back to the selected notice's preset, so every link
 * that existed before this change still resolves to the same families and the
 * screen still opens on something sensible. An explicit parameter always wins.
 *
 * Browser-safe on purpose — no `server-only`, no Supabase, no `fetch`. The
 * notice picker, the audience builder and the collection-list links all need to
 * build the same query string, and a fifth copy of "which keys travel" is how a
 * teacher's sheet ends up naming families the send screen never showed.
 */

import { formatInr } from "@/platform/helpers/currency";
import type { NoticeSituation } from "@/modules/whatsapp/domain/campaigns";

/**
 * Whether EVERY named installment must still carry fees, or any one of them.
 *
 * Not decoration. "Nothing has been received" (`all`) and "still owing on one of
 * these" (`any`) are different questions, and asking the wrong one is what put
 * 87 fully-paid-up families on the live balance list, chased for installments
 * that were not due for another two months.
 */
export type InstallmentMatch = "all" | "any";

/** A yes / no / don't-care fact about a family. */
export type Tri = "any" | "yes" | "no";

/**
 * What the office's own contact log says about this family's last promise.
 *
 * `skip_open` is the default and is NOT the same as `any`: a family who has
 * already told the office when they will pay is held back, because chasing
 * inside their own promise window is how a promise that was going to hold stops
 * holding. `any` is the deliberate override.
 */
export type PromiseFilter = "skip_open" | "any" | "open" | "due_soon" | "lapsed" | "none";

/**
 * Which figure the message names.
 *
 * Was a `switch (filters.situation)` buried in `loadReminderAudience`. Lifting
 * it out is what makes "any template to any audience" safe: the overdue wording
 * sent to a fee-due audience can still quote the fee-due figure, because the
 * two are now separate choices rather than one.
 */
export type QuoteBasis =
  /** Fees still pending on the installments named in the filter. */
  | "selected"
  /** Everything still owed across this session's four installments. */
  | "session"
  /** Fees still pending on installments whose due date has passed. */
  | "overdue"
  /** Fees on the one installment the calendar says falls due next. */
  | "next"
  /** Fees on the rows the ledger is charging a late fee on. */
  | "ledger_fees"
  /** What is left of last session's carried-forward balance. */
  | "prev_year";

/**
 * Ordered with the default first, which is also the honest one.
 *
 * "Whole session balance" is second-to-last on purpose: on the live ledger it
 * quotes ₹85,59,066 against ₹27,85,517 actually overdue, because installments 3
 * and 4 are inside it. It stays available — a parent settling the year in one
 * go needs it — but it is no longer what the screen reaches for by default.
 */
export const QUOTE_BASES = [
  { value: "overdue", label: "What is overdue" },
  { value: "next", label: "The next installment due" },
  { value: "selected", label: "Fees on the selected installments" },
  { value: "ledger_fees", label: "Fees on the late-fee rows" },
  { value: "prev_year", label: "Last session's carry-forward" },
  { value: "session", label: "Whole session balance" },
] as const satisfies ReadonlyArray<{ value: QuoteBasis; label: string }>;

export const INSTALLMENT_MATCHES = [
  { value: "all", label: "all of them pending" },
  { value: "any", label: "any of them pending" },
] as const satisfies ReadonlyArray<{ value: InstallmentMatch; label: string }>;

/**
 * The overdue filter's own words, because "Either / Yes / No" is not what the
 * office reads for this anywhere else in the app.
 *
 * Lifted verbatim from the Defaulters screen ("Overdue only" / "All open dues")
 * and the student list ("Not due yet"), so the same question is asked in the
 * same words on both surfaces. The reminders screen used to say "Past a due
 * date", a phrase that existed nowhere else.
 */
export const OVERDUE_OPTIONS = [
  { value: "yes", label: "Overdue only" },
  { value: "any", label: "All open dues" },
  { value: "no", label: "Not due yet" },
] as const satisfies ReadonlyArray<{ value: Tri; label: string }>;

export const TRI_OPTIONS = [
  { value: "any", label: "Either" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const satisfies ReadonlyArray<{ value: Tri; label: string }>;

export const PROMISE_OPTIONS = [
  { value: "skip_open", label: "Skip families inside a promise" },
  { value: "any", label: "Ignore promises entirely" },
  { value: "due_soon", label: "Promise falls due today or tomorrow" },
  { value: "lapsed", label: "Promise has lapsed" },
  { value: "open", label: "Inside an open promise" },
  { value: "none", label: "No promise on record" },
] as const satisfies ReadonlyArray<{ value: PromiseFilter; label: string }>;

export function isInstallmentMatch(value: unknown): value is InstallmentMatch {
  return value === "all" || value === "any";
}

export function isTri(value: unknown): value is Tri {
  return value === "any" || value === "yes" || value === "no";
}

export function isPromiseFilter(value: unknown): value is PromiseFilter {
  return (
    typeof value === "string" &&
    PROMISE_OPTIONS.some((entry) => entry.value === value)
  );
}

export function isQuoteBasis(value: unknown): value is QuoteBasis {
  return typeof value === "string" && QUOTE_BASES.some((entry) => entry.value === value);
}

/**
 * The audience half of a reminder run, with nothing about the message in it.
 *
 * `ReminderFilters` in `fee-reminders.ts` structurally satisfies this — the two
 * are deliberately not one type, because this one has to be importable from the
 * browser and that one is `server-only`.
 */
export type AudienceFilters = {
  installments: number[];
  installmentMatch: InstallmentMatch;
  /** Null means no ceiling — the office is not splitting on what was received. */
  maxTotalPaid: number | null;
  /** Null means no floor. Set, it means "has actually paid something". */
  minTotalPaid: number | null;
  /** The quoted figure must be at least this. Zero lets a nil quote through. */
  minDueAmount: number;
  /** Is the LEDGER charging a late fee on any passed installment? */
  lateFee: Tri;
  /** Are fees still pending on an installment whose due date has gone? */
  overdue: Tri;
  /** Is there a balance carried forward from last session? */
  carryForward: Tri;
  promise: PromiseFilter;
  quote: QuoteBasis;
  classId: string | null;
  includeRte: boolean;
  /**
   * Students the office named by hand. They join the list whatever the filters
   * say — and whatever the cadence says, because naming a family IS the more
   * recent decision.
   *
   * What an include does NOT get past: not on the roll and never paid, flagged
   * no-call, or no usable number. Those are not filters, they are reasons this
   * family cannot be messaged at all.
   */
  includeStudentIds: string[];
  /** Students dropped by hand. Wins over everything, including an include. */
  excludeStudentIds: string[];
};

/**
 * The audience each notice used to define for itself, kept as a one-tap preset.
 *
 * Every entry here reproduces what `qualifies[situation]` did before the split,
 * so an existing link, a saved campaign and yesterday's bookmark all still name
 * the same families. Two deliberate differences, both narrowings that only
 * remove a message nobody should have been sent:
 *
 * - `upcoming_final` no longer carries the global three-day window. That was a
 *   property of the RUN, not of a family, so it belonged on the template's
 *   compatibility note rather than in the audience. The chip says so.
 * - `promise_due` and `promise_lapsed` require the quoted figure to clear the
 *   minimum like every other notice, rather than accepting a family whose
 *   session balance is nil because their debt is last year's.
 *
 * `activeInstallments` is the calendar's own answer for today, passed in rather
 * than hardcoded — the same rule `parseReminderFilters` follows, and for the
 * same reason: the filter and the "Installment 1 and 2" phrase in the message
 * must not be able to disagree.
 */
export function presetFor(
  situation: NoticeSituation,
  args: { activeInstallments: readonly number[]; nextInstallment: number | null },
): Omit<AudienceFilters, "classId" | "includeRte" | "includeStudentIds" | "excludeStudentIds"> {
  const active = [...args.activeInstallments];

  // An EMPTY installment set means "no installment constraint", which is what
  // most of these notices had: the old engine only consulted `filters.installments`
  // on `fee_due`, `balance` and `exam_clearance`. Giving the other nine the
  // active pair would silently narrow them — `prevyear` in particular, whose
  // balance is last session's and has no installments at all.
  const base = {
    installments: [] as number[],
    installmentMatch: "all" as InstallmentMatch,
    maxTotalPaid: null,
    minTotalPaid: null,
    minDueAmount: 1,
    lateFee: "any" as Tri,
    // A REMINDER IS ABOUT MONEY THAT IS LATE. Every preset starts overdue-only
    // and quotes the overdue figure; the four situations that legitimately mean
    // something else say so explicitly below.
    //
    // Until 2026-09-10 this was `overdue: "any"` with `quote: "selected"`, and
    // the consequence was not subtle: on the live 2026-27 ledger the screen
    // could ask 479 families for ₹85,59,066 when only 345 were late and only
    // ₹27,85,517 was past a due date — installments 3 and 4 are not due until
    // 20 Oct and 20 Jan. The office was chasing money the school had not yet
    // asked for.
    overdue: "yes" as Tri,
    carryForward: "any" as Tri,
    promise: "skip_open" as PromiseFilter,
    quote: "overdue" as QuoteBasis,
  };

  switch (situation) {
    // A courtesy note about ONE installment that has not fallen due yet, and
    // nothing behind it. "Nothing overdue" is the whole difference between this
    // and `fee_due` — a family already late on installment 2 must get the
    // late-fee notice, not a polite note about installment 3.
    case "upcoming":
    case "upcoming_final":
      // No installment filter: `quote: "next"` plus the minimum already says
      // "fees still on the one falling due", which is what the old rule meant.
      return { ...base, overdue: "no", lateFee: "no", quote: "next" };

    // Nothing received beyond the academic fee, and EVERY selected installment
    // still pending.
    // Nothing received beyond the academic fee, and something already late.
    //
    // The old rule was "every ACTIVE installment still fully pending", which
    // had no time component at all: a family could match it on installments the
    // school had not asked for yet. Overdue replaces the installment test —
    // being late is the thing that earns a reminder, not which rows are open.
    case "fee_due":
      return { ...base, maxTotalPaid: DEFAULT_MAX_TOTAL_PAID };

    // Something received, and still late on something.
    //
    // Keeps `quote: "session"` against the overdue-only base, and this one is
    // not a preference. The approved body PRINTS the word: "Balance due: Rs.
    // {{5}}" in English, "शेष बकाया: रु. {{5}}" in Hindi. Quoting the overdue
    // subtotal under the label "balance" would put a figure in front of a
    // parent that does not mean what the sentence around it says, and they
    // bring that to the counter. The audience is narrowed to families who are
    // actually late (inherited `overdue: "yes"`); the ASK stays the balance,
    // because the balance is the word the template uses.
    case "balance":
      return {
        ...base,
        minTotalPaid: DEFAULT_MAX_TOTAL_PAID,
        quote: "session",
        // "Any", against the base's "all", and it still matters even though
        // this preset ticks no installments: the moment the office DOES tick
        // some, a part-paid family who cleared installment 1 and still owes 2
        // is exactly who this notice is for, and "all" would drop them.
        installmentMatch: "any",
      };

    // Now exactly the base: overdue, quoting what is overdue.
    case "overdue_final":
      return { ...base };

    // The ledger decides these three: a fee actually pending on a passed row.
    case "late_fee_applied":
    case "late_fee_waiver":
    case "waiver_last_call":
      return { ...base, lateFee: "yes", quote: "ledger_fees" };

    // A promise is the office's own record, and it can be logged against an
    // installment that has not fallen due yet — so these two must NOT inherit
    // the overdue-only base, or the promise the family made about installment 3
    // could not be followed up. They quote the session for the same reason:
    // the promise was about a figure, not about what happens to be late today.
    case "promise_due":
      return { ...base, overdue: "any", promise: "due_soon", quote: "session" };

    case "promise_lapsed":
      return { ...base, overdue: "any", promise: "lapsed", quote: "session" };

    // The office picks which installments must be clear before the exams, and
    // ANY of them still pending puts a family here.
    // The office names the rows here, so this is the one audience the
    // installment filter still defines — and `overdue: "any"`, because a row
    // has to be clear before the exam whether or not its date has gone.
    case "exam_clearance":
      return {
        ...base,
        installments: active,
        installmentMatch: "any",
        overdue: "any",
        quote: "selected",
      };

    // Last year's balance has no installments and never accrues a late fee.
    // Last year's balance has no installments and never accrues a late fee.
    //
    // `overdue: "any"` is load-bearing. A carry-forward balance is an
    // `installments` row with `installment_no = 99`, OUTSIDE the 1-4 range
    // `pendingFor` reads, so it can never appear in `overdueInstallments`.
    // Inheriting the overdue-only base would therefore drop any family who has
    // cleared this session but still owes last year's — silently, because the
    // audience would simply come back smaller. All 37 such families happen to
    // be overdue on installment 1 or 2 today, which is exactly why this would
    // have gone unnoticed until it did not.
    case "prevyear":
      return { ...base, overdue: "any", carryForward: "yes", quote: "prev_year" };
  }
}


/**
 * The five audiences the office actually sends to, in escalation order.
 *
 * These were nine until 2026-09-10, and before that twelve carrying the twelve
 * NOTICE names — sitting directly under twelve template chips carrying the same
 * twelve names, so "Fee due" appeared twice on one screen meaning two different
 * things. Nine was still too many, and the live ledger said why: four of them
 * were furniture.
 *
 * | dropped | families on 2026-27 | where it went |
 * |---|---|---|
 * | Everyone who owes | 479, the inflated one | Fine-tune: overdue "All open dues" |
 * | Promised, due now | **0** | Fine-tune: the promise dropdown |
 * | Promise broken | **0** | Fine-tune: the promise dropdown |
 * | Part paid, still owing | — | Fine-tune: "Paid so far, over" |
 *
 * There are ZERO promises on record for 2026-27 — `defaulter_contacts` has no
 * `promise_to_pay` outcome and no promised date anywhere — so two of the nine
 * chips could not match a single family, and the `skip_open` default holds
 * nobody back. Nothing is unreachable: every dropped audience is still one
 * control away inside Fine-tune, and `matchingShortcut` shows "Custom" the
 * moment the filters stop matching a chip.
 *
 * `from` is the situation whose preset supplies the filters, so `presetFor`
 * remains the ONE definition of each audience and a chip cannot drift away from
 * the notice that shares its rule.
 */
export const AUDIENCE_SHORTCUTS = [
  {
    key: "overdue",
    label: "Overdue",
    hint: "Fees still owed on an installment whose due date has already passed",
    from: "overdue_final",
  },
  {
    key: "nothing_paid",
    label: "Nothing paid yet",
    hint: "Nothing received beyond the academic fee, and already past a due date",
    from: "fee_due",
  },
  {
    key: "late_fee",
    label: "Carrying a late fee",
    hint: "The ledger is charging a late fee on a passed installment",
    from: "late_fee_applied",
  },
  {
    key: "last_session",
    label: "Owes from last session",
    hint: "A balance carried forward with something left on it",
    from: "prevyear",
  },
  {
    key: "not_due_yet",
    label: "Not late yet",
    hint: "An installment is coming and nothing earlier is owed — the courtesy note",
    from: "upcoming",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  hint: string;
  from: NoticeSituation | null;
}>;

export type AudienceShortcutKey = (typeof AUDIENCE_SHORTCUTS)[number]["key"];

/**
 * The filters one shortcut stands for, always via `presetFor`.
 */
export function shortcutFilters(
  key: AudienceShortcutKey,
  args: { activeInstallments: readonly number[]; nextInstallment: number | null },
): Omit<AudienceFilters, "classId" | "includeRte" | "includeStudentIds" | "excludeStudentIds"> {
  const entry = AUDIENCE_SHORTCUTS.find((option) => option.key === key);
  // Every chip now delegates to a preset, so this only catches a key off a
  // hand-edited URL. It answers with the default audience rather than the old
  // "everyone who owes", which is the one thing a reminder must not mean.
  if (!entry || entry.from === null) return presetFor("overdue_final", args);
  return presetFor(entry.from, args);
}

/**
 * Families who have paid at most this much have effectively paid nothing — it
 * is the academic fee and nothing else has landed.
 *
 * Lives here rather than in `fee-reminders.ts` so the presets above and the
 * browser-side builder can both read it without reaching into a `server-only`
 * module. `fee-reminders.ts` re-exports it for its existing callers.
 */
export const DEFAULT_MAX_TOTAL_PAID = 1100;

/**
 * A per-family fact a template's slots depend on.
 *
 * Now that any template can go to any audience, a template can be pointed at a
 * family who does not have the fact its wording is built around: "Late fee
 * applied" to a family with no late fee renders ₹0, "Promise due" to a family
 * with no promise renders a blank date. The screen WARNS rather than refuses —
 * the office asked for the freedom and there are legitimate uses (a waiver
 * notice to a family about to accrue one) — but it never lets it happen
 * silently.
 */
/**
 * A fact whose ABSENCE would put an empty parameter or a ₹0 in front of a
 * parent. Nothing softer belongs here.
 *
 * `next_due` and `overdue` were on this list until 2026-09-10 and should not
 * have been. `upcoming` and `upcoming_final` render through `feeDueParams`, so
 * there is no "next installment" slot to leave blank — the amount already
 * covers it. `overdue_final`'s context line goes through `contextInstallments`,
 * which FALLS BACK to the run's installments, so it never renders empty either.
 * Between them they were reporting 89 of 89 families as broken on a list where
 * nothing was, which is how a real warning gets trained out of somebody.
 */
export type NoticeFact = "late_fee" | "promise" | "prev_year" | "amount";

export const NOTICE_FACT_LABELS: Record<NoticeFact, string> = {
  late_fee: "a late fee on the ledger",
  promise: "a promised date on record",
  prev_year: "a carry-forward balance",
  amount: "a non-zero amount to quote",
};

/**
 * What actually happens to a message missing each fact, and what to do instead.
 *
 * Two different failures hide behind one warning, and the office needs to tell
 * them apart:
 *
 * - `late_fee` and `amount` render a **₹0** — an odd message, delivered.
 * - `promise` and `prev_year` render an **empty template parameter**, and
 *   WhatsApp REFUSES those. The message does not go out looking strange; it
 *   does not go out at all, and the run reports a failure.
 */
export const NOTICE_FACT_CONSEQUENCE: Record<
  NoticeFact,
  { effect: string; fix: string }
> = {
  late_fee: {
    effect: "the message would print a late fee of ₹0",
    fix: "switch the late fee to Custom amount, or use the “Carrying a late fee” audience",
  },
  promise: {
    effect: "the message carries an empty date, and WhatsApp refuses those — they would fail rather than send",
    fix: "set “Promise to pay” under Fine-tune to “falls due today or tomorrow” or “has lapsed”, or pick a different message",
  },
  prev_year: {
    effect: "the message carries an empty session name, and WhatsApp refuses those — they would fail rather than send",
    fix: "use the “Owes from last session” audience, or pick a different message",
  },
  amount: {
    effect: "the message would quote ₹0",
    fix: "raise “Quoted amount at least”, or change what the message quotes",
  },
};

/**
 * Every fact, for a caller that has to count them one by one.
 *
 * DERIVED from the label table rather than hand-written, so adding a fact
 * cannot leave a caller silently counting one fewer than exists.
 */
export const NOTICE_FACT_KEYS = Object.keys(NOTICE_FACT_LABELS) as NoticeFact[];

/** What each template's slots need from the family reading it. */
export const NOTICE_FACTS: Record<NoticeSituation, readonly NoticeFact[]> = {
  upcoming: ["amount"],
  upcoming_final: ["amount"],
  fee_due: ["amount"],
  balance: ["amount"],
  overdue_final: ["amount"],
  late_fee_applied: ["late_fee"],
  late_fee_waiver: ["late_fee", "amount"],
  waiver_last_call: ["late_fee", "amount"],
  promise_due: ["promise", "amount"],
  promise_lapsed: ["promise", "amount"],
  exam_clearance: ["amount"],
  prevyear: ["prev_year"],
};

/**
 * Every parameter that shapes a reminder run, in ONE list.
 *
 * There used to be five copies of this — the picker's `hrefWith`, the
 * collection-list links, the lists page's `CARRIED_PARAMS`, the Apply action's
 * own list, and the hidden inputs in three forms on the workspace. A key added
 * to four of the five is a key that silently resets the moment somebody
 * switches notice, and this feature has already shipped that bug once.
 *
 * `campaignId` is here because it travels; it is not a filter and changes
 * nobody's eligibility.
 */
export const REMINDER_QUERY_KEYS = [
  "situation",
  "language",
  "lastDate",
  "lateFeeAmount",
  "lateFeeBasis",
  "lateFeeSource",
  "preDueWindowDays",
  "installments",
  "installmentMatch",
  "maxTotalPaid",
  "minTotalPaid",
  "minDueAmount",
  "lateFee",
  "overdue",
  "carryForward",
  "promise",
  "quote",
  "classId",
  "includeRte",
  "include",
  "exclude",
  "campaignId",
] as const;

export type ReminderQueryKey = (typeof REMINDER_QUERY_KEYS)[number];

/**
 * The shape `reminderQuery` needs. `ReminderFilters` satisfies it structurally,
 * which is what lets a `server-only` type be serialised by a browser module.
 */
export type ReminderQuerySource = AudienceFilters & {
  situation: string;
  language: string;
  lastDate: string;
  lateFeeAmount: number;
  lateFeeBasis: string;
  lateFeeSource: string;
  preDueWindowDays: number;
};

/**
 * The whole state of the screen as a query string, with anything you name
 * overridden.
 *
 * Emits every key explicitly, including the ones equal to a preset's value.
 * That is the point: once a parameter is in the URL it stops following the
 * notice, so switching template keeps the audience the office built rather than
 * silently rebuilding it from the new template's preset. Choosing a PRESET is
 * how you go back to a notice's own audience, and that path drops the keys.
 */
export function reminderQuery(
  source: ReminderQuerySource,
  override: Partial<Record<ReminderQueryKey, string | null>> = {},
): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: ReminderQueryKey, value: string | null) => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  };

  set("situation", source.situation);
  set("language", source.language);
  set("lastDate", source.lastDate);
  set("lateFeeAmount", String(source.lateFeeAmount));
  set("lateFeeBasis", source.lateFeeBasis);
  set("lateFeeSource", source.lateFeeSource);
  set("preDueWindowDays", String(source.preDueWindowDays));
  // Always emitted, empty included. An absent key means "take the notice's
  // preset"; `installments=` means "the office unticked all four", which is a
  // real choice — no installment constraint at all — and must survive a round
  // trip. Every other key can safely collapse an empty value to absent.
  params.set("installments", source.installments.join(","));
  set("installmentMatch", source.installmentMatch);
  set("maxTotalPaid", source.maxTotalPaid === null ? null : String(source.maxTotalPaid));
  set("minTotalPaid", source.minTotalPaid === null ? null : String(source.minTotalPaid));
  set("minDueAmount", String(source.minDueAmount));
  set("lateFee", source.lateFee);
  set("overdue", source.overdue);
  set("carryForward", source.carryForward);
  set("promise", source.promise);
  set("quote", source.quote);
  set("classId", source.classId);
  set("includeRte", source.includeRte ? "on" : null);
  set("include", source.includeStudentIds.join(","));
  set("exclude", source.excludeStudentIds.join(","));

  for (const [key, value] of Object.entries(override)) {
    // An explicit empty string on `installments` is a real value ("none of the
    // four"); every other empty means absent.
    if (key === "installments" && typeof value === "string") params.set(key, value);
    else set(key as ReminderQueryKey, value ?? null);
  }

  return params;
}

/**
 * The href for an audience shortcut: the shortcut's own filters, and NOTHING
 * about the message.
 *
 * The mirror image of `hrefWith` in the notice picker, and the pair is the
 * whole point: a TEMPLATE chip changes only what is said, a SHORTCUT chip
 * changes only who hears it. Neither ever reaches into the other's half, so
 * the office can answer the two questions in either order without one
 * silently undoing the other.
 */
export function shortcutHref(
  source: ReminderQuerySource,
  key: AudienceShortcutKey,
  args: { activeInstallments: readonly number[]; nextInstallment: number | null },
): string {
  const filters = shortcutFilters(key, args);
  const params = reminderQuery(source, {
    installments: filters.installments.join(","),
    installmentMatch: filters.installmentMatch,
    maxTotalPaid: filters.maxTotalPaid === null ? null : String(filters.maxTotalPaid),
    minTotalPaid: filters.minTotalPaid === null ? null : String(filters.minTotalPaid),
    minDueAmount: String(filters.minDueAmount),
    lateFee: filters.lateFee,
    overdue: filters.overdue,
    carryForward: filters.carryForward,
    promise: filters.promise,
    quote: filters.quote,
    // Hand-picked students are a decision about THIS list, so a shortcut that
    // rebuilds the list drops them. The office can always add them back, and
    // silently carrying somebody into an audience they were never chosen for
    // is the worse surprise.
    include: null,
    exclude: null,
  });
  return `?${params.toString()}`;
}

/**
 * Does the current filter set match a shortcut exactly?
 *
 * Drives the "Custom" state: when nothing matches, the office has narrowed the
 * list by hand and the screen says so rather than leaving every chip looking
 * unselected for no visible reason.
 */
export function matchingShortcut(
  filters: AudienceFilters,
  args: { activeInstallments: readonly number[]; nextInstallment: number | null },
): AudienceShortcutKey | null {
  for (const entry of AUDIENCE_SHORTCUTS) {
    const candidate = shortcutFilters(entry.key, args);
    const same =
      candidate.installments.join(",") === filters.installments.join(",") &&
      candidate.installmentMatch === filters.installmentMatch &&
      candidate.maxTotalPaid === filters.maxTotalPaid &&
      candidate.minTotalPaid === filters.minTotalPaid &&
      candidate.minDueAmount === filters.minDueAmount &&
      candidate.lateFee === filters.lateFee &&
      candidate.overdue === filters.overdue &&
      candidate.carryForward === filters.carryForward &&
      candidate.promise === filters.promise &&
      candidate.quote === filters.quote;
    if (same) return entry.key;
  }
  return null;
}

/**
 * What the office is about to do, as one sentence they can read.
 *
 * This replaced a summary line that read `Inst 1+2 all · paid ≤ 1100 · overdue
 * yes`. That string was accurate and nobody could use it: it named the FIELDS
 * rather than the decision, so answering "who is about to get this?" meant
 * translating six filter keys in your head. The office's word for the screen
 * was "confusing", and this line is the fix — a reminder run is a claim about a
 * family's money, and the screen should be able to state the claim.
 *
 * Deliberately built from the filters rather than the chip: a hand-narrowed
 * list has no chip, and that is exactly when a person most needs telling what
 * they have built. Clauses that say nothing are omitted entirely — with no
 * promises on record, "0 held back" would be noise on every single load.
 */
/**
 * The audience, in parts a screen can lay out.
 *
 * `headline` is the two numbers, `claim` is what they mean, `notes` is
 * everything that narrows or holds back. A phone renders them at three
 * different weights; anything that just wants the text uses `full`.
 */
export type AudienceSentence = {
  /** "292 families · ₹22,95,084" — the two figures, for one glance. */
  headline: string;
  /**
   * What the headline's numbers mean — "whose fees are past a due date, for the
   * overdue amount only."
   *
   * Deliberately has no count in it: it is rendered directly under `headline`
   * and continues the same sentence.
   */
  claim: string;
  /** Narrowings and hold-backs, each already a full sentence. Often empty. */
  notes: string[];
  /** Every part joined, in reading order. */
  full: string;
};

export function describeAudience(
  filters: AudienceFilters,
  totals: {
    /** How many families the filters actually landed on. */
    count: number;
    /** The sum of what those families will be asked for. */
    quotedTotal: number;
    /** Families paused inside their own promise, under `skip_open`. */
    heldByPromise?: number;
    /**
     * Families held back by their reminder cadence — never, snoozed, or
     * messaged too recently.
     *
     * Load-bearing for a reason that is easy to miss: a CHIP counts an
     * audience, and the sentence counts today's send. The two differ by exactly
     * these families, so the active chip read "Overdue 298" directly above
     * "Sending to 292 families" with nothing on screen explaining the six. Both
     * numbers were right and the pair looked like a bug. State the difference
     * and the arithmetic closes.
     */
    heldByCadence?: number;
    /** A class label, when one is picked — the caller holds the lookup. */
    className?: string | null;
  },
): AudienceSentence {
  const families = totals.count === 1 ? "1 family" : `${totals.count} families`;

  // WHO. The strongest true thing first, because that is what a person reads.
  let who: string;
  if (filters.carryForward === "yes") {
    who = "who still owe a balance carried over from last session";
  } else if (filters.lateFee === "yes") {
    who = "the ledger is charging a late fee on";
  } else if (filters.overdue === "no") {
    who = "with an installment coming up and nothing yet overdue";
  } else if (filters.overdue === "yes") {
    who = "whose fees are past a due date";
  } else {
    who = "with fees still open, overdue or not";
  }

  const sentences: string[] = [];

  // HOW MUCH. Named, so nobody has to open a dropdown to find out what the
  // parent will be asked for.
  const asking: Record<QuoteBasis, string> = {
    overdue: "the overdue amount only",
    next: "the installment falling due next",
    selected: "the fees on the selected installments",
    ledger_fees: "the fees on the late-fee rows",
    prev_year: "last session's carried-forward balance",
    session: "the whole session balance, including what is not due yet",
  };
  // No count in here: `headline` already carries it, and rendered one under
  // the other they read as one thought — "292 families · ₹22,95,084" then
  // "whose fees are past a due date". Repeating it printed "292 families"
  // twice, two lines apart.
  const claim = `${who}, for ${asking[filters.quote]}.`;

  // NARROWINGS, only the ones actually set.
  const narrowed: string[] = [];
  if (totals.className) narrowed.push(`${totals.className} only`);
  /**
   * The paid-so-far bounds, reported whenever they are set.
   *
   * They used to be folded into the head clause, and only on the
   * `overdue: "yes"` branch — so a run with the overdue select on "All open
   * dues" and a ₹1,100 ceiling still applied read "Sending to N families with
   * fees still open, overdue or not" and said nothing about the ceiling. That
   * is the worst kind of wrong for this sentence: the office reads a wide
   * audience, gets a narrow one, and the line that exists to explain the number
   * is the thing hiding it. A constraint that changes who is messaged is stated
   * or it is not applied.
   */
  if (filters.maxTotalPaid !== null) {
    narrowed.push(
      filters.maxTotalPaid === DEFAULT_MAX_TOTAL_PAID
        ? "paid nothing beyond the academic fee"
        : `paid at most ${formatInr(filters.maxTotalPaid)}`,
    );
  }
  if (filters.minTotalPaid !== null) {
    narrowed.push(
      filters.minTotalPaid === DEFAULT_MAX_TOTAL_PAID
        ? "have paid something already"
        : `paid more than ${formatInr(filters.minTotalPaid)}`,
    );
  }
  if (filters.lateFee === "no") narrowed.push("no late fee charged");
  if (filters.carryForward === "no") narrowed.push("nothing carried over from last session");
  if (filters.promise !== "skip_open" && filters.promise !== "any") {
    narrowed.push(`promise: ${PROMISE_OPTIONS.find((e) => e.value === filters.promise)?.label ?? filters.promise}`);
  }
  if (filters.installments.length > 0) {
    narrowed.push(
      `installment ${filters.installments.join(" and ")} ${
        filters.installmentMatch === "all" ? "all pending" : "any pending"
      }`,
    );
  }
  if (filters.minDueAmount > 1) narrowed.push(`at least ${formatInr(filters.minDueAmount)}`);
  if (!filters.includeRte) narrowed.push("RTE students left out");
  if (filters.includeStudentIds.length > 0) {
    narrowed.push(`${filters.includeStudentIds.length} added by hand`);
  }
  if (filters.excludeStudentIds.length > 0) {
    narrowed.push(`${filters.excludeStudentIds.length} removed by hand`);
  }
  if (narrowed.length > 0) {
    const list = narrowed.join(", ");
    sentences.push(`${list.charAt(0).toUpperCase()}${list.slice(1)}.`);
  }

  // The promise hold-back is a PAUSE the office can undo, not a filter, so it
  // is worth its own clause — but only when it is holding somebody.
  const heldPromise = filters.promise === "skip_open" ? (totals.heldByPromise ?? 0) : 0;
  const heldCadence = totals.heldByCadence ?? 0;
  const total = heldPromise + heldCadence;
  if (total > 0) {
    const reasons: string[] = [];
    if (heldPromise > 0) reasons.push(`${heldPromise} inside their own promise`);
    if (heldCadence > 0) reasons.push(`${heldCadence} by reminder cadence`);
    const who = total === 1 ? "1 more is" : `${total} more are`;
    const why =
      reasons.length === 1
        ? heldPromise > 0
          ? "inside their own promise"
          : "by reminder cadence"
        : reasons.join(" and ");
    sentences.push(`${who} held back ${why} — on the chip above, not in this send.`);
  }

  /**
   * Four parts rather than one string, because at 390px one string is a wall.
   *
   * Measured: six lines and 124px of uniform 12.5px semibold, which is the
   * first thing on the card and the thing a person reads to decide whether to
   * send a few hundred billed messages. Split, the two figures a person
   * actually checks land in one glance and the qualifiers stop competing with
   * them. `full` is kept for a caller that wants the flat sentence and for the
   * tests, so there is still exactly one composition of this text.
   */
  const headline = `${families} · ${formatInr(totals.quotedTotal)}`;
  return {
    headline,
    claim,
    notes: sentences,
    full: [
      `Sending to ${families} ${claim}`,
      `Asking for ${formatInr(totals.quotedTotal)}.`,
      ...sentences,
    ].join(" "),
  };

}

/** A comma list of ids out of the query string, deduped and trimmed. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * What a SAVED campaign stores about its audience.
 *
 * Every field is nullable, and null does not mean "no limit" — it means **not
 * stored**, so the notice's own preset supplies it. That distinction is what
 * lets a campaign saved before 2026-09-08 keep naming the families it always
 * named: those rows carry only five keys, and the four they do not carry have
 * to come from somewhere that agrees with the engine they were saved against.
 *
 * Hand-picked students are deliberately NOT here. A saved campaign is a
 * standing rule that a nightly cron replays; an included student bypasses the
 * filters AND the reminder cadence, so persisting one would message that family
 * every night forever. Include and exclude are decisions about today.
 */
export type SavedAudience = {
  maxTotalPaid: number | null;
  minTotalPaid: number | null;
  minDueAmount: number;
  installments: number[] | null;
  installmentMatch: InstallmentMatch | null;
  lateFee: Tri | null;
  overdue: Tri | null;
  carryForward: Tri | null;
  promise: PromiseFilter | null;
  quote: QuoteBasis | null;
  classId: string | null;
  includeRte: boolean;
};

/**
 * Read a stored campaign's audience, honouring what the engine of its day did.
 *
 * A row written since the split carries `quote` and every other key, and is
 * read back verbatim.
 *
 * A row written BEFORE it carries five keys, three of which the old engine
 * applied only on some notices — `maxTotalPaid` decided `fee_due` and `balance`
 * and was inert everywhere else, and `installments` decided those two plus
 * `exam_clearance`. Passing them through unconditionally would narrow a
 * scheduled `overdue_final` run that has been going out untouched for weeks:
 * the office would not have changed anything, and fewer parents would be
 * chased. So a legacy row drops the keys its own engine ignored, and the preset
 * fills the rest.
 *
 * On `balance` the old rule was `totalPaid > maxTotalPaid` — a FLOOR, stored
 * under the ceiling's name because one field did both jobs. It moves to
 * `minTotalPaid` here, which is the same comparison under an honest name.
 */
export function savedAudienceFrom(
  situation: NoticeSituation,
  raw: Record<string, unknown>,
): SavedAudience {
  const numberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const installments = Array.isArray(raw.installments)
    ? (raw.installments as unknown[]).map(Number).filter((value) => value >= 1 && value <= 4)
    : null;

  const base: SavedAudience = {
    maxTotalPaid: null,
    minTotalPaid: null,
    minDueAmount: numberOrNull(raw.minDueAmount) ?? 1,
    installments: installments && installments.length > 0 ? installments : null,
    installmentMatch: null,
    lateFee: null,
    overdue: null,
    carryForward: null,
    promise: null,
    quote: null,
    classId: typeof raw.classId === "string" && raw.classId ? raw.classId : null,
    includeRte: raw.includeRte === true,
  };

  if (isQuoteBasis(raw.quote)) {
    return {
      ...base,
      maxTotalPaid: numberOrNull(raw.maxTotalPaid),
      minTotalPaid: numberOrNull(raw.minTotalPaid),
      installmentMatch: isInstallmentMatch(raw.installmentMatch) ? raw.installmentMatch : null,
      lateFee: isTri(raw.lateFee) ? raw.lateFee : null,
      overdue: isTri(raw.overdue) ? raw.overdue : null,
      carryForward: isTri(raw.carryForward) ? raw.carryForward : null,
      promise: isPromiseFilter(raw.promise) ? raw.promise : null,
      quote: raw.quote,
    };
  }

  // Legacy. `maxTotalPaid` meant a ceiling on `fee_due` and a floor on
  // `balance`; it was inert on the other ten notices.
  const storedPaid = numberOrNull(raw.maxTotalPaid);
  const paidApplies = situation === "fee_due" || situation === "balance";
  const installmentsApply =
    situation === "fee_due" || situation === "balance" || situation === "exam_clearance";

  return {
    ...base,
    maxTotalPaid: paidApplies && situation === "fee_due" ? storedPaid : null,
    minTotalPaid: paidApplies && situation === "balance" ? storedPaid : null,
    installments: installmentsApply ? base.installments : null,
  };
}

/** A stored audience as query parameters, omitting everything it did not store. */
export function savedAudienceParams(saved: SavedAudience): Record<string, string> {
  const out: Record<string, string> = { minDueAmount: String(saved.minDueAmount) };
  if (saved.maxTotalPaid !== null) out.maxTotalPaid = String(saved.maxTotalPaid);
  if (saved.minTotalPaid !== null) out.minTotalPaid = String(saved.minTotalPaid);
  if (saved.installments && saved.installments.length > 0) {
    out.installments = saved.installments.join(",");
  }
  if (saved.installmentMatch) out.installmentMatch = saved.installmentMatch;
  if (saved.lateFee) out.lateFee = saved.lateFee;
  if (saved.overdue) out.overdue = saved.overdue;
  if (saved.carryForward) out.carryForward = saved.carryForward;
  if (saved.promise) out.promise = saved.promise;
  if (saved.quote) out.quote = saved.quote;
  if (saved.classId) out.classId = saved.classId;
  if (saved.includeRte) out.includeRte = "on";
  return out;
}
