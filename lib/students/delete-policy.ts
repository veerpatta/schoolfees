export type StudentDeletePolicyInput = {
  installmentCount: number;
  receiptCount: number;
  paymentCount: number;
  adjustmentCount: number;
  sessionLabel: string;
  admissionNo: string;
  fullName: string;
};

export function getStudentDeletePolicy(input: StudentDeletePolicyInput) {
  const hasFinancialHistory =
    input.receiptCount > 0 || input.paymentCount > 0 || input.adjustmentCount > 0;
  const isTestStudent =
    input.sessionLabel.toUpperCase().startsWith("TEST-") ||
    input.admissionNo.toUpperCase().startsWith("TEST-") ||
    input.fullName.toLowerCase().startsWith("test ");

  return {
    hasFinancialHistory,
    hardDeleteAllowed: !hasFinancialHistory,
    generatedDuesDeleteAllowed: !hasFinancialHistory && input.installmentCount > 0,
    canForceDeleteTestRecord: isTestStudent && !hasFinancialHistory,
  };
}
