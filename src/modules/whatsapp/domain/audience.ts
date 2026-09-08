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

export const QUOTE_BASES = [
  { value: "selected", label: "Fees on the selected installments" },
  { value: "session", label: "Whole session balance" },
  { value: "overdue", label: "Overdue installments only" },
  { value: "next", label: "The next installment due" },
  { value: "ledger_fees", label: "Fees on the late-fee rows" },
  { value: "prev_year", label: "Last session's carry-forward" },
] as const satisfies ReadonlyArray<{ value: QuoteBasis; label: string }>;

export const INSTALLMENT_MATCHES = [
  { value: "all", label: "all of them pending" },
  { value: "any", label: "any of them pending" },
] as const satisfies ReadonlyArray<{ value: InstallmentMatch; label: string }>;

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
    overdue: "any" as Tri,
    carryForward: "any" as Tri,
    promise: "skip_open" as PromiseFilter,
    quote: "selected" as QuoteBasis,
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
    case "fee_due":
      return {
        ...base,
        installments: active,
        maxTotalPaid: DEFAULT_MAX_TOTAL_PAID,
        installmentMatch: "all",
      };

    // Something received, and still owing on at least one of them.
    case "balance":
      return {
        ...base,
        installments: active,
        minTotalPaid: DEFAULT_MAX_TOTAL_PAID,
        installmentMatch: "any",
        quote: "session",
      };

    case "overdue_final":
      return { ...base, overdue: "yes", quote: "overdue" };

    // The ledger decides these three: a fee actually pending on a passed row.
    case "late_fee_applied":
    case "late_fee_waiver":
    case "waiver_last_call":
      return { ...base, lateFee: "yes", quote: "ledger_fees" };

    case "promise_due":
      return { ...base, promise: "due_soon", quote: "session" };

    case "promise_lapsed":
      return { ...base, promise: "lapsed", quote: "session" };

    // The office picks which installments must be clear before the exams, and
    // ANY of them still pending puts a family here.
    case "exam_clearance":
      return { ...base, installments: active, installmentMatch: "any" };

    // Last year's balance has no installments and never accrues a late fee.
    case "prevyear":
      return { ...base, carryForward: "yes", quote: "prev_year" };
  }
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
export type NoticeFact = "late_fee" | "promise" | "prev_year" | "overdue" | "next_due" | "amount";

export const NOTICE_FACT_LABELS: Record<NoticeFact, string> = {
  late_fee: "a late fee on the ledger",
  promise: "a promised date on record",
  prev_year: "a carry-forward balance",
  overdue: "an installment past its due date",
  next_due: "an installment falling due next",
  amount: "a non-zero amount to quote",
};

/** What each template's slots need from the family reading it. */
export const NOTICE_FACTS: Record<NoticeSituation, readonly NoticeFact[]> = {
  upcoming: ["next_due", "amount"],
  upcoming_final: ["next_due", "amount"],
  fee_due: ["amount"],
  balance: ["amount"],
  overdue_final: ["overdue", "amount"],
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
 * The href for a preset chip: the notice, and NOTHING about the audience.
 *
 * Dropping every audience key is what makes a preset a preset — the parse falls
 * back to that notice's own `presetFor`, which is the "put it back how it was"
 * the office needs after narrowing a list by hand.
 */
export function presetHref(source: ReminderQuerySource, situation: string): string {
  const params = reminderQuery(source, {
    situation,
    // `null`, not `""`: dropping the key is what makes the preset supply the
    // set. An empty value would mean "no installment constraint", which is a
    // different answer.
    installments: null,
    installmentMatch: null,
    maxTotalPaid: null,
    minTotalPaid: null,
    minDueAmount: null,
    lateFee: null,
    overdue: null,
    carryForward: null,
    promise: null,
    quote: null,
    include: null,
    exclude: null,
  });
  return `?${params.toString()}`;
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
