import { addIsoDays, daysBetweenIsoDates } from "@/platform/helpers/date";

/**
 * Which installments the calendar says are worth a reminder today.
 *
 * The reminders used to open on a hardcoded `[1, 2]`. That was true in August
 * and quietly wrong from October: the office picked the notice, the screen
 * offered installments 1 and 2, and installment 3 passed its due date without
 * anything on the screen suggesting it existed. The fee calendar already knows
 * the answer — this file reads it.
 *
 * Deliberately free of `server-only`. The notice picker renders the derived set
 * and the phrase built from it as staff change the window, so the client bundle
 * reaches this file. It therefore takes a plain schedule array rather than
 * calling `getFeePolicySummary` itself.
 *
 * Pure date arithmetic lives in `@/platform/helpers/date` rather than here,
 * because the defaulters pre-due window needs the same IST day counting and
 * `whatsapp` importing `defaulters` would be a new module edge that
 * `npm run quality:architecture` counts against us.
 */

/**
 * How far ahead a courtesy notice looks.
 *
 * Ten days rather than the defaulters screen's fourteen: this window decides
 * whether a parent is asked to pay, and the fee counter wants the ask close
 * enough to the date that it still reads as urgent. An admin setting, because
 * the right number is a collections judgement and will be argued about.
 */
export const DEFAULT_PRE_DUE_WINDOW_DAYS = 10;

/**
 * The point at which the courtesy notice becomes the firm one.
 *
 * T-3 is when "the late fee applies from the day after" stops being a warning
 * about next week and starts being a warning about this week.
 */
export const FINAL_NOTICE_DAYS_BEFORE_DUE = 3;

export type ScheduledInstallment = {
  /** 1-based, matching `inst1_pending` … `inst4_pending`. */
  installmentNo: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
};

export type InstallmentTiming = {
  installmentNo: number;
  dueDate: string;
  /** Negative once the date has passed. */
  daysUntilDue: number;
};

export type InstallmentCalendar = {
  /** Due date on or before today — the late fee is either charged or about to be. */
  passed: number[];
  /** Due after today but inside the pre-due window. */
  upcoming: number[];
  /**
   * `passed` + `upcoming`, sorted. The derived default for the installment
   * filter, replacing the hardcoded `[1, 2]`.
   */
  active: number[];
  /** The nearest installment still ahead of us, inside the window. */
  next: InstallmentTiming | null;
  /** The most recently passed installment, if any. */
  lastPassed: InstallmentTiming | null;
  /** Every installment with a readable due date, in order. */
  timings: InstallmentTiming[];
  /** The window this calendar was built with, so callers can say it out loud. */
  windowDays: number;
};

/**
 * Read `getFeePolicySummary().installmentSchedule` into installment numbers.
 *
 * The schedule array's ORDER is the installment number — that is how
 * `fees/data/generator.ts` writes the rows (`forEach((schedule, index)`), so
 * reading a number out of the label would be a second, weaker source for
 * something the array position already says. Entries without a usable due date
 * are dropped rather than defaulted: an installment whose date we cannot read
 * must not be announced to a parent as due.
 */
export function readInstallmentSchedule(
  schedule: ReadonlyArray<{ dueDate?: string | null }> | null | undefined,
): ScheduledInstallment[] {
  return (schedule ?? [])
    .map((entry, index) => ({
      installmentNo: index + 1,
      dueDate: String(entry?.dueDate ?? "").trim(),
    }))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate));
}

/**
 * What today makes of the fee calendar.
 *
 * `windowDays` of 0 means "only what has already passed", which is what an
 * office that never sends courtesy notices would set it to. A negative window is
 * clamped rather than rejected — a hand-edited setting must not empty the list
 * without saying why.
 */
