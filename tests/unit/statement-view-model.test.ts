import { describe, expect, it } from "vitest";

import type { StudentFinancialSnapshot } from "@/modules/fees/domain/types";
import {
  buildStatementFamilyView,
  buildStatementReceiptRows,
  buildStatementStudentView,
  deriveFeeHeadBasis,
} from "@/modules/students/domain/statement-view-model";
import type { WorkbookInstallmentBalance } from "@/modules/fees/data/queries";

const TODAY = "2026-08-14";

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    fullName: "Aarav Singh",
    admissionNo: "1042",
    classLabel: "Class 6-A",
    studentStatusLabel: "Old",
    fatherName: "Ramesh Singh",
    fatherPhone: "9876543210",
    transportRouteLabel: "Route 4 · Bhinmal",
    villageCity: "Bhinmal",
    address: "Bhinmal, Jalore",
    tuitionOverride: null,
    transportOverride: null,
    overrideReason: null,
    ...overrides,
  } as Parameters<typeof buildStatementStudentView>[0]["student"];
}

function snapshot(overrides: Record<string, unknown> = {}): StudentFinancialSnapshot {
  return {
    policy: { academicSessionLabel: "2026-27", lateFeeFlatAmount: 1000 },
    resolvedBreakdown: {
      coreHeads: [
        { id: "tuition_fee", label: "Tuition fee", amount: 32000 },
        { id: "academic_fee", label: "Academic fee", amount: 500 },
        { id: "transport_fee", label: "Transport fee", amount: 9800 },
      ],
      customHeads: [],
      otherAdjustmentHeads: [],
      annualTotal: 42300,
      conventionalDiscountApplied: 0,
      conventionalDiscountLabels: [],
      tuitionBeforeConventionalDiscount: 32000,
      discountApplied: 0,
    },
    currentOutstanding: 0,
    openInstallments: 0,
    overdueInstallments: 0,
    nextDueDate: null,
    nextDueLabel: null,
    nextDueAmount: null,
    activeOverrideReason: null,
    ...overrides,
  } as unknown as StudentFinancialSnapshot;
}

function installment(overrides: Partial<WorkbookInstallmentBalance> = {}) {
  return {
    installmentId: "i1",
    installmentLabel: "Installment 1",
    dueDate: "2026-04-20",
    isCarryForward: false,
    baseCharge: 10575,
    paidAmount: 0,
    appliedAmount: 0,
    discountCloseoutAmount: 0,
    adjustmentAmount: 0,
    rawLateFee: 0,
    waiverApplied: 0,
    finalLateFee: 0,
    totalCharge: 10575,
    pendingAmount: 10575,
    lateFeePending: 0,
    totalPending: 10575,
    ...overrides,
  } as WorkbookInstallmentBalance;
}

