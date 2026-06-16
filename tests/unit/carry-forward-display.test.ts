import { describe, expect, it } from "vitest";

import {
  buildCarryForwardLabel,
  buildCarryForwardSummary,
  getDisplayInstallmentLabel,
  isCarryForwardInstallment,
} from "@/lib/prev-year-dues/display";

const row = (overrides: Record<string, unknown>) => ({
  installmentNo: 99,
  installmentLabel: "Previous year tuition balance (2025-26)",
  amountDue: 10000,
  outstandingAmount: 10000,
  paymentsTotal: 0,
  adjustmentsTotal: 0,
  finalLateFee: 0,
  ...overrides,
});

describe("carry-forward display helpers", () => {
  it("builds source-aware staff labels without exposing the internal installment number", () => {
    expect(
      buildCarryForwardLabel({
        sourceSessionLabel: "2025-26",
        feeHead: "tuition",
      }),
    ).toBe("Previous year tuition balance from 2025-26");

    expect(
      getDisplayInstallmentLabel(
        row({
          isCarryForward: true,
          sourceSessionLabel: "2025-26",
          installmentNo: 99,
        }),
      ),
    ).toBe("Previous year tuition balance from 2025-26");
  });

  it("recognizes future carry-forward rows from metadata before falling back to legacy labels", () => {
    expect(isCarryForwardInstallment(row({ isCarryForward: true }))).toBe(true);
    expect(isCarryForwardInstallment(row({ feeBucket: "previous_year_tuition" }))).toBe(true);
    expect(isCarryForwardInstallment(row({ installmentLabel: "Previous year tuition balance (2025-26)" }))).toBe(true);
    expect(isCarryForwardInstallment(row({ installmentLabel: "Previous year tuition balance from 2025-26" }))).toBe(true);
    expect(isCarryForwardInstallment(row({ installmentNo: 99, installmentLabel: "Quarter 99" }))).toBe(false);
  });

  it("splits pending amounts into current-year, previous-year, late-fee, and total buckets", () => {
    const summary = buildCarryForwardSummary([
      row({
        isCarryForward: true,
        sourceSessionLabel: "2025-26",
        amountDue: 7000,
        outstandingAmount: 3000,
        paymentsTotal: 4000,
      }),
      row({
        installmentNo: 1,
        installmentLabel: "Installment 1",
        amountDue: 10000,
        outstandingAmount: 5000,
        paymentsTotal: 5000,
        finalLateFee: 1000,
      }),
      row({
        installmentNo: 2,
        installmentLabel: "Installment 2",
        amountDue: 10000,
        outstandingAmount: 0,
        paymentsTotal: 10000,
        finalLateFee: 0,
      }),
    ]);

    expect(summary.previousYearPending).toBe(3000);
    expect(summary.previousYearOriginal).toBe(7000);
    expect(summary.previousYearCollected).toBe(4000);
    expect(summary.currentYearPending).toBe(4000);
    expect(summary.lateFeePending).toBe(1000);
    expect(summary.totalPending).toBe(8000);
    expect(summary.hasCarryForward).toBe(true);
  });
});
