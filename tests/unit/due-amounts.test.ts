import { describe, expect, it } from "vitest";

import {
  calculateInstallmentBasePending,
  calculateOverdueBaseAmount,
  calculatePendingLateFeeAmount,
} from "@/lib/fees/due-amounts";

describe("due amount helpers", () => {
  it("keeps overdue installment balance separate from pending late fee", () => {
    const overdueInstallment = {
      amountDue: 6000,
      paymentsTotal: 1000,
      adjustmentsTotal: 0,
      outstandingAmount: 5000,
      finalLateFee: 1000,
      balanceStatus: "overdue",
    };

    expect(calculateInstallmentBasePending(overdueInstallment)).toBe(4000);
    expect(calculateOverdueBaseAmount([overdueInstallment])).toBe(4000);
    expect(calculatePendingLateFeeAmount([overdueInstallment])).toBe(1000);
  });

  it("uses workbook base charge when the row already exposes it", () => {
    expect(
      calculateInstallmentBasePending({
        baseCharge: 5000,
        paidAmount: 2000,
        adjustmentAmount: 500,
        pendingAmount: 3500,
        finalLateFee: 1000,
        balanceStatus: "overdue",
      }),
    ).toBe(2500);
  });

  // Regression guard for the grandfathering of the late-fee rule change
  // (migration 20260808140000). An installment that is past its due date but
  // whose late fee has been fully waived reads finalLateFee = 0 while still
  // being balance_status = "overdue". The removed calculateCandidateLateFees
  // keyed on exactly that pair and would have re-invented the Rs 1,000.
  it("reports no pending late fee for an overdue installment whose fee is fully waived", () => {
    const grandfathered = {
      baseCharge: 6000,
      paidAmount: 0,
      adjustmentAmount: 0,
      pendingAmount: 6000,
      finalLateFee: 0,
      balanceStatus: "overdue",
    };

    expect(calculatePendingLateFeeAmount([grandfathered])).toBe(0);
    expect(calculateOverdueBaseAmount([grandfathered])).toBe(6000);
  });

  it("caps pending late fee at what is still outstanding on the installment", () => {
    expect(
      calculatePendingLateFeeAmount([
        { baseCharge: 6000, paidAmount: 6000, pendingAmount: 400, finalLateFee: 1000 },
      ]),
    ).toBe(400);
  });
});
