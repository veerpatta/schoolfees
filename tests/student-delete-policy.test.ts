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
      "fee review rows (1)",
      "dues recalculation rows (1)",
    ]);
  });
});
