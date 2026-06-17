import { describe, expect, it } from "vitest";

import {
  calculateCandidateLateFeeAmount,
  calculateCandidateLateFees,
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

describe("candidate (accruing) late fee", () => {
  // Two overdue installments with no materialized late fee — the common case
  // (the reported bug had waiver = 0).
  const twoOverdue = [
    { installmentNo: 1, balanceStatus: "overdue", finalLateFee: 0, pendingAmount: 6000 },
    { installmentNo: 2, balanceStatus: "overdue", finalLateFee: 0, pendingAmount: 6000 },
  ];

  it("charges the flat rate per overdue-unmaterialized installment when no waiver exists", () => {
    expect(calculateCandidateLateFees(twoOverdue, 1000, 0)).toEqual([1000, 1000]);
    expect(calculateCandidateLateFeeAmount(twoOverdue, 1000, 0)).toBe(2000);
  });

  it("consumes the waiver as a single pool across installments, not per-installment", () => {
    // Pool of 500 against 2 × 1000 candidate fees: installment 1 is reduced to
    // 500, installment 2 stays 1000 → total 1500. (The old per-installment calc
    // wrongly produced 500 + 500 = 1000.)
    expect(calculateCandidateLateFees(twoOverdue, 1000, 500)).toEqual([500, 1000]);
    expect(calculateCandidateLateFeeAmount(twoOverdue, 1000, 500)).toBe(1500);
  });

  it("zeroes a fully-waived candidate and never goes negative", () => {
    expect(calculateCandidateLateFees(twoOverdue, 1000, 2500)).toEqual([0, 0]);
    expect(calculateCandidateLateFeeAmount(twoOverdue, 1000, 2500)).toBe(0);
  });

  it("excludes carry-forward installments — they never accrue a late fee", () => {
    // ARIDAMAN's case from the bug report: one regular overdue installment
    // (₹1,000) plus an overdue previous-year carry-forward line. Only the
    // regular one accrues — total ₹1,000, NOT ₹2,000.
    const withCarryForward = [
      { installmentNo: 1, balanceStatus: "overdue", finalLateFee: 0, pendingAmount: 8875 },
      {
        installmentNo: 99,
        balanceStatus: "overdue",
        finalLateFee: 0,
        pendingAmount: 11500,
        isCarryForward: true,
      },
    ];
    expect(calculateCandidateLateFees(withCarryForward, 1000, 0)).toEqual([1000, 0]);
    expect(calculateCandidateLateFeeAmount(withCarryForward, 1000, 0)).toBe(1000);
  });

  it("ignores installments that are not overdue-unmaterialized", () => {
    const mixed = [
      { installmentNo: 1, balanceStatus: "paid", finalLateFee: 0, pendingAmount: 0 },
      { installmentNo: 2, balanceStatus: "overdue", finalLateFee: 1000, pendingAmount: 6000 },
      { installmentNo: 3, balanceStatus: "overdue", finalLateFee: 0, pendingAmount: 6000 },
      { installmentNo: 4, balanceStatus: "pending", finalLateFee: 0, pendingAmount: 6000 },
    ];
    // Only installment 3 is a candidate.
    expect(calculateCandidateLateFees(mixed, 1000, 0)).toEqual([0, 0, 1000, 0]);
    expect(calculateCandidateLateFeeAmount(mixed, 1000, 0)).toBe(1000);
  });
});
