import { describe, expect, it } from "vitest";

import { buildRepaymentPlanQuickAmounts } from "@/lib/payments/workflow";
import { suggestRepaymentPlanAmount } from "@/lib/repayment-plans/data";
import {
  resolvePlanAwareOverdue,
  splitPaymentAcrossPlan,
} from "@/lib/repayment-plans/defaulter-view";
import type {
  RepaymentPlanCollectionContext,
  RepaymentPlanSummary,
} from "@/lib/repayment-plans/types";

function planContext(
  overrides: Partial<RepaymentPlanCollectionContext> = {},
): RepaymentPlanCollectionContext {
  return {
    planId: "plan-1",
    scope: "old_and_current",
    paymentStatus: "on_track",
    monthlyAmount: 4000,
    remainingBalance: 12850,
    catchUpAmount: 0,
    nextDueDate: "2026-09-30",
    nextDueAmount: 4000,
    missedInstallmentCount: 0,
    planReviewNeeded: false,
    coveredInstallmentIds: [],
    currentYearRemainsUnpaid: false,
    ...overrides,
  };
}

function planSummary(overrides: Partial<RepaymentPlanSummary> = {}): RepaymentPlanSummary {
  return {
    planId: "plan-1",
    studentId: "student-1",
    sessionLabel: "TEST-2026-27",
    scope: "old_and_current",
    lifecycle: "active",
    paymentStatus: "on_track",
    openingBalance: 16850,
    monthlyAmount: 4000,
    firstDueDate: "2026-08-31",
    termMonths: 5,
    finalInstallmentAmount: 850,
    endDate: "2026-12-31",
    waivedLateFeeTotal: 1000,
    itemCount: 4,
    remainingBalance: 12850,
    paidToDate: 4000,
    expectedToDate: 4000,
    catchUpAmount: 0,
    missedInstallmentCount: 0,
    paidInstallmentCount: 1,
    nextDueSequenceNo: 2,
    nextDueDate: "2026-09-30",
    nextDueAmount: 4000,
    reason: "Family requested monthly instalments",
    activatedAt: "2026-08-11T00:00:00Z",
    activatedByLabel: "Admin",
    cancelledAt: null,
    cancellationReason: null,
    supersedesPlanId: null,
    supersededByPlanId: null,
    planReviewNeeded: false,
    ...overrides,
  };
}

describe("suggestRepaymentPlanAmount", () => {
  it("asks for the catch-up figure when the family is behind", () => {
    expect(
      suggestRepaymentPlanAmount(planContext({ catchUpAmount: 8000, paymentStatus: "behind" })),
    ).toBe(8000);
  });

  it("asks for the next EMI when they are on track", () => {
    expect(suggestRepaymentPlanAmount(planContext())).toBe(4000);
  });

  it("never proposes more than the plan is worth", () => {
    expect(
      suggestRepaymentPlanAmount(
        planContext({ catchUpAmount: 99999, remainingBalance: 850, nextDueAmount: 850 }),
      ),
    ).toBe(850);
  });

  it("proposes nothing once the plan is cleared", () => {
    expect(suggestRepaymentPlanAmount(planContext({ remainingBalance: 0 }))).toBe(0);
  });

  it("falls back to the monthly amount when no next instalment is named", () => {
    expect(suggestRepaymentPlanAmount(planContext({ nextDueAmount: null }))).toBe(4000);
  });
});

