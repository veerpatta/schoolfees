import type { DashboardInstallmentSummaryRow } from "@/lib/dashboard/summary";

/**
 * The two figures the phone boards need that nothing stores.
 *
 * Deliberately NOT `server-only` — these are arithmetic, and the unit tests
 * import them directly. Same posture as `lib/dashboard/kpi-delta.ts`.
 *
 * Every date here is an `YYYY-MM-DD` string in the school's timezone, already
 * resolved by the caller. Nothing in this file constructs a local-time `Date`:
 * a server in UTC and a phone in IST must agree on which day it is, and
 * `new Date("2026-08-14")` parses as UTC midnight while `new Date(2026, 7, 14)`
 * does not.
 */

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` → epoch ms at UTC midnight. */
function isoToUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  return utcMsToIso(isoToUtcMs(iso) + days * MS_PER_DAY);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / MS_PER_DAY);
}

/* ── Pace to year end ──────────────────────────────────────────────────── */

export type PaceToYearEnd = {
  /** Percent of the year's expected total already collected. */
  collectedPct: number;
  /** Percent that was due by today — where the marker sits. */
  expectedPct: number;
  collected: number;
  /** Sum of every installment whose due date has passed. */
  expectedToDate: number;
  /** 0 when on pace or ahead. */
  daysBehind: number;
  /** 0 when there is nothing to catch up. */
  catchUpPerDay: number;
  daysLeftInMonth: number;
};

/**
 * Where the year should be by now, and what it would take to get back there.
 *
 * "Should be" is a STEP function, not a linear ramp: money is due on a stated
 * date, and a ramp would put a figure on the screen the school never agreed to.
 * On 14 August with installments due 20 Apr and 20 Jul, two installments are
 * due — not 4.5 months' worth of a smooth curve.
 *
 * Returns null when there is no schedule or no expected total, which is the
 * honest answer for a session whose fees have not been generated yet.
 */
export function computePaceToYearEnd(input: {
  installmentSummary: DashboardInstallmentSummaryRow[];
  currentYearExpected: number;
  currentYearCollected: number;
  todayIso: string;
}): PaceToYearEnd | null {
  const { currentYearExpected, currentYearCollected, todayIso } = input;
  if (currentYearExpected <= 0) return null;

  // This year's installments only. Carry-forward rows arrive with a pseudo
  // installment number in the 90s and belong to old balance, not to a track
  // of how this year is progressing — the same guard the phone home applies.
  const schedule = input.installmentSummary
    .filter(
      (row) =>
        !row.isCarryForward &&
        row.installmentNo < 90 &&
        row.expectedAmount > 0 &&
        Boolean(row.dueDate),
    )
    .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""));

  if (schedule.length === 0) return null;

  let expectedToDate = 0;
  for (const row of schedule) {
    if ((row.dueDate as string) <= todayIso) expectedToDate += row.expectedAmount;
  }

  // Which installment is the school still paying for? Filling in due-date order
  // is what the allocator actually does (lib/payments/allocation.ts), so this
  // pill agrees with the ledger rather than modelling a different world.
  let cumulative = 0;
  let behindSince: string | null = null;
  for (const row of schedule) {
    cumulative += row.expectedAmount;
    if (cumulative > currentYearCollected) {
      behindSince = row.dueDate as string;
      break;
    }
  }

  const daysBehind =
    behindSince && behindSince < todayIso ? daysBetweenIso(behindSince, todayIso) : 0;

  const gap = Math.max(0, expectedToDate - currentYearCollected);
  const [year, month, day] = todayIso.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysLeftInMonth = Math.max(1, daysInMonth - day + 1);

  return {
    collectedPct: (currentYearCollected / currentYearExpected) * 100,
    expectedPct: (expectedToDate / currentYearExpected) * 100,
    collected: currentYearCollected,
    expectedToDate,
    daysBehind,
    catchUpPerDay: gap > 0 ? Math.ceil(gap / daysLeftInMonth) : 0,
    daysLeftInMonth,
  };
}

/* ── Daily money taken ─────────────────────────────────────────────────── */

export type DailyPoint = { date: string; amount: number };

/**
 * `collectionHeatmap` is built from a Map keyed by date, so a day on which
 * nobody paid is ABSENT, not zero. Every derivation below has to put those days
 * back before it averages anything — otherwise "average per day" is really
 * "average per day that had a receipt", which on a school calendar with
 * Sundays and holidays reads roughly double.
 */
function padDailySeries(
  byDate: Map<string, number>,
  startIso: string,
  endIso: string,
): DailyPoint[] {
  const out: DailyPoint[] = [];
  if (startIso > endIso) return out;
  // Bounded so a bad date can never spin: a session is one academic year.
  for (let cursor = startIso, guard = 0; cursor <= endIso && guard < 800; guard += 1) {
    out.push({ date: cursor, amount: byDate.get(cursor) ?? 0 });
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

/**
 * The last `windowDays` days ending today, zero-filled.
 *
 * Clamped to the session's first collection date rather than padded backwards
 * past it: pre-session zeros are not quiet days, they are days that did not
 * exist, and averaging over them would understate a session that opened a week
 * ago.
 */
export function buildDailySeries(
  heatmap: readonly DailyPoint[],
  todayIso: string,
  windowDays: number,
): DailyPoint[] {
  if (heatmap.length === 0) return [];
  const byDate = new Map(heatmap.map((point) => [point.date, point.amount]));
  const firstIso = heatmap[0].date;
  const windowStart = addDaysIso(todayIso, -(Math.max(1, windowDays) - 1));
  const startIso = windowStart > firstIso ? windowStart : firstIso;
  return padDailySeries(byDate, startIso, todayIso);
}

export type DailySeriesSummary = {
  average: number;
  best: number;
  zeroDays: number;
};

export function summariseDailySeries(series: readonly DailyPoint[]): DailySeriesSummary {
  if (series.length === 0) return { average: 0, best: 0, zeroDays: 0 };
  let total = 0;
  let best = 0;
  let zeroDays = 0;
  for (const point of series) {
    total += point.amount;
    if (point.amount > best) best = point.amount;
    if (point.amount === 0) zeroDays += 1;
  }
  return { average: Math.round(total / series.length), best, zeroDays };
}

/**
 * Average money taken per weekday across the whole session so far.
 *
 * Index 0 is Sunday, matching `Date#getUTCDay`. Zero-filled first: a session
 * with three Sundays of which one had a receipt must divide by three, not one,
 * or Sunday outranks Friday.
 */
export function buildWeekdayAverages(
  heatmap: readonly DailyPoint[],
  todayIso: string,
): number[] {
  const averages = [0, 0, 0, 0, 0, 0, 0];
  if (heatmap.length === 0) return averages;

  const byDate = new Map(heatmap.map((point) => [point.date, point.amount]));
  const endIso = todayIso > heatmap[heatmap.length - 1].date
    ? todayIso
    : heatmap[heatmap.length - 1].date;
  const series = padDailySeries(byDate, heatmap[0].date, endIso);

  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const point of series) {
    const weekday = new Date(isoToUtcMs(point.date)).getUTCDay();
    totals[weekday] += point.amount;
    counts[weekday] += 1;
  }

  for (let index = 0; index < 7; index += 1) {
    averages[index] = counts[index] > 0 ? Math.round(totals[index] / counts[index]) : 0;
  }
  return averages;
}
