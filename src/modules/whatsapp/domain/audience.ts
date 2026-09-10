/**
 * WHO gets a reminder — stated as installments, never inferred from WHICH
 * message is going out.
 *
 * The audience is the tile row: **Inst 1 · 2 · 3 · 4 · Last year**. A family
 * is on the list when they still owe fees on the selected installments (every
 * one of them, or any one — the office says which), or on last session's
 * carried-forward balance. Whether an installment is due or overdue is a fact
 * about the calendar, so the tile SAYS it rather than asking for it as a
 * filter. The amount the message quotes is derived from the same tiles — fees
 * still pending on the selected installments, or what is left of the
 * carry-forward — and so is the late fee the ledger-quoted notices print.
 *
 * Until 2026-09-10 this file also carried the twelve templates' old audiences
 * as presets (`presetFor`), nine audience shortcut chips built on them, a
 * six-way "quote basis", two paid-so-far thresholds and three yes/no/either
 * facts. An absent query key fell back to the selected TEMPLATE's preset, so
 * the message still shaped the list invisibly, and the office reported the
 * card as "very confusing". All of that is gone. What is left under "Narrow
 * down" is the four things that were genuinely asked for — class, paid so far,
 * a late fee on the ledger, a minimum — plus the promise hold-back the contact
 * log drives.
 *
 * Browser-safe on purpose — no `server-only`, no Supabase, no `fetch`. The
 * audience builder, the notice picker and the collection-list links all build
 * the same query string, and a second copy of "which keys travel" is how a
 * teacher's sheet ends up naming families the send screen never showed.
 */

import type { NoticeSituation } from "@/modules/whatsapp/domain/campaigns";

/**
 * Whether EVERY selected installment must still carry fees, or any one of them.
 *
 * Not decoration. "Nothing has been received" (`all`) and "still owing on one of
 * these" (`any`) are different questions, and asking the wrong one is what put
 * 87 fully-paid-up families on the live balance list, chased for installments
 * that were not due for another two months. Live on 2026-09-10, installments 1
 * and 2 read 187 families under `all` and 345 under `any`.
 */
export type InstallmentMatch = "all" | "any";

/** A yes / no / don't-care fact about a family. */
export type Tri = "any" | "yes" | "no";

/**
 * What has been received this session. `nothing` is at most the academic fee
 * (`DEFAULT_MAX_TOTAL_PAID`), `part` is anything over it. The two are
 * complements, so a family cannot fall in both bands or in neither.
 */
export type PaidFilter = "any" | "nothing" | "part";

/**
 * What the office's own contact log says about this family's last promise.
 *
 * `skip_open` is the default and is NOT the same as `any`: a family who has
 * already told the office when they will pay is held back, because chasing
 * inside their own promise window is how a promise that was going to hold stops
 * holding. `lapsed` and `due_soon` are the only way the promise notices can be
 * targeted — nothing on the ledger distinguishes "promised and lapsed" from
 * "owing", so the two stay reachable here.
 */
export type PromiseFilter = "skip_open" | "any" | "due_soon" | "lapsed";

export const INSTALLMENT_MATCHES = [
  { value: "all", label: "owing on all of them" },
  { value: "any", label: "owing on any of them" },
] as const satisfies ReadonlyArray<{ value: InstallmentMatch; label: string }>;

