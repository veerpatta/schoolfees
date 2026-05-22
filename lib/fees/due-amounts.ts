type InstallmentLike = {
  amountDue?: number | null;
  baseCharge?: number | null;
  paymentsTotal?: number | null;
  paidAmount?: number | null;
  adjustmentsTotal?: number | null;
  adjustmentAmount?: number | null;
  outstandingAmount?: number | null;
  pendingAmount?: number | null;
  finalLateFee?: number | null;
  balanceStatus?: string | null;
};

function toAmount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

export function calculateInstallmentBaseDue(row: InstallmentLike) {
  if (row.baseCharge !== undefined && row.baseCharge !== null) {
    return toAmount(row.baseCharge);
  }

  return Math.max(toAmount(row.amountDue) - toAmount(row.finalLateFee), 0);
}

export function calculateInstallmentAppliedAmount(row: InstallmentLike) {
  return toAmount(row.paymentsTotal ?? row.paidAmount) + toAmount(row.adjustmentsTotal ?? row.adjustmentAmount);
}

export function calculateInstallmentBasePending(row: InstallmentLike) {
  return Math.max(calculateInstallmentBaseDue(row) - calculateInstallmentAppliedAmount(row), 0);
}

export function calculatePendingLateFeeAmount(rows: readonly InstallmentLike[]) {
  return rows.reduce(
    (sum, row) => sum + Math.min(toAmount(row.finalLateFee), toAmount(row.outstandingAmount ?? row.pendingAmount)),
    0,
  );
}

export function calculateOverdueBaseAmount(rows: readonly InstallmentLike[]) {
  return rows
    .filter((row) => row.balanceStatus === "overdue")
    .reduce((sum, row) => sum + calculateInstallmentBasePending(row), 0);
}
