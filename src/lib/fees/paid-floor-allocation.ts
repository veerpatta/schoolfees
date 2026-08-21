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
 *
 * The same argument runs the other way, and for a long time only half of it
 * was implemented. A policy change that RAISES what a student owes — a bus
 * route added mid-year, a discount withdrawn — could only land on installments
 * carrying no money at all. When there were none, the rise silently evaporated:
 * total below policy, nothing written, nothing reported. So an increase now
 * also uses rows that carry money but are not yet settled, and anything that
 * still cannot be placed comes back as `unbilledIncreaseAmount` instead of
 * disappearing.
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
  /**
   * The part of an INCREASE that could not be placed — the mirror of
   * `residualCreditAmount`, and the reason this field exists.
   *
   * A rise has to land on a row that is not already settled. When every
   * installment is settled there is nowhere legitimate to put it, and the
   * allocator returns the annual total BELOW `plannedTotal`. That used to
   * happen silently: the generator saw no difference, wrote nothing, blocked
   * nothing, and the school was left under-billing a family with no record of
   * it. Live 2026-27 carried Rs 13,600 (SR 2608) and Rs 10,000 (SR 2511) of
   * unbilled transport this way for months.
   *
   * Non-zero means a human has to decide: raise a settled installment
   * deliberately, or accept the ledger and record a matching override.
   */
  unbilledIncreaseAmount: number;
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

  // A row "carries money" if a payment or an adjustment has landed on it. Those
  // are the rows a receipt has already reported, so they are seeded at their
  // CURRENT charge rather than at the naive even split.
  //
  // Seeding them at the split was subtly wrong and left three students
  // unrepairable: re-splitting a reduction evenly wants to RAISE some paid rows
  // (to the new average) while lowering others, and a raise on a paid row is
  // correctly refused upstream — so the reduction had nowhere to land and the
  // student stayed drifted. Starting from what each paid row already charges
  // means a reduction only ever moves in one direction.
  const carriesMoney = payload.plannedCharges.map((_, index) => {
    const row = rowByIndex.get(index);
    return Boolean(row && row.appliedAmount > 0);
  });
  const charges = payload.plannedCharges.map((planned, index) => {
    const row = rowByIndex.get(index);
    return carriesMoney[index] ? (row?.existingAmountDue ?? 0) : Math.max(planned, floors[index] ?? 0);
  });

  let excess = charges.reduce((sum, amount) => sum + amount, 0) - payload.plannedTotal;

  // Under-target: the annual total went UP and the rise has to go somewhere.
  //
  // Two stages, in this order, because they are not equally safe:
  //
  //   1. Rows carrying nothing. Always fine.
  //   2. Rows that carry money but are NOT settled — `appliedAmount` is short
  //      of what the row charges. Raising one of these contradicts no receipt:
  //      a receipt for Rs 3,100 stays true when the installment it paid
  //      against goes on to ask for more. Only reached when stage 1 has run
  //      out of rows, so ordinary students never notice the difference.
  //
  // A SETTLED row is never grown by either stage. That is the re-bill this
  // function still refuses to propose, and `unbilledIncreaseAmount` is how the
  // refusal gets reported instead of swallowed.
  if (excess < 0) {
    const growable = (indexes: number[]) => {
      for (let position = indexes.length - 1; position >= 0 && excess < 0; position -= 1) {
        const index = indexes[position]!;
        const isFirst = position === 0;
        const share = isFirst ? -excess : Math.min(-excess, Math.ceil(-excess / (position + 1)));
        charges[index] = (charges[index] ?? 0) + share;
        excess += share;
      }
    };

    const allIndexes = charges.map((_, index) => index);

    growable(allIndexes.filter((index) => !carriesMoney[index]));
    growable(
      allIndexes.filter((index) => {
        const row = rowByIndex.get(index);
        return Boolean(row) && carriesMoney[index] && row!.appliedAmount < row!.existingAmountDue;
      }),
    );
  }

  // Whatever is still unplaced is a rise with no room left anywhere.
  const unbilledIncreaseAmount = Math.max(-excess, 0);

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

  return { charges, residualCreditAmount, unbilledIncreaseAmount, belowFloorIndexes };
}
