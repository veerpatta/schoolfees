import { describe, expect, it } from "vitest";

import { buildFeeBreakdownSummary } from "@/lib/fees/fee-breakdown-summary";

/**
 * Guards the school's accounting rule: discounts (conventional + manual) reduce
 * Expected and are never counted as Paid, and late-fee waivers / discount
 * close-outs are tracked separately from cash Paid.
 */
function breakdown() {
  return {
    coreHeads: [
      { id: "tuition_fee", label: "Tuition", amount: 32000 },
      { id: "transport_fee", label: "Transport", amount: 6000 },
    ],
    customHeads: [],
    // Tuition before a ₹6,000 conventional (3rd-child) discount = 38,000.
    tuitionBeforeConventionalDiscount: 38000,
    conventionalDiscountApplied: 6000,
    conventionalDiscountLabels: ["3rd Child"],
    discountApplied: 2000, // manual discount
    annualTotal: 30000, // net = gross(38000) - 6000 - 2000
  };
}

describe("buildFeeBreakdownSummary", () => {
  it("separates discounts, late-fee waiver, and cash paid", () => {
    const summary = buildFeeBreakdownSummary({
      resolvedBreakdown: breakdown(),
      installmentBalances: [
        { paidAmount: 10000, pendingAmount: 0, waiverApplied: 1000, finalLateFee: 0 },
        { paidAmount: 0, pendingAmount: 20000, waiverApplied: 0, finalLateFee: 500 },
      ],
      discountCloseouts: 3000,
    });

    expect(summary.conventionalDiscount).toBe(6000);
    expect(summary.manualDiscount).toBe(2000);
    expect(summary.totalDiscount).toBe(8000);
    expect(summary.expectedNet).toBe(30000);
    // Gross is net + all discounts (the pre-discount fee).
    expect(summary.expectedGross).toBe(38000);

    // Cash paid excludes discounts and close-outs.
    expect(summary.paid).toBe(10000);
    expect(summary.discountCloseouts).toBe(3000);
    expect(summary.lateFeeWaiver).toBe(1000);
    expect(summary.lateFeeCharged).toBe(500);
    expect(summary.pending).toBe(20000);
  });

  it("emits discount rows that reduce, not add to, the fee total", () => {
    const summary = buildFeeBreakdownSummary({
      resolvedBreakdown: breakdown(),
      installmentBalances: [],
    });

    const discountRows = summary.rows.filter((row) => row.kind === "discount");
    expect(discountRows.length).toBeGreaterThan(0);
    for (const row of discountRows) {
      expect(row.amount).toBeLessThan(0);
    }
    // No close-outs passed → defaults to zero, never NaN.
    expect(summary.discountCloseouts).toBe(0);
  });
});