export function buildInstallmentCalendar(args: {
  schedule: ReadonlyArray<{ dueDate?: string | null }> | null | undefined;
  /** `YYYY-MM-DD`, IST. */
  today: string;
  windowDays?: number;
}): InstallmentCalendar {
  const windowDays = Math.max(0, Math.round(args.windowDays ?? DEFAULT_PRE_DUE_WINDOW_DAYS));
  const entries = readInstallmentSchedule(args.schedule);

  const timings: InstallmentTiming[] = [];
  for (const entry of entries) {
    const daysUntilDue = daysBetweenIsoDates(args.today, entry.dueDate);
    if (daysUntilDue === null) continue;
    timings.push({ installmentNo: entry.installmentNo, dueDate: entry.dueDate, daysUntilDue });
  }
  timings.sort((left, right) => left.installmentNo - right.installmentNo);

  const passed = timings.filter((entry) => entry.daysUntilDue <= 0);
  const upcoming = timings.filter(
    (entry) => entry.daysUntilDue > 0 && entry.daysUntilDue <= windowDays,
  );

  // Nearest first, so "the next installment" is the one a parent is being asked
  // about rather than whichever came first in the schedule.
  const next = [...upcoming].sort((left, right) => left.daysUntilDue - right.daysUntilDue)[0] ?? null;
  // Most recently passed, so a late-fee notice names the date that just went by
  // rather than April's.
  const lastPassed =
    [...passed].sort((left, right) => right.daysUntilDue - left.daysUntilDue)[0] ?? null;

  const passedNos = passed.map((entry) => entry.installmentNo);
  const upcomingNos = upcoming.map((entry) => entry.installmentNo);

  return {
    passed: passedNos,
    upcoming: upcomingNos,
    active: [...new Set([...passedNos, ...upcomingNos])].sort((a, b) => a - b),
    next,
    lastPassed,
    timings,
    windowDays,
  };
}

/**
 * Is this the moment for the firm wording rather than the courtesy one?
 *
 * True from T-3 up to and including the due date. The two notices share an
 * audience and differ only in how the late fee is put, so this is the whole
 * decision between them.
 */
export function isFinalNoticeWindow(
  daysUntilDue: number,
  threshold = FINAL_NOTICE_DAYS_BEFORE_DUE,
): boolean {
  return daysUntilDue >= 0 && daysUntilDue <= threshold;
}

/**
 * The day after an installment's due date — the day the ledger starts charging.
 *
 * The firm notice says the late fee applies "from" this date, so it has to be
 * the ledger's first charging day and not the due date itself, which is still
 * free.
 */
export function lateFeeStartsOn(dueDate: string): string | null {
  return addIsoDays(dueDate, 1);
}

/* ------------------------------------------------------------- the date rule */

/**
 * Does this notice need a date the parent can still meet?
 *
 * The rule changed meaning when the calendar-driven notices arrived, and it is
 * now per situation rather than universal:
 *
 * - The forward-looking notices — `upcoming`, `upcoming_final`, `fee_due`,
 *   `balance`, `promise_lapsed`, `prevyear` — all print a date the family is
 *   asked to beat. A date already gone tells a parent to meet a deadline that
 *   has passed, so it is refused. This is the live replacement for the old
 *   fixed-deadline constant.
 *
 * - `late_fee_applied` carries **no date slot at all**. Its seven slots are
 *   three names, the installment, and three figures — the fee is charged, not
 *   threatened, so there is nothing to be on time for. Requiring a future date
 *   there would block the one notice whose whole subject is that a date has
 *   already gone.
 *
 * Returns the sentence to show the office, or null when the date is fine. Pure,
 * so `tests/unit/whatsapp-reminder-calendar.test.ts` can pin every branch
 * without a Supabase client.
 */
export function describeDateGuard(args: {
  situation: string;
  /** ISO, or null when the field was empty or unparseable. */
  lastDateIso: string | null;
  /** What the office typed, for the message. */
  lastDateLabel: string;
  today: string;
}): string | null {
  const { situation, lastDateIso, lastDateLabel, today } = args;

  // No date on the message means no date to check.
  if (situation === "late_fee_applied") return null;

  if (!lastDateIso) return "Pick a last date for this notice before sending.";
  if (lastDateIso < today) {
    return `The last date on this notice is ${lastDateLabel}, which has already passed. Pick a date parents can still meet.`;
  }
  return null;
}
