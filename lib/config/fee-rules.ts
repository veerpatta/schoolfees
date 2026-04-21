export const activeFeeRules = {
  lateFeeFlatRupees: 1000,
  installmentDueDates: ["20 April", "20 July", "20 October", "20 January"],
  class12ScienceAnnualFeeRupees: 38000,
  defaultInstallmentCount: 4,
  schoolDefaultFeeHeadsRupees: {
    tuitionFee: 0,
    transportFee: 0,
    booksFee: 0,
    admissionActivityMiscFee: 0,
  },
  acceptedPaymentModes: ["Cash", "UPI", "Bank transfer", "Cheque"],
} as const;

export const feePolicyNotes = [
  "Late fee remains a flat Rs 1000 across the app unless management approves a rule change.",
  "Use the four fixed installment due dates when generating annual ledgers.",
  "Fee setup supports school defaults, class defaults, and student-level overrides.",
  "Class 12 Science should preload at Rs 38000 when fee settings are initialized.",
] as const;
