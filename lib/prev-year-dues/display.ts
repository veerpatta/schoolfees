import { CARRY_FORWARD_LABEL } from "@/lib/prev-year-dues/constants";

export type CarryForwardInstallmentLike = {
  installmentNo?: number | null;
  installmentLabel?: string | null;
  amountDue?: number | null;
  baseCharge?: number | null;
  paymentsTotal?: number | null;
  paidAmount?: number | null;
  adjustmentsTotal?: number | null;
  adjustmentAmount?: number | null;
  outstandingAmount?: number | null;
  pendingAmount?: number | null;
  finalLateFee?: number | null;
  isCarryForward?: boolean | null;
  is_carry_forward?: boolean | null;
  feeBucket?: string | null;
  fee_bucket?: string | null;
  sourceSessionLabel?: string | null;
  source_session_label?: string | null;
  carryForwardSourceSessionLabel?: string | null;
};

function toAmount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

export function isCarryForwardInstallment(row: CarryForwardInstallmentLike) {
  if (row.isCarryForward === true || row.is_carry_forward === true) return true;
  if (row.feeBucket === "previous_year_tuition" || row.fee_bucket === "previous_year_tuition") return true;
  return row.installmentLabel === CARRY_FORWARD_LABEL;
}

export function buildCarryForwardLabel(input: {
  sourceSessionLabel?: string | null;
  feeHead?: "tuition" | string | null;
}) {
  const headLabel = input.feeHead === "tuition" || !input.feeHead ? "tuition" : input.feeHead;
  const source = input.sourceSessionLabel?.trim();
  return source
    ? `Previous year ${headLabel} balance from ${source}`
    : `Previous year ${headLabel} balance`;
}

export function getCarryForwardSourceSession(row: CarryForwardInstallmentLike) {
  const explicit =
    row.sourceSessionLabel ??
    row.source_session_label ??
    row.carryForwardSourceSessionLabel ??
    null;
  if (explicit) return explicit;

  const match = row.installmentLabel?.match(/\(([^)]+)\)/);
  return match?.[1] ?? null;
}

export function getDisplayInstallmentLabel(row: CarryForwardInstallmentLike) {
  if (!isCarryForwardInstallment(row)) {
    return row.installmentLabel ?? `Installment ${row.installmentNo ?? ""}`.trim();
  }

  return buildCarryForwardLabel({
    sourceSessionLabel: getCarryForwardSourceSession(row),
    feeHead: "tuition",
  });
}

export function calculateRowPending(row: CarryForwardInstallmentLike) {
  return toAmount(row.outstandingAmount ?? row.pendingAmount);
}

export function calculateRowApplied(row: CarryForwardInstallmentLike) {
  return toAmount(row.paymentsTotal ?? row.paidAmount) + toAmount(row.adjustmentsTotal ?? row.adjustmentAmount);
}

export function calculateRowBaseDue(row: CarryForwardInstallmentLike) {
  if (row.baseCharge !== undefined && row.baseCharge !== null) {
    return toAmount(row.baseCharge);
  }

  return Math.max(toAmount(row.amountDue) - toAmount(row.finalLateFee), 0);
}

export function buildCarryForwardSummary(rows: readonly CarryForwardInstallmentLike[]) {
  let previousYearOriginal = 0;
  let previousYearCollected = 0;
  let previousYearPending = 0;
  let currentYearPending = 0;
  let lateFeePending = 0;

  for (const row of rows) {
    const pending = calculateRowPending(row);
    const applied = calculateRowApplied(row);
    if (isCarryForwardInstallment(row)) {
      const original = calculateRowBaseDue(row);
      previousYearOriginal += original;
      previousYearCollected += Math.min(applied, original);
      previousYearPending += pending;
      continue;
    }

    const rowLatePending = Math.min(toAmount(row.finalLateFee), pending);
    lateFeePending += rowLatePending;
    currentYearPending += Math.max(pending - rowLatePending, 0);
  }

  return {
    currentYearPending,
    previousYearOriginal,
    previousYearCollected,
    previousYearPending,
    lateFeePending,
    totalPending: currentYearPending + previousYearPending + lateFeePending,
    hasCarryForward: previousYearOriginal > 0 || previousYearPending > 0 || previousYearCollected > 0,
  };
}
