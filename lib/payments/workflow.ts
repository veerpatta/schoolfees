export type PaymentDeskSuccessAction = {
  label: string;
  href: string;
};

export function buildPaymentDeskSuccessActions(payload: {
  receiptId: string;
  studentId: string;
  nextPaymentHref: string;
}) {
  return [
    {
      label: "Print receipt",
      href: `/protected/receipts/${payload.receiptId}`,
    },
    {
      label: "Open receipt",
      href: `/protected/receipts/${payload.receiptId}`,
    },
    {
      label: "Back to student",
      href: `/protected/students/${payload.studentId}`,
    },
    {
      label: "Post next payment",
      href: payload.nextPaymentHref,
    },
  ] satisfies PaymentDeskSuccessAction[];
}

