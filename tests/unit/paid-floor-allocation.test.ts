import { describe, expect, it } from "vitest";

import {
  allocateChargesRespectingPaidFloors,
  type PaidFloorRow,
} from "@/lib/fees/paid-floor-allocation";

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Four fresh installments, nothing paid — the "new student" shape. */
function emptyRows(count = 4): PaidFloorRow[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    existingAmountDue: 0,
    appliedAmount: 0,
  }));
}

describe("allocateChargesRespectingPaidFloors", () => {
  it("leaves a brand-new student's split untouched", () => {
    const plannedCharges = [8350, 7250, 7250, 7250];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: sum(plannedCharges),
      rows: emptyRows(),
    });

    expect(result.charges).toEqual(plannedCharges);
    expect(result.residualCreditAmount).toBe(0);
    expect(result.belowFloorIndexes).toEqual([]);
  });

  it("never changes the annual total, whatever the paid pattern", () => {
    const cases: Array<{ planned: number[]; rows: PaidFloorRow[] }> = [
      { planned: [5000, 5000, 5000, 5000], rows: emptyRows() },
      {
        planned: [4500, 4500, 4500, 4500],
        rows: [
          { index: 0, existingAmountDue: 5000, appliedAmount: 5000 },
          { index: 1, existingAmountDue: 5000, appliedAmount: 2500 },
          { index: 2, existingAmountDue: 5000, appliedAmount: 0 },
          { index: 3, existingAmountDue: 5000, appliedAmount: 0 },
        ],
      },
      {
        planned: [1000, 1000, 1000, 1000],
        rows: [
          { index: 0, existingAmountDue: 9000, appliedAmount: 9000 },
          { index: 1, existingAmountDue: 9000, appliedAmount: 9000 },
          { index: 2, existingAmountDue: 9000, appliedAmount: 9000 },
          { index: 3, existingAmountDue: 9000, appliedAmount: 9000 },
        ],
      },
    ];

    for (const testCase of cases) {
      const result = allocateChargesRespectingPaidFloors({
        plannedCharges: testCase.planned,
        plannedTotal: sum(testCase.planned),
        rows: testCase.rows,
      });

      expect(sum(result.charges)).toBe(sum(testCase.planned));
    }
  });

  it("absorbs a discount into the unpaid tail and protects the paid rows", () => {
    // The SR 2261 EKTA PALIWAL shape: most of the year paid, a Rs 2,000
    // discount arrives afterwards. It must come off the still-open installment,
    // not off a row a receipt has already reported.
    const plannedCharges = [7275, 7275, 7275, 7275]; // 29,100 after the discount
    const rows: PaidFloorRow[] = [
      { index: 0, existingAmountDue: 8000, appliedAmount: 8000 },
      { index: 1, existingAmountDue: 7700, appliedAmount: 7700 },
      { index: 2, existingAmountDue: 7700, appliedAmount: 7700 },
      { index: 3, existingAmountDue: 7700, appliedAmount: 3600 },
    ];

    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: sum(plannedCharges),
      rows,
    });

    expect(sum(result.charges)).toBe(29100);
    // No row dropped below what was applied to it.
    for (const row of rows) {
      expect(result.charges[row.index]!).toBeGreaterThanOrEqual(
        Math.min(row.existingAmountDue, row.appliedAmount),
      );
    }
    expect(result.residualCreditAmount).toBe(0);
    expect(result.belowFloorIndexes).toEqual([]);
  });

  it("reduces a partly-paid row down to what was paid, but no further", () => {
    // The worked example: a row charging 8,000 with 5,000 paid may fall to
    // 5,000. That is the whole point — the row stops asking for money the
    // school has decided to forgo, and the receipt is untouched.
    const plannedCharges = [5000, 0, 0, 0];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: 5000,
      rows: [
        { index: 0, existingAmountDue: 8000, appliedAmount: 5000 },
        { index: 1, existingAmountDue: 0, appliedAmount: 0 },
        { index: 2, existingAmountDue: 0, appliedAmount: 0 },
        { index: 3, existingAmountDue: 0, appliedAmount: 0 },
      ],
    });

    expect(result.charges[0]).toBe(5000);
    expect(result.residualCreditAmount).toBe(0);
  });

  it("reports a residual credit when the discount exceeds everything still owed", () => {
    // Fully paid year, then a Rs 4,000 discount. Nothing can absorb it, so the
    // student is genuinely overpaid and the amount must be surfaced rather than
    // silently dropped.
    const plannedCharges = [4000, 4000, 4000, 4000]; // 16,000, was 20,000
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: sum(plannedCharges),
      rows: [
        { index: 0, existingAmountDue: 5000, appliedAmount: 5000 },
        { index: 1, existingAmountDue: 5000, appliedAmount: 5000 },
        { index: 2, existingAmountDue: 5000, appliedAmount: 5000 },
        { index: 3, existingAmountDue: 5000, appliedAmount: 5000 },
      ],
    });

    expect(sum(result.charges)).toBe(16000);
    expect(result.residualCreditAmount).toBe(4000);
    expect(result.belowFloorIndexes.length).toBeGreaterThan(0);
  });

  it("never RAISES an over-applied row", () => {
    // A row charging 3,000 that carries 5,000 must not be lifted to 5,000 —
    // that would re-bill a parent who is already in credit. The floor is
    // min(existingAmountDue, appliedAmount), which is why.
    const plannedCharges = [3000, 3000];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: 6000,
      rows: [
        { index: 0, existingAmountDue: 3000, appliedAmount: 5000 },
        { index: 1, existingAmountDue: 3000, appliedAmount: 0 },
      ],
    });

    expect(result.charges).toEqual([3000, 3000]);
    expect(result.residualCreditAmount).toBe(0);
  });

  it("handles an increase without inventing headroom", () => {
    // A fee rise, not a discount. Nothing is below a floor, so the plan passes
    // through unchanged and the lock check upstream decides what may be written.
    const plannedCharges = [9000, 9000, 9000, 9000];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: sum(plannedCharges),
      rows: [
        { index: 0, existingAmountDue: 5000, appliedAmount: 5000 },
        { index: 1, existingAmountDue: 5000, appliedAmount: 0 },
        { index: 2, existingAmountDue: 5000, appliedAmount: 0 },
        { index: 3, existingAmountDue: 5000, appliedAmount: 0 },
      ],
    });

    expect(result.charges).toEqual(plannedCharges);
    expect(result.residualCreditAmount).toBe(0);
  });

  it("keeps the rupee remainder where the planned split put it", () => {
    // buildWorkbookInstallmentCharges front-loads the remainder onto
    // installment 1. With no floors in play that must survive verbatim.
    const plannedCharges = [8625, 8125, 8125, 8125];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: sum(plannedCharges),
      rows: emptyRows(),
    });

    expect(result.charges[0]).toBe(8625);
    expect(result.charges.slice(1)).toEqual([8125, 8125, 8125]);
  });
});
