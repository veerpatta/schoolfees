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
  key: "full" | "next" | "overdue" | "custom";
  label: string;
  amount: number | null;
  disabled: boolean;
};

export function buildPaymentQuickAmounts(payload: {
  totalPending: number;
  nextDueAmount: number | null;
  overdueAmount: number;
}) {
  return [
    {
      key: "full",
      label: "Pay full pending",
      amount: payload.totalPending,
      disabled: payload.totalPending <= 0,
    },
    {
      key: "next",
      label: "Pay current / next due installment",
      amount: payload.nextDueAmount ?? null,
      disabled: !payload.nextDueAmount || payload.nextDueAmount <= 0,
    },
    {
      key: "overdue",
      label: "Pay overdue amount",
      amount: payload.overdueAmount,
      disabled: payload.overdueAmount <= 0,
    },
    {
      key: "custom",
      label: "Custom amount",
      amount: null,
      disabled: false,
    },
  ] satisfies PaymentQuickAmount[];
}
