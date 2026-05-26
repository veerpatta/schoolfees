/**
 * Defaulter cadence — pure functions for the Now / Soon / Later / Done
 * triage buckets and the heat-score that ranks the worklist.
 *
 * Inputs are intentionally narrow so this stays unit-testable without
 * Supabase: the most recent contact log summary per student + today's date.
 */

export type Cadence = "now" | "soon" | "later" | "done";

export type DefaulterContactSummary = {
  /** ISO date the staff snoozed this student to (yyyy-mm-dd), or null.
   *  When the last outcome is `promised_pay`, this is the promised date. */
  snoozeUntil: string | null;
  /** ISO timestamp of last contact, or null if never contacted. */
  lastContactedAt: string | null;
  /** Last recorded outcome — drives the inline status chip. */
  lastOutcome?:
    | "reached"
    | "no_answer"
    | "promised_pay"
    | "dispute"
    | "other"
    | null;
  /** Channel of the last contact attempt, for the inline icon. */
  lastChannel?:
    | "call"
    | "whatsapp"
    | "sms"
    | "in_person"
    | "email"
    | null;
  /** Number of consecutive no_answer outcomes ending at the most recent row. */
  noAnswerStreak?: number;
  /** Total contact attempts recorded for this student in the session. */
  totalAttempts?: number;
};

/**
 * Returns the cadence bucket for a single student. Pure — no IO.
 *
 * Buckets (post-redesign):
 *   - now   → has dues, no attempt today, not snoozed (officer's main list)
 *   - soon  → promised today, OR no-answer ≥24h ago, OR snooze landed today
 *   - later → snoozed for the future
 *   - done  → contacted in last 6 hours (out of sight for today)
 */
export function deriveCadence(
  contact: DefaulterContactSummary,
  today: Date = new Date(),
): Cadence {
  const todayUtc = startOfDayUtc(today);
  const tomorrowUtc = new Date(todayUtc);
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);

  const snoozeMs = contact.snoozeUntil ? parseIsoDateMs(contact.snoozeUntil) : null;

  const promisedToday =
    contact.lastOutcome === "promised_pay" &&
    snoozeMs !== null &&
    snoozeMs <= todayUtc.getTime();

  const snoozedFuture = snoozeMs !== null && snoozeMs > todayUtc.getTime();

  const lastTouchMs = parseIsoTimestamp(contact.lastContactedAt);
  const hoursSinceLastTouch =
    lastTouchMs !== null
      ? (today.getTime() - lastTouchMs) / (1000 * 60 * 60)
      : null;

  if (hoursSinceLastTouch !== null && hoursSinceLastTouch < 6) {
    // Just touched — out of "Now" so we don't double-call within hours.
    return promisedToday ? "soon" : "done";
  }

  if (promisedToday) return "soon";
  if (snoozedFuture) return "later";

  // No-answer rotation: if last attempt was no-answer and < 24h ago, give it
  // some breathing room before showing again — but keep it in Soon, not Done.
  if (
    contact.lastOutcome === "no_answer" &&
    hoursSinceLastTouch !== null &&
    hoursSinceLastTouch < 24
  ) {
    return "soon";
  }

  return "now";
}

/**
 * Add N days to today, returning a yyyy-mm-dd ISO date string.
 * Used by the contact popover when staff picks "snooze 2 days".
 */
export function snoozeIso(days: number, today: Date = new Date()): string {
  const next = startOfDayUtc(today);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export type CadenceCounts = Record<Cadence, number>;

export function tallyCadence(
  rows: readonly DefaulterContactSummary[],
  today: Date = new Date(),
): CadenceCounts {
  const counts: CadenceCounts = { now: 0, soon: 0, later: 0, done: 0 };
  for (const row of rows) {
    counts[deriveCadence(row, today)] += 1;
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/* Heat score                                                                  */
/* -------------------------------------------------------------------------- */

export type HeatInput = {
  /** Total outstanding amount, rupees. */
  totalPending: number;
  /** Days past the oldest due date (>= 0). */
  daysOverdue: number;
  /** Contact-log summary for the student, if any. */
  contact: DefaulterContactSummary | null;
  /** Today's date for relative calculations. */
  today?: Date;
};

/**
 * Returns a 0–100 "heat" — higher means call this student sooner.
 *
 * Pure weighted formula, no ML. Tunable by changing the constants below.
 *
 *   moneyWeight       → 0–40   (caps so chronic large balances don't always top)
 *   ageWeight         → 0–25
 *   promiseWeight     → 0–30   (promised today and unpaid is hottest)
 *   responsivenessAdj → -25–+10 (cools down chronic no-answers; warms recently reached but unpaid)
 *   freshness         → 0–10   (recently attempted cools off)
 *
 * Result is clamped to 0–100.
 */
export function heatScore(input: HeatInput): number {
  const today = input.today ?? new Date();
  const contact = input.contact;

  // 1) Money — log-ish curve, capped.
  const moneyWeight = clamp(
    Math.round(Math.log10(Math.max(1, input.totalPending)) * 10),
    0,
    40,
  );

  // 2) Age — caps at 60 days so a 6-month chronic doesn't always be #1.
  const ageWeight = clamp(Math.round((input.daysOverdue / 60) * 25), 0, 25);

  // 3) Promise weight — only when outcome=promised_pay and snooze_until set.
  let promiseWeight = 0;
  if (
    contact?.lastOutcome === "promised_pay" &&
    contact.snoozeUntil &&
    contact.lastContactedAt
  ) {
    const promiseDateMs = parseIsoDateMs(contact.snoozeUntil);
    if (promiseDateMs !== null) {
      const promisedDaysFromToday = Math.floor(
        (promiseDateMs - startOfDayUtc(today).getTime()) / 86_400_000,
      );
      if (promisedDaysFromToday <= 0) {
        // Promised on or before today and not yet paid → very hot.
        promiseWeight = 30;
      } else if (promisedDaysFromToday <= 2) {
        promiseWeight = 10;
      } else {
        promiseWeight = -10; // wait, parent committed to a future date
      }
    }
  }

  // 4) Responsiveness — chronic no-answer cools; recently-reached-but-unpaid warms.
  let responsivenessAdj = 0;
  const streak = contact?.noAnswerStreak ?? 0;
  if (streak >= 5) responsivenessAdj -= 20;
  else if (streak >= 3) responsivenessAdj -= 10;
  if (contact?.lastOutcome === "reached") responsivenessAdj += 10;

  // 5) Freshness — within last 6 hours, cool off (don't ring back same call).
  let freshness = 0;
  if (contact?.lastContactedAt) {
    const hoursSince =
      (today.getTime() - new Date(contact.lastContactedAt).getTime()) /
      (1000 * 60 * 60);
    if (hoursSince < 6) freshness = -20;
    else if (hoursSince < 24) freshness = -10;
  }

  const score = moneyWeight + ageWeight + promiseWeight + responsivenessAdj + freshness;
  return clamp(score, 0, 100);
}

export type HeatLevel = "cold" | "warm" | "hot" | "blazing";

export function heatLevel(score: number): HeatLevel {
  if (score >= 75) return "blazing";
  if (score >= 50) return "hot";
  if (score >= 25) return "warm";
  return "cold";
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseIsoDateMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
