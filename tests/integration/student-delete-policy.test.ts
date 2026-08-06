import { describe, expect, it } from "vitest";

import { getStudentDeletePolicy } from "@/lib/students/delete-policy";

describe("student delete policy", () => {
  it("allows hard delete for a no-history student", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 0,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      sessionLabel: "2026-27",
      admissionNo: "PENDING-SR-001",
      fullName: "Wrong Entry",
    });

    expect(policy.hardDeleteAllowed).toBe(true);
    expect(policy.hardDeleteBlockers).toEqual([]);
  });

  it("allows deleting generated unpaid dues when no payment history exists", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      sessionLabel: "2026-27",
      admissionNo: "PENDING-SR-002",
      fullName: "Wrong Entry",
    });

    expect(policy.hardDeleteAllowed).toBe(true);
    expect(policy.generatedDuesDeleteAllowed).toBe(true);
  });

  it("requires archive when receipt history exists", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 1,
      paymentCount: 1,
      adjustmentCount: 0,
      sessionLabel: "2026-27",
      admissionNo: "SVP-001",
      fullName: "Real Student",
    });

    expect(policy.hardDeleteAllowed).toBe(false);
    expect(policy.hasFinancialHistory).toBe(true);
    expect(policy.hardDeleteBlockers).toContain("receipts (1)");
    expect(policy.hardDeleteBlockers).toContain("payments (1)");
  });

  it("keeps TEST session force delete limited to no-history records", () => {
    const noHistory = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      sessionLabel: "TEST-2026-27",
      admissionNo: "TEST-001",
      fullName: "Test Student",
    });
    const withReceipt = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 1,
      paymentCount: 1,
      adjustmentCount: 0,
      sessionLabel: "TEST-2026-27",
      admissionNo: "TEST-002",
      fullName: "Test Student",
    });

    expect(noHistory.canForceDeleteTestRecord).toBe(true);
    expect(withReceipt.canForceDeleteTestRecord).toBe(false);
  });

  it("delete_payment_history_student_blocked_with_withdraw_option", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 1,
      paymentCount: 2,
      adjustmentCount: 1,
      refundRequestCount: 1,
      receiptAdjustmentCount: 1,
      receiptFinanceAdjustmentCount: 1,
      blockedInstallmentCount: 1,
      ledgerRegenerationRowCount: 1,
      sessionLabel: "2026-27",
      admissionNo: "SVP-002",
      fullName: "Real Student",
    });

    expect(policy.hardDeleteAllowed).toBe(false);
    expect(policy.hardDeleteBlockers).toEqual([
      "receipts (1)",
      "payments (2)",
      "payment adjustments (1)",
      "refund requests (1)",
      "receipt adjustments (1)",
      "receipt finance adjustments (1)",
      "fee review rows (1)",
      "dues recalculation rows (1)",
    ]);
  });

  // Regression: receipt_adjustments / receipt_finance_adjustments hold
  // `on delete restrict` FKs on students. They were missing from the policy, so
  // the UI offered the delete button and Postgres then refused the DELETE —
  // staff typed the SR no and got an unexplained error.
  it("blocks hard delete when only a receipt adjustment is linked", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 0,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      receiptAdjustmentCount: 2,
      sessionLabel: "2026-27",
      admissionNo: "SVP-003",
      fullName: "Real Student",
    });

    expect(policy.hardDeleteAllowed).toBe(false);
    expect(policy.hasFinancialHistory).toBe(true);
    expect(policy.canForceDeleteTestRecord).toBe(false);
    expect(policy.hardDeleteBlockers).toEqual(["receipt adjustments (2)"]);
  });

  it("blocks hard delete when only a receipt finance adjustment is linked", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 0,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      receiptFinanceAdjustmentCount: 1,
      sessionLabel: "TEST-2026-27",
      admissionNo: "TEST-003",
      fullName: "Test Student",
    });

    expect(policy.hardDeleteAllowed).toBe(false);
    expect(policy.canForceDeleteTestRecord).toBe(false);
    expect(policy.hardDeleteBlockers).toEqual(["receipt finance adjustments (1)"]);
  });

  // Carry-forward balances, the session reanchor log and payment import staging
  // also restrict the delete, but they are derived rows rather than posted
  // money: hardDeleteStudent() clears them instead, so they must NOT block.
  it("does not block on derived rows that the delete path cleans up", () => {
    const policy = getStudentDeletePolicy({
      installmentCount: 4,
      receiptCount: 0,
      paymentCount: 0,
      adjustmentCount: 0,
      receiptAdjustmentCount: 0,
      receiptFinanceAdjustmentCount: 0,
      sessionLabel: "2026-27",
      admissionNo: "PENDING-SR-003",
      fullName: "Wrong Entry",
    });

    expect(policy.hardDeleteAllowed).toBe(true);
    expect(policy.hardDeleteBlockers).toEqual([]);
  });
});