describe("buildRepaymentPlanQuickAmounts", () => {
  it("offers catch up, monthly, full plan and everything owed", () => {
    const chips = buildRepaymentPlanQuickAmounts({
      monthlyAmount: 4000,
      catchUpAmount: 8000,
      remainingBalance: 12850,
      totalPending: 20000,
    });

    expect(chips.map((chip) => chip.key)).toEqual([
      "emiCatchUp",
      "emiMonthly",
      "emiFullPlan",
      "full",
      "clear",
    ]);
    expect(chips.find((chip) => chip.key === "emiCatchUp")?.amount).toBe(8000);
    expect(chips.find((chip) => chip.key === "emiFullPlan")?.amount).toBe(12850);
    expect(chips.find((chip) => chip.key === "full")?.amount).toBe(20000);
  });

  it("caps every plan chip at what is actually collectable", () => {
    const chips = buildRepaymentPlanQuickAmounts({
      monthlyAmount: 4000,
      catchUpAmount: 8000,
      remainingBalance: 12850,
      // The ledger says less is pending than the plan thinks — never ask for more.
      totalPending: 2000,
    });

    for (const key of ["emiCatchUp", "emiMonthly", "emiFullPlan"]) {
      expect(chips.find((chip) => chip.key === key)?.amount).toBeLessThanOrEqual(2000);
    }
  });

  it("disables catch up when nothing is overdue", () => {
    const chips = buildRepaymentPlanQuickAmounts({
      monthlyAmount: 4000,
      catchUpAmount: 0,
      remainingBalance: 12850,
      totalPending: 12850,
    });

    expect(chips.find((chip) => chip.key === "emiCatchUp")?.disabled).toBe(true);
    expect(chips.find((chip) => chip.key === "emiMonthly")?.disabled).toBe(false);
  });
});

describe("splitPaymentAcrossPlan", () => {
  it("sends everything to the plan while the plan can absorb it", () => {
    expect(splitPaymentAcrossPlan({ amount: 4000, planRemainingBalance: 12850 })).toEqual({
      toPlan: 4000,
      toOtherDues: 0,
    });
  });

  it("spills the excess into other dues once the plan is covered", () => {
    expect(splitPaymentAcrossPlan({ amount: 15000, planRemainingBalance: 12850 })).toEqual({
      toPlan: 12850,
      toOtherDues: 2150,
    });
  });

  it("treats a cleared plan as pure spillover", () => {
    expect(splitPaymentAcrossPlan({ amount: 500, planRemainingBalance: 0 })).toEqual({
      toPlan: 0,
      toOtherDues: 500,
    });
  });
});

describe("resolvePlanAwareOverdue", () => {
  const today = "2026-10-15";

  it("leaves a student with no plan exactly as they were", () => {
    expect(
      resolvePlanAwareOverdue({
        plan: null,
        excludedOverdueAmount: 5000,
        excludedNextDueDate: "2026-09-20",
        today,
      }),
    ).toEqual({
      overdueAmount: 5000,
      daysOverdue: 25,
      nextDueDate: "2026-09-20",
      planIsBehind: false,
    });
  });

  it("does not treat an on-track EMI family as overdue", () => {
    // The underlying installments are months past their original dates. That is
    // the whole point of the plan, and chasing them for it would be wrong.
    const result = resolvePlanAwareOverdue({
      plan: planSummary({ nextDueDate: "2026-10-31", catchUpAmount: 0 }),
      excludedOverdueAmount: 0,
      excludedNextDueDate: null,
      today,
    });

    expect(result.overdueAmount).toBe(0);
    expect(result.daysOverdue).toBe(0);
    expect(result.planIsBehind).toBe(false);
    expect(result.nextDueDate).toBe("2026-10-31");
  });

  it("scores a behind plan against the EMI calendar", () => {
    const result = resolvePlanAwareOverdue({
      plan: planSummary({
        nextDueDate: "2026-09-30",
        catchUpAmount: 8000,
        missedInstallmentCount: 2,
        paymentStatus: "behind",
      }),
      excludedOverdueAmount: 0,
      excludedNextDueDate: null,
      today,
    });

    expect(result.overdueAmount).toBe(8000);
    expect(result.daysOverdue).toBe(15);
    expect(result.planIsBehind).toBe(true);
  });

  it("adds excluded dues on top and takes the older of the two calendars", () => {
    const result = resolvePlanAwareOverdue({
      plan: planSummary({ nextDueDate: "2026-10-10", catchUpAmount: 4000 }),
      excludedOverdueAmount: 2500,
      excludedNextDueDate: "2026-07-20",
      today,
    });

    expect(result.overdueAmount).toBe(6500);
    // 2026-07-20 is older than the EMI date, so it drives days-overdue.
    expect(result.daysOverdue).toBe(87);
    expect(result.nextDueDate).toBe("2026-07-20");
  });
});
