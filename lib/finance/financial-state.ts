export type StudentFinancialStateInput = {
  revisedTotalDue: number;
  totalPaid: number;
  rowsKeptForReview?: number;
};

export type StudentFinancialState = {
  totalDue: number;
  totalPaid: number;
  pendingAmount: number;
  creditBalance: number;
  overpaidAmount: number;
  refundableAmount: number;
  rowsKeptForReview: number;
};

function normalizeAmount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.trunc(value), 0);
}

export function calculateStudentFinancialState(
  input: StudentFinancialStateInput,
): StudentFinancialState {
  const totalDue = normalizeAmount(input.revisedTotalDue);
  const totalPaid = normalizeAmount(input.totalPaid);
  const creditBalance = Math.max(totalPaid - totalDue, 0);

  return {
    totalDue,
    totalPaid,
    pendingAmount: Math.max(totalDue - totalPaid, 0),
    creditBalance,
    overpaidAmount: creditBalance,
    refundableAmount: creditBalance,
    rowsKeptForReview: normalizeAmount(input.rowsKeptForReview ?? 0),
  };
}