describe("buildStatementStudentView — money invariants", () => {
  it("balances charged − paid − written off against still payable", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({ appliedAmount: 10575, pendingAmount: 0, totalPending: 0 }),
        installment({
          installmentId: "i2",
          appliedAmount: 4000,
          discountCloseoutAmount: 2000,
          pendingAmount: 4575,
          totalPending: 4575,
        }),
        installment({ installmentId: "i3" }),
      ],
      todayIso: TODAY,
    });

    expect(view.totalCharged).toBe(31725);
    expect(view.paidInCash).toBe(14575);
    expect(view.writtenOff).toBe(2000);
    expect(view.stillPayable).toBe(15150);
    expect(view.totalCharged - view.paidInCash - view.writtenOff).toBe(view.stillPayable);
  });

  it("keeps the late fee out of fees pending, and sums the two into still payable", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({
          finalLateFee: 1000,
          totalCharge: 11575,
          pendingAmount: 10575,
          lateFeePending: 1000,
          totalPending: 11575,
        }),
      ],
      todayIso: TODAY,
    });

    expect(view.feesPending).toBe(10575);
    expect(view.lateFeePending).toBe(1000);
    expect(view.stillPayable).toBe(view.feesPending + view.lateFeePending);
    // The tile the office collects against is the sum; the fees figure alone
    // never carries the late fee. CLAUDE.md hard rule 8.
    expect(view.feesPending).not.toBe(view.stillPayable);
  });

  it("reads paid from appliedAmount, so a reversed receipt counts as nothing", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      // paidAmount still holds the reversed cash; appliedAmount is what stuck.
      installmentBalances: [installment({ paidAmount: 10575, appliedAmount: 0 })],
      todayIso: TODAY,
    });

    expect(view.paidInCash).toBe(0);
    expect(view.stillPayable).toBe(10575);
  });

  it("marks a row cleared only by a write-off as written off, not paid", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({ discountCloseoutAmount: 10575, pendingAmount: 0, totalPending: 0 }),
      ],
      todayIso: TODAY,
    });

    expect(view.installmentRows[0].status).toBe("written");
    expect(view.paidInCash).toBe(0);
    expect(view.writtenOff).toBe(10575);
  });

  it("calls a row that took cash AND a write-off paid, not written off", () => {
    // The write-off is disclosed on the row's own sub-line either way. Labelling
    // a row the family largely paid as "Written off" would understate them;
    // "Written off" is reserved for a balance cleared with no money at all.
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({
          appliedAmount: 8575,
          discountCloseoutAmount: 2000,
          pendingAmount: 0,
          totalPending: 0,
          totalCharge: 10575,
        }),
      ],
      todayIso: TODAY,
    });

    expect(view.installmentRows[0].status).toBe("paid");
    expect(view.installmentRows[0].writtenOff).toBe(2000);
    expect(view.paidInCash).toBe(8575);
    expect(view.writtenOff).toBe(2000);
  });

  it("calls a past-due row with a balance overdue, and a future one pending", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({ dueDate: "2026-04-20" }),
        installment({ installmentId: "i4", dueDate: "2027-01-20" }),
      ],
      todayIso: TODAY,
    });

    expect(view.installmentRows.map((row) => row.status)).toEqual(["overdue", "pending"]);
  });

  it("names the gap when the ledger raised more than policy accounts for", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      // annualTotal 42,300 but the ledger raised 45,000 — fee setup was
      // republished after dues were prepared.
      installmentBalances: [installment({ totalCharge: 45000, baseCharge: 45000 })],
      todayIso: TODAY,
    });

    expect(view.extras).toContainEqual({ label: "Fee revision this session", amount: 2700 });
    expect(view.annualFee + view.extras.reduce((s, e) => s + e.amount, 0)).toBe(view.totalCharged);
  });

  it("carries a previous-year balance as an extra, not into the annual fee", () => {
    const view = buildStatementStudentView({
      student: student(),
      financialSnapshot: snapshot(),
      installmentBalances: [
        installment({ isCarryForward: true, baseCharge: 4200, totalCharge: 4200, pendingAmount: 4200, totalPending: 4200 }),
        installment({ installmentId: "i2", baseCharge: 42300, totalCharge: 42300, pendingAmount: 42300, totalPending: 42300 }),
      ],
      todayIso: TODAY,
    });

    expect(view.previousYearBalance).toBe(4200);
    expect(view.annualFee).toBe(42300);
    expect(view.installmentSplit.collectsCarryForwardFirst).toBe(true);
    // The carry-forward row is excluded from the "N installments of about X" split.
    expect(view.installmentSplit.count).toBe(1);
  });
});

describe("deriveFeeHeadBasis", () => {
  const breakdown = snapshot().resolvedBreakdown;

  it("explains each core head from real student data", () => {
    expect(deriveFeeHeadBasis("tuition_fee", { student: student(), breakdown })).toBe(
      "Class 6-A annual rate",
    );
    expect(deriveFeeHeadBasis("transport_fee", { student: student(), breakdown })).toBe(
      "Route 4 · Bhinmal",
    );
    expect(deriveFeeHeadBasis("academic_fee", { student: student(), breakdown })).toBe("Old student");
  });

  it("says so when a rate is overridden for this student", () => {
    expect(
      deriveFeeHeadBasis("tuition_fee", { student: student({ tuitionOverride: 20000 }), breakdown }),
    ).toBe("Custom rate for this student");
  });

  it("names the discount policy behind a conventional discount", () => {
    const withPolicy = { ...breakdown, conventionalDiscountLabels: ["3rd Child Policy"] };
    expect(deriveFeeHeadBasis("conventional_discount", { student: student(), breakdown: withPolicy })).toBe(
      "3rd Child Policy",
    );
  });

  it("leaves a head with nothing to say blank rather than inventing prose", () => {
    expect(deriveFeeHeadBasis("books_fee", { student: student(), breakdown })).toBe("");
    expect(deriveFeeHeadBasis("some_custom_head", { student: student(), breakdown })).toBe("");
  });
});