export const TRI_OPTIONS = [
  { value: "any", label: "Either" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const satisfies ReadonlyArray<{ value: Tri; label: string }>;

export const PAID_OPTIONS = [
  { value: "any", label: "Either" },
  { value: "nothing", label: "Nothing paid yet" },
  { value: "part", label: "Part paid" },
] as const satisfies ReadonlyArray<{ value: PaidFilter; label: string }>;

export const PROMISE_OPTIONS = [
  { value: "skip_open", label: "Skip families inside a promise" },
  { value: "lapsed", label: "Only a promise that has lapsed" },
  { value: "due_soon", label: "Only a promise due today or tomorrow" },
  { value: "any", label: "Ignore promises" },
] as const satisfies ReadonlyArray<{ value: PromiseFilter; label: string }>;

export function isInstallmentMatch(value: unknown): value is InstallmentMatch {
  return value === "all" || value === "any";
}

export function isTri(value: unknown): value is Tri {
  return value === "any" || value === "yes" || value === "no";
}

export function isPaidFilter(value: unknown): value is PaidFilter {
  return value === "any" || value === "nothing" || value === "part";
}

export function isPromiseFilter(value: unknown): value is PromiseFilter {
  return (
    typeof value === "string" &&
    PROMISE_OPTIONS.some((entry) => entry.value === value)
  );
}

/**
 * The audience half of a reminder run, with nothing about the message in it.
 *
 * `ReminderFilters` in `fee-reminders.ts` structurally satisfies this — the two
 * are deliberately not one type, because this one has to be importable from the
 * browser and that one is `server-only`.
 */
export type AudienceFilters = {
  /**
   * The selected installment tiles, 1-4, sorted and deduplicated. Empty ONLY
   * when `lastYear` is set — zero tiles is not a state the parser produces.
   */
  installments: number[];
  /**
   * The "Last year" tile: a balance carried forward from the previous session.
   * Exclusive with the installments by construction — both ride the ONE query
   * key `installments`, as the token `last_year` — so no URL can carry both.
   */
  lastYear: boolean;
  installmentMatch: InstallmentMatch;
  paid: PaidFilter;
  /** The quoted figure must be at least this. Zero lets a nil quote through. */
  minDueAmount: number;
  /** Is the LEDGER charging a late fee on one of the SELECTED installments? */
  lateFee: Tri;
  promise: PromiseFilter;
  /**
   * Skip families already overdue on an EARLIER installment. Only offered when
   * every selected tile is still ahead of its date — a courtesy note about
   * installment 3 to a family already late on 2 is the wrong message, and this
   * is how the office keeps them off it. Meaningless on a passed tile, where
   * everybody on the list is overdue by definition, so the tile hrefs drop it.
   */
  skipOverdue: boolean;
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
 * Where every audience control opens before the office touches it.
 *
 * `installments` is EMPTY here and means "unresolved": `parseReminderFilters`
 * substitutes the calendar's own default (`defaultInstallmentsFor`) — every
 * installment past its due date today — and a caller that builds filters from
 * this constant directly gets "all four" from `quotedAmountFor`, never ₹0.
 */
export const DEFAULT_AUDIENCE_FILTERS: AudienceFilters = {
  installments: [],
  lastYear: false,
  installmentMatch: "all",
  paid: "any",
  minDueAmount: 1,
  lateFee: "any",
  promise: "skip_open",
  skipOverdue: false,
  classId: null,
  includeRte: false,
  includeStudentIds: [],
  excludeStudentIds: [],
};

/**
 * Families who have paid at most this much have effectively paid nothing — it
 * is the academic fee and nothing else has landed. The `paid` filter's
 * threshold.
 *
 * Lives here rather than in `fee-reminders.ts` so the browser-side builder can
 * read it without reaching into a `server-only` module. `fee-reminders.ts`
 * re-exports it for its existing callers.
 */
export const DEFAULT_MAX_TOTAL_PAID = 1100;

/** The one token that puts the Last-year tile in the `installments` key. */
export const LAST_YEAR_TOKEN = "last_year";

/**
 * The ONE reader for the `installments` value, whether it came off a query
 * string, a posted form or a saved campaign's JSON.
 *
 * `last_year` anywhere in the value wins and clears the four. Numbers 1-4 are
 * kept, sorted and deduplicated. Anything else — absent, blank, `0,9,banana`
 * from a hand-edited URL — returns null so the caller can open on the
 * calendar's default rather than on nobody. Garbage must never be read as a
 * deliberate choice.
 */
export function parseInstallmentsValue(
  raw: string | null | undefined,
): { installments: number[]; lastYear: boolean } | null {
  if (raw === null || raw === undefined) return null;
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.includes(LAST_YEAR_TOKEN)) return { installments: [], lastYear: true };
  const installments = [
    ...new Set(
      tokens
        .map((token) => Number(token))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 4),
    ),
  ].sort((a, b) => a - b);
  if (installments.length === 0) return null;
  return { installments, lastYear: false };
}

/** The `installments` value that `parseInstallmentsValue` reads back to `scope`. */
export function installmentsValue(scope: Pick<AudienceFilters, "installments" | "lastYear">): string {
  return scope.lastYear ? LAST_YEAR_TOKEN : scope.installments.join(",");
}

/**
 * A per-family fact a template's slots depend on.
 *
 * Any template can go to any audience, so a template can be pointed at a
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
 *
 * Keys a link may still carry from before 2026-09-10 — `maxTotalPaid`,
 * `minTotalPaid`, `overdue`, `carryForward`, `quote` — are not here, so nothing
 * reads them, nothing re-emits them, and they vanish on the first navigation.
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
  "paid",
  "minDueAmount",
  "lateFee",
  "promise",
  "skipOverdue",
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
 * Emits every key explicitly, including the ones equal to a default. That is
 * the point: a TEMPLATE chip changes only the message keys and a TILE changes
 * only the audience keys, and neither can reset the other's half because both
 * halves are always in the URL.
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
  set("installments", installmentsValue(source));
  set("installmentMatch", source.installmentMatch);
  set("paid", source.paid);
  set("minDueAmount", String(source.minDueAmount));
  set("lateFee", source.lateFee);
  set("promise", source.promise);
  set("skipOverdue", source.skipOverdue ? "on" : null);
  set("classId", source.classId);
  set("includeRte", source.includeRte ? "on" : null);
  set("include", source.includeStudentIds.join(","));
  set("exclude", source.excludeStudentIds.join(","));

  for (const [key, value] of Object.entries(override)) {
    set(key as ReminderQueryKey, value ?? null);
  }

  return params;
}

/**
 * The href that toggles one installment tile.
 *
 * Built on `reminderQuery`, so the template, the language, the date, the late
 * fee, the class, the narrowing controls AND the hand-picked students all
 * carry: the office is refining a list, not rebuilding one. Tapping a tile
 * while Last year is on leaves Last year — the two share one key.
 *
 * Returns null when the tap would leave zero tiles, which is not a state; the
 * builder renders that tile as selected-and-inert. `skipOverdue` is dropped
 * the moment the selection touches a passed installment, because "not overdue
 * on anything" and "owing on an installment whose date has gone" cannot both
 * be true of a family, and a hidden filter that empties the list is exactly
 * the kind of thing this screen must not do.
 */
export function installmentTileHref(
  filters: ReminderQuerySource,
  installmentNo: number,
  calendar: { passed: readonly number[] },
): string | null {
  const selected = filters.lastYear ? [] : filters.installments;
  const next = selected.includes(installmentNo)
    ? selected.filter((value) => value !== installmentNo)
    : [...selected, installmentNo].sort((a, b) => a - b);
  if (next.length === 0) return null;
  const touchesPassed = next.some((value) => calendar.passed.includes(value));
  const params = reminderQuery(filters, {
    installments: next.join(","),
    skipOverdue: touchesPassed ? null : filters.skipOverdue ? "on" : null,
  });
  return `?${params.toString()}`;
}

/**
 * The href that toggles the Last-year tile.
 *
 * On: the one token, and `skipOverdue` dropped — last session's balance has no
 * installment to be overdue on. Off: back to the calendar's own default rather
 * than to an empty set, for the same reason `installmentTileHref` returns null.
 */
export function lastYearTileHref(
  filters: ReminderQuerySource,
  calendarDefault: readonly number[],
): string {
  const params = filters.lastYear
    ? reminderQuery(filters, { installments: calendarDefault.join(",") })
    : reminderQuery(filters, { installments: LAST_YEAR_TOKEN, skipOverdue: null });
  return `?${params.toString()}`;
}

/** The href for "owing on all of them" / "owing on any of them". */
export function installmentMatchHref(
  filters: ReminderQuerySource,
  match: InstallmentMatch,
): string {
  return `?${reminderQuery(filters, { installmentMatch: match }).toString()}`;
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
 * What a SAVED campaign stores about its audience: the tiles and the narrowing
 * controls, every one of them concrete.
 *
 * Hand-picked students are deliberately NOT here. A saved campaign is a
 * standing rule that a nightly cron replays; an included student bypasses the
 * filters AND the reminder cadence, so persisting one would message that family
 * every night forever. Include and exclude are decisions about today.
 */
export type SavedAudience = {
  installments: number[];
  lastYear: boolean;
  installmentMatch: InstallmentMatch;
  paid: PaidFilter;
  minDueAmount: number;
  lateFee: Tri;
  promise: PromiseFilter;
  skipOverdue: boolean;
  classId: string | null;
  includeRte: boolean;
};

/**
 * Read a stored campaign's audience.
 *
 * Every key it does not carry, or carries with a value the guards reject,
 * takes the default — the same default a bare screen opens on. `installments`
 * is accepted as an array of numbers, a comma string or the `last_year` token,
 * through the same reader the URL uses, so a rule saved from the manager and a
 * rule pasted from a link cannot disagree.
 *
 * There is no legacy branch. Production held zero rows when the audience moved
 * to tiles on 2026-09-10, so nothing written by the old engine exists to read.
 */
export function savedAudienceFrom(raw: Record<string, unknown>): SavedAudience {
  const number = (value: unknown, fallback: number): number => {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const installmentsRaw = Array.isArray(raw.installments)
    ? (raw.installments as unknown[]).map(String).join(",")
    : typeof raw.installments === "string"
      ? raw.installments
      : null;
  const tiles =
    raw.lastYear === true
      ? { installments: [], lastYear: true }
      : (parseInstallmentsValue(installmentsRaw) ?? {
          installments: [...DEFAULT_AUDIENCE_FILTERS.installments],
          lastYear: false,
        });

  return {
    installments: tiles.installments,
    lastYear: tiles.lastYear,
    installmentMatch: isInstallmentMatch(raw.installmentMatch)
      ? raw.installmentMatch
      : DEFAULT_AUDIENCE_FILTERS.installmentMatch,
    paid: isPaidFilter(raw.paid) ? raw.paid : DEFAULT_AUDIENCE_FILTERS.paid,
    minDueAmount: number(raw.minDueAmount, DEFAULT_AUDIENCE_FILTERS.minDueAmount),
    lateFee: isTri(raw.lateFee) ? raw.lateFee : DEFAULT_AUDIENCE_FILTERS.lateFee,
    promise: isPromiseFilter(raw.promise) ? raw.promise : DEFAULT_AUDIENCE_FILTERS.promise,
    skipOverdue: raw.skipOverdue === true || raw.skipOverdue === "on",
    classId: typeof raw.classId === "string" && raw.classId ? raw.classId : null,
    includeRte: raw.includeRte === true || raw.includeRte === "on",
  };
}

/**
 * A stored audience as query parameters, every key explicit.
 *
 * `installments` is always emitted — as the list, or as `last_year` — because
 * a Last-year campaign that omitted it would replay on the calendar's default
 * and chase this year's installments under last year's wording. An
 * `installments` of `[]` with no `lastYear` (a rule saved before any tile was
 * picked) is left absent so the parser opens it on the calendar.
 */
export function savedAudienceParams(saved: SavedAudience): Record<string, string> {
  const out: Record<string, string> = {
    installmentMatch: saved.installmentMatch,
    paid: saved.paid,
    minDueAmount: String(saved.minDueAmount),
    lateFee: saved.lateFee,
    promise: saved.promise,
  };
  const tiles = installmentsValue(saved);
  if (tiles) out.installments = tiles;
  if (saved.skipOverdue) out.skipOverdue = "on";
  if (saved.classId) out.classId = saved.classId;
  if (saved.includeRte) out.includeRte = "on";
  return out;
}
