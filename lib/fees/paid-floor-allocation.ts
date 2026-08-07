/**
 * Re-split a student's planned annual charge so a REDUCTION is absorbed by
 * unpaid headroom before it touches a row that already carries money.
 *
 * Why this exists: applying a discount to a student who had already paid
 * something used to do nothing at all. Every installment carrying a payment was
 * frozen by `classifyInstallmentLock`, the whole plan was discarded, and the
 * office got a green "Student updated and fee records updated." Observed live:
 * SR 2261 had a Rs 2,000 discount recorded on 2026-08-07 against installments
 * last touched on 2026-05-24, and the outstanding never moved.
 *
 * Freezing paid rows is right — a receipt must never be rewritten under a
 * parent. But the safe move was never "freeze the student"; it is "put the
 * reduction where there is still headroom". That is an allocation problem, so
 * it lives here as a pure function shared by the generator and the Fee Setup
 * regeneration preview rather than being solved twice.
 */

export type PaidFloorRow = {
  /** Position in the plan — installment_no minus one. */
  index: number;
  /** amount_due as the row stands today. Zero for a row being inserted. */
  existingAmountDue: number;
  /** Payments + adjustments applied to the row. Zero for a new row. */
  appliedAmount: number;
};

export type PaidFloorAllocation = {
  /** Final amount_due per installment. Always sums to plannedTotal. */
  charges: number[];
  /**
   * The part of the reduction that could not be absorbed. Non-zero only when
   * the discount exceeds the student's entire unpaid balance, which means they
   * are genuinely overpaid — it surfaces as
   * `v_student_financial_state.credit_balance` / `refundable_amount` and flows
   * into the existing Finance Controls refund screen.
   */
  residualCreditAmount: number;
  /** Rows whose final charge sits below what has been applied to them. */
  belowFloorIndexes: number[];
};

/**
 * A row's floor is `min(existingAmountDue, appliedAmount)`.
 *
 * Using `appliedAmount` alone would be wrong in the over-applied case: a row
 * charging Rs 3,000 that somehow carries Rs 5,000 would be *raised* to
 * Rs 5,000, silently re-billing a parent who is already in credit. Taking the
 * lower of the two means the floor can only ever hold a row where it is.
 */
function floorFor(row: PaidFloorRow | undefined): number {
  if (!row) {
    return 0;
  }

  return Math.max(0, Math.min(row.existingAmountDue, row.appliedAmount));
}

export function allocateChargesRespectingPaidFloors(payload: {
  /** Naive even split from `buildWorkbookInstallmentCharges`. */
  plannedCharges: readonly number[];
  /** Must equal the sum of `plannedCharges`. */
  plannedTotal: number;
  rows: readonly PaidFloorRow[];
}): PaidFloorAllocation {
  const rowByIndex = new Map(payload.rows.map((row) => [row.index, row]));
  const floors = payload.plannedCharges.map((_, index) => floorFor(rowByIndex.get(index)));
  const charges = payload.plannedCharges.map((amount, index) => Math.max(amount, floors[index] ?? 0));

  let excess = charges.reduce((sum, amount) => sum + amount, 0) - payload.plannedTotal;

  // Pass 1 — reclaim from unpaid headroom, LATEST installment first. Parents
  // pay the early installments, so the last row is normally the one still open;
  // taking from the end also keeps the reduction away from rows a receipt has
  // already reported on.
  for (let index = charges.length - 1; index >= 0 && excess > 0; index -= 1) {
    const headroom = (charges[index] ?? 0) - (floors[index] ?? 0);
    const take = Math.min(excess, Math.max(headroom, 0));
    charges[index] = (charges[index] ?? 0) - take;
    excess -= take;
  }

  // Pass 2 — no headroom anywhere. The discount is larger than everything still
  // owed, so the student really is overpaid. Break the floor and report the
  // amount: manufacturing a payment_adjustments row to keep the arithmetic
  // tidy would inflate total_paid (reporting cash the school never received)
  // and defeat the cumulative over-refund guard in
  // process_refund_with_adjustment, which reads p.amount + sum(amount_delta).
  const residualCreditAmount = Math.max(excess, 0);
  const belowFloorIndexes: number[] = [];

  for (let index = charges.length - 1; index >= 0 && excess > 0; index -= 1) {
    const take = Math.min(excess, charges[index] ?? 0);

    if (take > 0) {
      charges[index] = (charges[index] ?? 0) - take;
      excess -= take;
      belowFloorIndexes.push(index);
    }
  }

  return { charges, residualCreditAmount, belowFloorIndexes };
}
