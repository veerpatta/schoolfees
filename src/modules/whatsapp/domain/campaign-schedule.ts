import { addIsoDays, daysBetweenIsoDates } from "@/platform/helpers/date";
import type { InstallmentCalendar } from "@/modules/whatsapp/domain/installment-calendar";

/**
 * When a saved campaign is due to run.
 *
 * "Send the T-10 reminder for installment 3" used to live in somebody's head.
 * It was remembered, or it was not, and nothing on the screen could tell the
 * difference. This turns it into a row on a card.
 *
 * Relative to an installment rather than to a calendar date, because the fee
 * calendar already knows the dates: a campaign written in April should still
 * fire correctly in January without anyone editing it. An absolute `runOn` is
 * allowed for a genuine one-off.
 *
 * Pure. `campaignsDueOn` takes the campaigns, the calendar and today, and
 * returns what is due — no clock, no Supabase client, so
 * `tests/unit/whatsapp-campaign-schedule.test.ts` pins every branch.
 */

export type CampaignSchedule = {
  /** 1-4. Which installment the offset is measured from. */
  installment?: number;
  /** Negative before the due date, positive after. -10, -3, +1, +15. */
  offsetDays?: number;
  /** `YYYY-MM-DD` for a one-off that is not tied to an installment. */
  runOn?: string;
  /**
   * Let the cron send this without a press.
   *
   * Off unless an admin turns it on, and the screen says out loud that the
   * campaign will send itself. Absent reads as false — a schedule added without
   * deciding must not start sending.
   */
  auto?: boolean;
};

/**
 * Parse whatever is in the jsonb column.
 *
 * Returns null for anything unusable rather than throwing. A hand-edited or
 * half-written schedule must leave the campaign runnable by hand, not take the
 * screen down — the same rule `parseReminderFilters` follows for the query
 * string.
 */
export function parseCampaignSchedule(value: unknown): CampaignSchedule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const auto = raw.auto === true;
  const runOn = typeof raw.runOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.runOn)
    ? raw.runOn
    : undefined;

  const installment = Number(raw.installment);
  const offsetDays = Number(raw.offsetDays);
  const hasInstallment = Number.isInteger(installment) && installment >= 1 && installment <= 4;
  const hasOffset = Number.isFinite(offsetDays);

  if (runOn) return { runOn, auto };
  if (hasInstallment) {
    // An offset of 0 is meaningful — "on the day it falls due" — so a missing
    // one defaults to it rather than invalidating the schedule.
    return { installment, offsetDays: hasOffset ? Math.trunc(offsetDays) : 0, auto };
  }
  return null;
}

/** The date a schedule points at, or null when the calendar cannot answer. */
export function scheduledDateFor(
  schedule: CampaignSchedule,
  calendar: InstallmentCalendar,
): string | null {
  if (schedule.runOn) return schedule.runOn;
  if (!schedule.installment) return null;

  const timing = calendar.timings.find(
    (entry) => entry.installmentNo === schedule.installment,
  );
  // No due date for that installment means no slot. Silently treating it as
  // "today" would fire every scheduled campaign at once the first time a
  // session was published without a schedule.
  if (!timing) return null;

  return addIsoDays(timing.dueDate, schedule.offsetDays ?? 0);
}

export type ScheduledCampaignInput = {
  id: string;
  name: string;
  situation: string;
  language: string;
  /** Raw jsonb from the row; parsed here. */
  schedule: unknown;
  /** The `scheduled_for` dates this campaign has already run for. */
  ranForSlots: readonly string[];
};

export type DueCampaign = {
  id: string;
  name: string;
  situation: string;
  language: string;
  schedule: CampaignSchedule;
  /** The slot date this is due for. Stamped on the run as `scheduled_for`. */
  scheduledFor: string;
  /** 0 when due today, positive when the slot has already gone by. */
  daysOverdue: number;
  /** True when the cron may send it without a press. */
  auto: boolean;
};

/**
 * How long a missed slot keeps asking.
 *
 * A slot that came due while the office was shut should still be visible on
 * Monday. Past a week it is no longer "due", it is history — sending a T-10
 * reminder three weeks after the due date would quote a deadline that has gone,
 * and the date guard would refuse it anyway.
 */
export const OVERDUE_SLOT_WINDOW_DAYS = 7;

/**
 * Which saved campaigns are due today, or overdue and not yet run.
 *
 * A campaign is due when its slot date is today or within the last
 * {@link OVERDUE_SLOT_WINDOW_DAYS} days AND no run has already satisfied that
 * slot. Sorted most-overdue first, because the one that has been waiting
 * longest is the one at risk of being missed entirely.
 */
export function campaignsDueOn(
  campaigns: readonly ScheduledCampaignInput[],
  calendar: InstallmentCalendar,
  today: string,
  windowDays: number = OVERDUE_SLOT_WINDOW_DAYS,
): DueCampaign[] {
  const due: DueCampaign[] = [];

  for (const campaign of campaigns) {
    const schedule = parseCampaignSchedule(campaign.schedule);
    if (!schedule) continue;

    const scheduledFor = scheduledDateFor(schedule, calendar);
    if (!scheduledFor) continue;

    const daysOverdue = daysBetweenIsoDates(scheduledFor, today);
    // Negative means the slot is still ahead of us: not due, not overdue.
    if (daysOverdue === null || daysOverdue < 0 || daysOverdue > windowDays) continue;

    // Already satisfied. Compared on the SLOT, not on a date, so a slot run a
    // day late still counts as that slot rather than leaving it forever due.
    if (campaign.ranForSlots.includes(scheduledFor)) continue;

    due.push({
      id: campaign.id,
      name: campaign.name,
      situation: campaign.situation,
      language: campaign.language,
      schedule,
      scheduledFor,
      daysOverdue,
      auto: schedule.auto === true,
    });
  }

  return due.sort((left, right) => {
    if (left.daysOverdue !== right.daysOverdue) return right.daysOverdue - left.daysOverdue;
    return left.name.localeCompare(right.name);
  });
}

/**
 * "10 days before Installment 3" — how a schedule reads on screen.
 *
 * Written out rather than shown as `-10`, because a minus sign in front of a
 * number of days is the kind of thing that is read backwards once and then acted
 * on.
 */
export function describeSchedule(schedule: CampaignSchedule): string {
  if (schedule.runOn) return `On ${schedule.runOn}`;
  if (!schedule.installment) return "No schedule";

  const offset = schedule.offsetDays ?? 0;
  const target = `Installment ${schedule.installment}`;
  if (offset === 0) return `On the day ${target} falls due`;
  if (offset < 0) {
    const days = Math.abs(offset);
    return `${days} day${days === 1 ? "" : "s"} before ${target} is due`;
  }
  return `${offset} day${offset === 1 ? "" : "s"} after ${target} was due`;
}
