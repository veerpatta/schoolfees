/**
 * How often one family may receive a WhatsApp fee reminder.
 *
 * No `server-only`: the reminders screen renders the cadence picker on every
 * row, so the client bundle reaches this. Keep it free of anything that touches
 * Supabase or env.
 *
 * The gap is always measured against `whatsapp_reminder_sends.sent_on` — what
 * was actually sent — rather than a "last reminded" column that could drift
 * away from the send log.
 */

export const REMINDER_CADENCES = [
  { value: "every_run", label: "Every run", gapDays: 0 },
  { value: "weekly", label: "Weekly", gapDays: 7 },
  { value: "fortnightly", label: "Fortnightly", gapDays: 14 },
  { value: "monthly", label: "Monthly", gapDays: 30 },
  { value: "never", label: "Never", gapDays: Number.POSITIVE_INFINITY },
] as const;

export type ReminderCadence = (typeof REMINDER_CADENCES)[number]["value"];

export const DEFAULT_CADENCE: ReminderCadence = "every_run";

/** The cadence values the database's check constraint accepts. */
export const CADENCE_VALUES: readonly string[] = REMINDER_CADENCES.map((entry) => entry.value);

export function cadenceGapDays(cadence: ReminderCadence): number {
  return REMINDER_CADENCES.find((entry) => entry.value === cadence)?.gapDays ?? 0;
}

export function cadenceLabel(cadence: ReminderCadence): string {
  return REMINDER_CADENCES.find((entry) => entry.value === cadence)?.label ?? cadence;
}

/**
 * Date arithmetic on a `YYYY-MM-DD` string, done in UTC so it cannot slide a
 * day when the server sits in a different zone from the school.
 */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
