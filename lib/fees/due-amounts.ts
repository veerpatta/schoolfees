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

/*
 * `calculateCandidateLateFees` / `calculateCandidateLateFeeAmount` used to live
 * here and have been REMOVED. Do not reintroduce them.
 *
 * They existed because the two late-fee engines disagreed:
 * v_workbook_installment_balances only materialized a late fee once a payment
 * landed after the due date, so a never-paid overdue installment read
 * `final_late_fee = 0` there while the Payment Desk showed Rs 1,000. This
 * "candidate" mirror papered over that gap in TypeScript.
 *
 * Since the rule was unified (migration 20260808140000) an overdue installment
 * always carries its flat late fee in BOTH engines, so `final_late_fee` off the
 * matview is the whole truth. Keeping the mirror would now actively double-count:
 * a grandfathered installment reads `final_late_fee = 0` because it is fully
 * WAIVED, while still being `balance_status = 'overdue'` — precisely the
 * condition the candidate check keyed on. It would invent a Rs 1,000 charge that
 * the ledger says is forgiven.
 *
 * Read `finalLateFee` directly.
 */

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
