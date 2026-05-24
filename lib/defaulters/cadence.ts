/**
 * Defaulter cadence — pure functions for the "Call today / This week /
 * Snoozed" triage tabs.
 *
 * Inputs are intentionally narrow so this stays unit-testable without
 * Supabase: the most recent contact log entry per student + today's date.
 * The Defaulters page composes these against whatever query shape the
 * DB returns.
 */

export type Cadence = "call_today" | "this_week" | "snoozed";

export type DefaulterContactSummary = {
  /** ISO date the staff snoozed this student to (yyyy-mm-dd), or null. */
  snoozeUntil: string | null;
  /** ISO timestamp of last contact, or null if never contacted. */
  lastContactedAt: string | null;
};

/**
 * Returns the cadence bucket for a single student. Pure — no IO.
 *
 * Rules:
 *   - snoozeUntil > today + 7 days → snoozed
 *   - snoozeUntil > today and ≤ today + 7 days → this_week
 *   - snoozeUntil ≤ today, or no snooze → call_today
 *   - never contacted → call_today
 */
export function deriveCadence(
  contact: DefaulterContactSummary,
  today: Date = new Date(),
): Cadence {
  const todayUtc = startOfDayUtc(today);
  const sevenDaysOut = new Date(todayUtc);
  sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);

  if (!contact.snoozeUntil) return "call_today";

  const snooze = parseIsoDate(contact.snoozeUntil);
  if (!snooze) return "call_today";

  if (snooze.getTime() <= todayUtc.getTime()) return "call_today";
  if (snooze.getTime() <= sevenDaysOut.getTime()) return "this_week";
  return "snoozed";
}

/**
 * Add N days to an ISO date string, returning a new ISO date string.
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
  const counts: CadenceCounts = { call_today: 0, this_week: 0, snoozed: 0 };
  for (const row of rows) {
    counts[deriveCadence(row, today)] += 1;
  }
  return counts;
}

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseIsoDate(value: string): Date | null {
  // Accept "yyyy-mm-dd" or any ISO that starts with it.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
