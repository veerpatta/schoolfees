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
});
