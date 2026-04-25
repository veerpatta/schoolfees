export type StudentDeletePolicyInput = {
  installmentCount: number;
  receiptCount: number;
  paymentCount: number;
  adjustmentCount: number;
  refundRequestCount?: number;
  blockedInstallmentCount?: number;
  ledgerRegenerationRowCount?: number;
  sessionLabel: string;
  admissionNo: string;
  fullName: string;
};

export function getStudentDeletePolicy(input: StudentDeletePolicyInput) {
  const hasFinancialHistory =
    input.receiptCount > 0 ||
    input.paymentCount > 0 ||
    input.adjustmentCount > 0 ||
    (input.refundRequestCount ?? 0) > 0;
  const hardDeleteBlockers = [
    input.receiptCount > 0 ? `receipts (${input.receiptCount})` : null,
    input.paymentCount > 0 ? `payments (${input.paymentCount})` : null,
    input.adjustmentCount > 0 ? `payment adjustments (${input.adjustmentCount})` : null,
    (input.refundRequestCount ?? 0) > 0
      ? `refund requests (${input.refundRequestCount})`
      : null,
    (input.blockedInstallmentCount ?? 0) > 0
      ? `fee review rows (${input.blockedInstallmentCount})`
      : null,
    (input.ledgerRegenerationRowCount ?? 0) > 0
      ? `dues recalculation rows (${input.ledgerRegenerationRowCount})`
      : null,
  ].filter((item): item is string => Boolean(item));
  const isTestStudent =
    input.sessionLabel.toUpperCase().startsWith("TEST-") ||
    input.admissionNo.toUpperCase().startsWith("TEST-") ||
    input.fullName.toLowerCase().startsWith("test ");

  return {
    hasFinancialHistory,
    hardDeleteAllowed: hardDeleteBlockers.length === 0,
    generatedDuesDeleteAllowed: hardDeleteBlockers.length === 0 && input.installmentCount > 0,
    canForceDeleteTestRecord: isTestStudent && hardDeleteBlockers.length === 0,
    hardDeleteBlockers,
  };
}
