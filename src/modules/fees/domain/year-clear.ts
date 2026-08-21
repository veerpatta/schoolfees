/**
 * "Year Clear" — the student owes nothing more for this academic session.
 *
 * One definition, because there were two. The student list said
 * `outstandingAmount <= 0` on its own, which also stamps a student whose dues
 * were never prepared: no installments means no outstanding, and the list would
 * cheerfully report a brand-new student as fully settled. The profile's Fee
 * snapshot additionally required that something had actually been settled.
 * The stricter rule is the correct one, so it is the only one now.
 *
 * A discount close-out counts as settlement. It is not cash — it is deliberately
 * excluded from collection figures — but a balance cleared by an administrative
 * write-off is still cleared, and the parent should see that on their receipt.
 */
export type YearClearInput = {
  /** Pending amount for the session, late fees included. */
  outstandingAmount: number;
  /** Cash receipts plus adjustments. Excludes discount close-outs. */
  totalPaid: number;
  /** Balance cleared by a `payment_mode = 'discount'` write-off. */
  discountClosedAmount?: number;
  /**
   * Whether this student has a fee ledger at all. Pass `false` (or leave the
   * settled amount at zero) for a student whose dues have not been prepared —
   * they are not "clear", they are "not started".
   */
  hasPreparedDues?: boolean;
};

export function isYearCleared(input: YearClearInput): boolean {
  if (input.hasPreparedDues === false) {
    return false;
  }

  const settled = input.totalPaid + (input.discountClosedAmount ?? 0);

  return input.outstandingAmount <= 0 && settled > 0;
}
