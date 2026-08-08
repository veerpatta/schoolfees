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

  it("puts a fee rise on the unpaid rows and keeps the annual total intact", () => {
    // A fee rise, not a discount, on a student who has paid installment 1.
    //
    // The naive even split would have proposed 9,000 for the paid row too. That
    // gets refused upstream (correctly — it is a re-bill), and the refusal used
    // to be the end of it: rows 2-4 went to 9,000, row 1 stayed at 5,000, and
    // the year quietly totalled 32,000 instead of 36,000. The school lost
    // Rs 4,000 and nothing said so.
    //
    // The increase now lands on the rows carrying no money, so the annual total
    // is right AND no receipt is contradicted.
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

    expect(sum(result.charges)).toBe(36000);
    expect(result.charges[0]).toBe(5000);
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

describe("a reduction never has to raise a paid row to land", () => {
  it("absorbs a discount when every installment is already paid", () => {
    // The three students that survived the first repair run: paid across all
    // four installments, and a discount that had to come off somewhere.
    // Seeding paid rows at the naive even split wanted to RAISE the later ones
    // to the new average, that raise was correctly refused, and the reduction
    // had nowhere to go — so they stayed drifted. Paid rows now start at their
    // current charge, so the discount only ever moves downward.
    const plannedCharges = [6750, 6750, 6750, 6750]; // 27,000 after a 2,000 discount
    const rows: PaidFloorRow[] = [
      { index: 0, existingAmountDue: 8000, appliedAmount: 8000 },
      { index: 1, existingAmountDue: 7000, appliedAmount: 7000 },
      { index: 2, existingAmountDue: 7000, appliedAmount: 7000 },
      { index: 3, existingAmountDue: 7000, appliedAmount: 5000 },
    ];

    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: 27000,
      rows,
    });

    expect(sum(result.charges)).toBe(27000);
    // Nothing went up, so nothing gets refused upstream.
    for (const row of rows) {
      expect(result.charges[row.index]!).toBeLessThanOrEqual(row.existingAmountDue);
      expect(result.charges[row.index]!).toBeGreaterThanOrEqual(
        Math.min(row.existingAmountDue, row.appliedAmount),
      );
    }
    expect(result.residualCreditAmount).toBe(0);
  });

  it("puts an increase only on the installments carrying no money", () => {
    // The staff-child shape: whole year sat on a paid installment 1 with 2-4 at
    // zero. The correct half-tuition total has to land on 2-4.
    const plannedCharges = [5250, 4750, 4750, 4750];
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges,
      plannedTotal: 19500,
      rows: [
        { index: 0, existingAmountDue: 5250, appliedAmount: 5250 },
        { index: 1, existingAmountDue: 0, appliedAmount: 0 },
        { index: 2, existingAmountDue: 0, appliedAmount: 0 },
        { index: 3, existingAmountDue: 0, appliedAmount: 0 },
      ],
    });

    expect(sum(result.charges)).toBe(19500);
    expect(result.charges[0]).toBe(5250); // the paid row is untouched
    expect(sum(result.charges.slice(1))).toBe(14250);
  });

  it("still refuses to grow a paid row when there is nowhere else to put it", () => {
    const result = allocateChargesRespectingPaidFloors({
      plannedCharges: [9000, 9000],
      plannedTotal: 18000,
      rows: [
        { index: 0, existingAmountDue: 5000, appliedAmount: 5000 },
        { index: 1, existingAmountDue: 5000, appliedAmount: 5000 },
      ],
    });

    // Both rows carry money, so the allocator leaves them where they are and
    // lets classifyInstallmentLock report the shortfall for review.
    expect(result.charges).toEqual([5000, 5000]);
    expect(result.residualCreditAmount).toBe(0);
  });
});
