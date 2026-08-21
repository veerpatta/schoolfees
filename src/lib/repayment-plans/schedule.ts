/**
 * EMI schedule arithmetic, mirrored from `private.repayment_plan_schedule`.
 *
 * The database is authoritative — it writes the rows that a family is held to.
 * These functions exist so the Student Edit preview can show a term and an end
 * date the instant an admin types an amount, without a round trip, and so the
 * clamping rules are unit-testable without a database. Any change here must be
 * mirrored in the migration, and vice versa.
 */

import {
  REPAYMENT_PLAN_MAX_TERM_MONTHS,
  type RepaymentScheduleItem,
} from "./types";

function toIsoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Add `months` to a date, keeping the day-of-month but never rolling into the
 * next month. 31 Jan + 1 month is 28 Feb (29 in a leap year), not 3 March —
 * which is what naive date arithmetic produces and what would quietly move a
 * family's due date.
 */
export function addMonthsClamped(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) {
    return isoDate;
  }

  const targetMonthIndex = month - 1 + months;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonthIndex + 1, 0),
  ).getUTCDate();

  return toIsoDate(
    new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDayOfTargetMonth))),
  );
}

/**
 * How many months `monthlyAmount` needs to clear `openingBalance`. The final
 * EMI absorbs the remainder, so the term is a ceiling, never a rounding.
 */
export function calculateRepaymentTermMonths(
  openingBalance: number,
  monthlyAmount: number,
) {
  if (!Number.isFinite(openingBalance) || openingBalance <= 0) {
    return 0;
  }

  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    return 0;
  }

  return Math.max(Math.ceil(openingBalance / monthlyAmount), 1);
}

export function buildRepaymentSchedule(payload: {
  openingBalance: number;
  monthlyAmount: number;
  firstDueDate: string;
  /**
   * One date per instalment, overriding the generated monthly calendar. Short
   * or sparse arrays fall back per row, so the admin can move one date without
   * restating the rest.
   */
  customDueDates?: ReadonlyArray<string | null | undefined>;
}): RepaymentScheduleItem[] {
  const termMonths = calculateRepaymentTermMonths(
    payload.openingBalance,
    payload.monthlyAmount,
  );

  if (termMonths <= 0) {
    return [];
  }

  return Array.from({ length: termMonths }, (_unused, index) => ({
    sequenceNo: index + 1,
    dueDate:
      payload.customDueDates?.[index] || addMonthsClamped(payload.firstDueDate, index),
    amount:
      index < termMonths - 1
        ? payload.monthlyAmount
        : payload.openingBalance - payload.monthlyAmount * (termMonths - 1),
  }));
}

/**
 * The smallest monthly amount that still clears the balance inside the 12-month
 * cap. Used to turn "that is too long" into a number the admin can act on.
 */
export function minimumMonthlyAmountForMaxTerm(openingBalance: number) {
  if (!Number.isFinite(openingBalance) || openingBalance <= 0) {
    return 0;
  }

  return Math.ceil(openingBalance / REPAYMENT_PLAN_MAX_TERM_MONTHS);
}

export type RepaymentPlanDraftValidation =
  | {
      ok: true;
      openingBalance: number;
      monthlyAmount: number;
      firstDueDate: string;
      termMonths: number;
      finalInstallmentAmount: number;
      endDate: string;
      schedule: RepaymentScheduleItem[];
    }
  | { ok: false; message: string };

/**
 * Client-side gate for the activation form. The RPC re-checks all of this —
 * this exists so the admin is not told "no" only after submitting.
 */
export function validateRepaymentPlanDraft(payload: {
  openingBalance: number;
  monthlyAmount: number;
  firstDueDate: string;
  reason: string;
  acknowledged: boolean;
  customDueDates?: ReadonlyArray<string | null | undefined>;
}): RepaymentPlanDraftValidation {
  if (!Number.isInteger(payload.openingBalance) || payload.openingBalance <= 0) {
    return { ok: false, message: "This student has no unpaid dues in the selected scope." };
  }

  if (!Number.isInteger(payload.monthlyAmount) || payload.monthlyAmount <= 0) {
    return { ok: false, message: "Enter a whole rupee monthly EMI amount greater than 0." };
  }

  if (!payload.firstDueDate) {
    return { ok: false, message: "Choose the first EMI due date." };
  }

  const termMonths = calculateRepaymentTermMonths(
    payload.openingBalance,
    payload.monthlyAmount,
  );

  if (termMonths > REPAYMENT_PLAN_MAX_TERM_MONTHS) {
    return {
      ok: false,
      message: `At Rs ${payload.monthlyAmount} a month this plan needs ${termMonths} months. The maximum term is ${REPAYMENT_PLAN_MAX_TERM_MONTHS} months — Rs ${minimumMonthlyAmountForMaxTerm(payload.openingBalance)} a month or more clears it in time.`,
    };
  }

  if (payload.reason.trim().length < 4) {
    return { ok: false, message: "Enter a reason of at least 4 characters." };
  }

  if (!payload.acknowledged) {
    return {
      ok: false,
      message: "Confirm you understand that payments clear EMI debt before any other fees.",
    };
  }

  const schedule = buildRepaymentSchedule(payload);

  // Mirrors the student_repayment_schedule_dates_ascend trigger. Caught here so
  // the admin is told before submitting, not after.
  for (let index = 1; index < schedule.length; index += 1) {
    if (schedule[index].dueDate <= schedule[index - 1].dueDate) {
      return {
        ok: false,
        message: `EMI ${index + 1} is dated on or before EMI ${index}. Each due date must be later than the one before it.`,
      };
    }
  }

  const finalRow = schedule[schedule.length - 1];

  return {
    ok: true,
    openingBalance: payload.openingBalance,
    monthlyAmount: payload.monthlyAmount,
    firstDueDate: payload.firstDueDate,
    termMonths,
    finalInstallmentAmount: finalRow.amount,
    endDate: finalRow.dueDate,
    schedule,
  };
}