describe("buildStatementReceiptRows", () => {
  function receipt(overrides: Record<string, unknown> = {}) {
    return {
      id: "r1",
      receiptNumber: "SVP/0001",
      paymentDate: "2026-04-12",
      totalAmount: 10000,
      paymentModeLabel: "Cash",
      createdAt: "2026-04-12T10:00:00Z",
      isReversed: false,
      ...overrides,
    };
  }

  it("runs the balance down in payment order", () => {
    const rows = buildStatementReceiptRows(
      [
        receipt({ id: "r2", paymentDate: "2026-07-05", createdAt: "2026-07-05T10:00:00Z", totalAmount: 5000 }),
        receipt(),
      ],
      30000,
    );

    expect(rows.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(rows.map((row) => row.balanceAfter)).toEqual([20000, 15000]);
  });

  it("breaks a same-day tie on createdAt, so the running balance is stable", () => {
    const rows = buildStatementReceiptRows(
      [
        receipt({ id: "late", createdAt: "2026-04-12T15:00:00Z", totalAmount: 1000 }),
        receipt({ id: "early", createdAt: "2026-04-12T09:00:00Z", totalAmount: 2000 }),
      ],
      10000,
    );

    expect(rows.map((row) => row.id)).toEqual(["early", "late"]);
    expect(rows.map((row) => row.balanceAfter)).toEqual([8000, 7000]);
  });

  it("keeps a reversed receipt on the page but moves no money", () => {
    const rows = buildStatementReceiptRows(
      [receipt({ isReversed: true }), receipt({ id: "r2", createdAt: "2026-04-13T10:00:00Z", totalAmount: 4000 })],
      30000,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].balanceAfter).toBe(30000);
    expect(rows[1].balanceAfter).toBe(26000);
  });

  it("flags a discount-mode receipt as a write-off", () => {
    const rows = buildStatementReceiptRows([receipt({ paymentModeLabel: "Discount" })], 30000);
    expect(rows[0].isWriteOff).toBe(true);
  });
});

describe("buildStatementFamilyView", () => {
  const familyGroup = { id: "f1", name: "Singh", academic_session_label: "2026-27" };

  it("adds the siblings up and merges their receipts into one register", () => {
    const view = buildStatementFamilyView({
      familyGroup,
      students: [
        {
          student: student(),
          financialSnapshot: snapshot(),
          installmentBalances: [installment({ appliedAmount: 10575, pendingAmount: 0, totalPending: 0 })],
          receipts: [
            {
              id: "r1",
              receiptNumber: "SVP/0044",
              paymentDate: "2026-04-12",
              totalAmount: 10575,
              paymentModeLabel: "Cash",
              createdAt: "2026-04-12T10:00:00Z",
              isReversed: false,
            },
          ],
        },
        {
          student: student({ id: "s2", fullName: "Riya Singh", admissionNo: "1288" }),
          financialSnapshot: snapshot(),
          installmentBalances: [installment({ installmentId: "i9" })],
          receipts: [],
        },
      ],
      todayIso: TODAY,
    });

    expect(view).not.toBeNull();
    expect(view!.students).toHaveLength(2);
    expect(view!.totalCharged).toBe(21150);
    expect(view!.paidInCash).toBe(10575);
    expect(view!.stillPayable).toBe(10575);
    expect(view!.receiptRows).toHaveLength(1);
    expect(view!.receiptRows[0].studentName).toBe("Aarav Singh");
  });

  it("returns null when no sibling has a financial snapshot to report on", () => {
    const view = buildStatementFamilyView({
      familyGroup,
      students: [{ student: student(), financialSnapshot: null, installmentBalances: [] }],
      todayIso: TODAY,
    });

    expect(view).toBeNull();
  });

  it("calls the family clear only when every sibling is clear", () => {
    const view = buildStatementFamilyView({
      familyGroup,
      students: [
        {
          student: student(),
          financialSnapshot: snapshot(),
          installmentBalances: [installment({ appliedAmount: 10575, pendingAmount: 0, totalPending: 0 })],
        },
        {
          student: student({ id: "s2" }),
          financialSnapshot: snapshot({ currentOutstanding: 10575 }),
          installmentBalances: [installment({ installmentId: "i9" })],
        },
      ],
      todayIso: TODAY,
    });

    expect(view!.isYearClear).toBe(false);
  });
});
