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
  key: "full" | "next" | "overdue" | "lateFee" | "lastAmount" | "clear";
  label: string;
  amount: number | null;
  disabled: boolean;
};

export function buildPaymentQuickAmounts(payload: {
  totalPending: number;
  nextDueAmount: number | null;
  overdueAmount: number;
  lateFeeAmount?: number;
  lastPaidAmount?: number | null;
}) {
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
