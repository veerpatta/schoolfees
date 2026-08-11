export type PaymentDeskSuccessAction = {
  label: string;
  href: string;
};

export function buildPaymentDeskSuccessActions(payload: {
  receiptId: string;
  studentId: string;
  nextPaymentHref: string;
  transactionsHref?: string;
}) {
  return [
    {
      label: "Print receipt",
      href: `/protected/receipts/${payload.receiptId}`,
    },
    {
      label: "Open student",
      href: `/protected/students/${payload.studentId}`,
    },
    {
      label: "Next payment",
      href: payload.nextPaymentHref,
    },
    {
      label: "Open Transactions",
      href: payload.transactionsHref ?? "/protected/transactions",
    },
  ] satisfies PaymentDeskSuccessAction[];
}

export type PaymentQuickAmount = {
  key:
    | "full"
    | "next"
    | "overdue"
    | "lateFee"
    | "lastAmount"
    | "clear"
    // EMI plan shortcuts. They replace the ordinary set outright rather than
    // sitting alongside it: on a plan, "Overdue" and "Late Fee" are the wrong
    // question — the family owes a monthly amount against an agreed calendar.
    | "emiMonthly"
    | "emiCatchUp"
    | "emiFullPlan";
  label: string;
  amount: number | null;
  disabled: boolean;
};

/**
 * Quick amounts for a student on an active EMI plan.
 *
 * "Catch up" leads when they are behind, because that is the number that puts
 * them back on the calendar. Everything is capped at the plan balance so the
 * desk never proposes more than the plan is worth — spillover into other dues
 * stays a deliberate act, not an accident of tapping a chip.
 */
export function buildRepaymentPlanQuickAmounts(payload: {
  monthlyAmount: number;
  catchUpAmount: number;
  remainingBalance: number;
  totalPending: number;
}) {
  const planCap = Math.max(Math.min(payload.remainingBalance, payload.totalPending), 0);
  const monthly = Math.min(Math.max(payload.monthlyAmount, 0), planCap);
  const catchUp = Math.min(Math.max(payload.catchUpAmount, 0), planCap);

  return [
    {
      key: "emiCatchUp",
      label: "Catch up",
      amount: catchUp,
      disabled: catchUp <= 0,
    },
    {
      key: "emiMonthly",
      label: "Monthly EMI",
      amount: monthly,
      disabled: monthly <= 0,
    },
    {
      key: "emiFullPlan",
      label: "Full plan balance",
      amount: planCap,
      disabled: planCap <= 0,
    },
    {
      key: "full",
      label: "Everything owed",
      amount: payload.totalPending,
      disabled: payload.totalPending <= 0,
    },
    {
      key: "clear",
      label: "Clear",
      amount: null,
      disabled: false,
    },
  ] satisfies PaymentQuickAmount[];
}

export function buildPaymentQuickAmounts(payload: {
  totalPending: number;
  nextDueAmount: number | null;
  overdueAmount: number;
  lateFeeAmount?: number;
  lastPaidAmount?: number | null;
  /**
   * When the student is on an active EMI plan the ordinary chips are the wrong
   * question — "Overdue" and "Late Fee" describe a calendar the plan replaced.
   * The plan set takes over entirely.
   */
  plan?: { monthlyAmount: number; catchUpAmount: number; remainingBalance: number } | null;
}) {
  if (payload.plan) {
    return buildRepaymentPlanQuickAmounts({
      monthlyAmount: payload.plan.monthlyAmount,
      catchUpAmount: payload.plan.catchUpAmount,
      remainingBalance: payload.plan.remainingBalance,
      totalPending: payload.totalPending,
    });
  }

  return [
    {
      key: "full",
      label: "Full Due",
      amount: payload.totalPending,
      disabled: payload.totalPending <= 0,
    },
    {
      key: "next",
      label: "Next Installment",
      amount: payload.nextDueAmount ?? null,
      disabled: !payload.nextDueAmount || payload.nextDueAmount <= 0,
    },
    {
      key: "overdue",
      label: "Overdue",
      amount: payload.overdueAmount,
      disabled: payload.overdueAmount <= 0,
    },
    {
      key: "lateFee",
      label: "Late Fee",
      amount: payload.lateFeeAmount ?? 0,
      disabled: !payload.lateFeeAmount || payload.lateFeeAmount <= 0,
    },
    {
      key: "lastAmount",
      label: "Last Amount",
      amount: payload.lastPaidAmount ?? null,
      disabled:
        !payload.lastPaidAmount ||
        payload.lastPaidAmount <= 0 ||
        payload.lastPaidAmount > payload.totalPending,
    },
    {
      key: "clear",
      label: "Clear",
      amount: null,
      disabled: false,
    },
  ] satisfies PaymentQuickAmount[];
}
