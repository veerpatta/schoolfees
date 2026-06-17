import { formatIsoDateIst } from "@/lib/helpers/date";

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
  // Carry-forward (previous-year) installments never accrue a late fee — their
  // stored `late_fee_flat_amount` is 0 (see CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT).
  // The caller flags them so the candidate late-fee calc skips them.
  isCarryForward?: boolean | null;
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

/**
 * Per-installment candidate ("accruing") late fee for overdue installments
 * whose late fee has NOT yet materialized in the workbook view — the view only
 * materializes a late fee once a payment posts after the due date, so a
 * never-paid overdue installment reads `finalLateFee = 0` there.
 *
 * This mirrors `private.workbook_installment_snapshot(..., include_candidate :=
 * true)`: the student's `late_fee_waiver_amount` is a single waiver POOL that the
 * DB consumes across installments in order (`least(raw_late_fee, remaining_pool)`),
 * NOT a per-installment deduction. Consuming it the same way here keeps the
 * displayed figure equal to what `waive_late_fee` will accept.
 *
 * Carry-forward (previous-year) installments are excluded — they never accrue a
 * late fee in the DB, so counting them would over-state the pending late fee.
 *
 * `rows` must be supplied in installment order. Returns an array aligned to
 * `rows` (0 for non-candidate installments).
 */
export function calculateCandidateLateFees(
  rows: readonly InstallmentLike[],
  lateFeeFlatAmount: number,
  studentLateFeeWaiver: number,
): number[] {
  const flat = toAmount(lateFeeFlatAmount);
  let remainingWaiver = toAmount(studentLateFeeWaiver);
  return rows.map((row) => {
    const isCandidate =
      row.balanceStatus === "overdue" && toAmount(row.finalLateFee) === 0 && !row.isCarryForward;
    if (!isCandidate || flat <= 0) {
      return 0;
    }
    const applied = Math.min(flat, remainingWaiver);
    remainingWaiver -= applied;
    return flat - applied;
  });
}

/**
 * Total candidate late fee across all installments — the sum of
 * {@link calculateCandidateLateFees}.
 */
export function calculateCandidateLateFeeAmount(
  rows: readonly InstallmentLike[],
  lateFeeFlatAmount: number,
  studentLateFeeWaiver: number,
): number {
  return calculateCandidateLateFees(rows, lateFeeFlatAmount, studentLateFeeWaiver).reduce(
    (sum, value) => sum + value,
    0,
  );
}

export function calculateOverdueBaseAmount(rows: readonly InstallmentLike[]) {
  return rows
    .filter((row) => row.balanceStatus === "overdue")
    .reduce((sum, row) => sum + calculateInstallmentBasePending(row), 0);
}

/**
 * Days past the oldest unpaid (base) installment's due date — the single shared
 * definition used on the Payment Desk, the student profile, and Defaulters so the
 * number reads identically everywhere.
 *
 * `dueDate` is the oldest unpaid installment's due date (in the canonical projection
 * this is `v_workbook_student_financials.next_due_date`, which is already the OLDEST
 * installment with base pending > 0). Both dates are `YYYY-MM-DD` in IST.
 *
 * @param today defaults to the current date in Asia/Kolkata.
 */
export function calculateDaysOverdue(
  dueDate: string | null | undefined,
  today: string = formatIsoDateIst(new Date()) ?? "",
) {
  if (!dueDate || !today || dueDate >= today) {
    return 0;
  }

  const due = new Date(`${dueDate}T00:00:00+05:30`).getTime();
  const now = new Date(`${today}T00:00:00+05:30`).getTime();
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}
