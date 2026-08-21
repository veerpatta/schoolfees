import { calculateDaysOverdue } from "@/modules/fees/domain/due-amounts";

import type { RepaymentPlanSummary } from "./types";

/**
 * How a family on an EMI plan should be scored on the Defaulters list.
 *
 * A plan replaces the due-date calendar for the installments it covers, and
 * only those. A family paying their EMI on time is NOT a defaulter even though
 * the underlying installments are months past their original dates — chasing
 * them for dues the school itself agreed to defer is the exact failure this
 * guards against. Dues the plan does not cover keep their own due dates and
 * stay chaseable as usual.
 */
export type PlanAwareOverdue = {
  /** Rupees genuinely overdue: excluded dues + whatever the plan is behind by. */
  overdueAmount: number;
  /** Days past the older of the two calendars. */
  daysOverdue: number;
  /** Earliest date the family next owes anything, on either calendar. */
  nextDueDate: string | null;
  /** True when an EMI has gone past its date unpaid. Drives the follow-up copy. */
  planIsBehind: boolean;
};

export function resolvePlanAwareOverdue(payload: {
  plan: RepaymentPlanSummary | null;
  /** Normal overdue amount from dues the plan does NOT cover. */
  excludedOverdueAmount: number;
  /** Oldest unpaid due date among dues the plan does NOT cover. */
  excludedNextDueDate: string | null;
  today: string;
}): PlanAwareOverdue {
  const excludedDaysOverdue = calculateDaysOverdue(payload.excludedNextDueDate, payload.today);

  if (!payload.plan) {
    return {
      overdueAmount: payload.excludedOverdueAmount,
      daysOverdue: excludedDaysOverdue,
      nextDueDate: payload.excludedNextDueDate,
      planIsBehind: false,
    };
  }

  const plan = payload.plan;
  // catch_up_amount is 0 while the family is on track or the plan has not
  // started, so an on-time plan contributes nothing to the overdue total.
  const planOverdueAmount = Math.max(plan.catchUpAmount, 0);
  // The next unpaid scheduled row IS the plan's oldest unmet obligation, so
  // days-overdue against it is the plan-side equivalent of the normal rule.
  const planDaysOverdue = calculateDaysOverdue(plan.nextDueDate, payload.today);

  const candidateDueDates = [payload.excludedNextDueDate, plan.nextDueDate].filter(
    (value): value is string => Boolean(value),
  );

  return {
    overdueAmount: payload.excludedOverdueAmount + planOverdueAmount,
    daysOverdue: Math.max(excludedDaysOverdue, planDaysOverdue),
    nextDueDate:
      candidateDueDates.length > 0
        ? candidateDueDates.reduce((earliest, value) => (value < earliest ? value : earliest))
        : null,
    planIsBehind: plan.missedInstallmentCount > 0,
  };
}


/**
 * How a payment of `amount` will split between the plan and everything else.
 *
 * Mirrors `post_student_payment_with_adjustments`, which allocates the active
 * plan's installments first and lets the excess spill into the rest. The desk
 * shows this BEFORE posting so a cashier is never surprised by where the money
 * went, and again after, from the receipt link the RPC actually wrote.
 */
export function splitPaymentAcrossPlan(payload: {
  amount: number;
  planRemainingBalance: number;
}) {
  const amount = Math.max(payload.amount, 0);
  const toPlan = Math.min(amount, Math.max(payload.planRemainingBalance, 0));

  return { toPlan, toOtherDues: amount - toPlan };
}
