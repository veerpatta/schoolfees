export type StudentFeeUpiPaymentInput = {
  admissionNo: string;
  amount: number;
};

export type StudentFeeUpiPayment = {
  uri: string;
  displayReference: string;
  payeeName: string;
  vpa: string;
  amount: number;
};

export const SCHOOL_UPI_PAYMENT_CONFIG = {
  vpa: "shriveerpattassecsch.68347408@hdfcbank",
  payeeName: "SHRI VEER PATTA S SEC SCH",
  currency: "INR",
} as const;

function wholeRupees(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function paymentReference(admissionNo: string) {
  const normalized = admissionNo.replace(/\s+/g, " ").trim() || "STUDENT";
  return `Fee ${normalized}`.slice(0, 35);
}

export function buildStudentFeeUpiPayment(
  input: StudentFeeUpiPaymentInput,
): StudentFeeUpiPayment {
  const amount = wholeRupees(input.amount);
  const displayReference = paymentReference(input.admissionNo);
  const params = new URLSearchParams({
    pa: SCHOOL_UPI_PAYMENT_CONFIG.vpa,
    pn: SCHOOL_UPI_PAYMENT_CONFIG.payeeName,
    am: String(amount),
    cu: SCHOOL_UPI_PAYMENT_CONFIG.currency,
    tn: displayReference,
  });

  return {
    uri: `upi://pay?${params.toString().replaceAll("+", "%20")}`,
    displayReference,
    payeeName: SCHOOL_UPI_PAYMENT_CONFIG.payeeName,
    vpa: SCHOOL_UPI_PAYMENT_CONFIG.vpa,
    amount,
  };
}
