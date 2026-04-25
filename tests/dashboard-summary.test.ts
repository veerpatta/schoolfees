import { describe, expect, it } from "vitest";

import {
  buildDashboardSummary,
  calculatePercentage,
  formatPaymentModeLabel,
} from "@/lib/dashboard/summary";
import type {
  WorkbookInstallmentBalance,
  WorkbookStudentFinancial,
  WorkbookTransaction,
} from "@/lib/workbook/data";

function student(
  overrides: Partial<WorkbookStudentFinancial>,
): WorkbookStudentFinancial {
  return {
    studentId: "student-1",
    admissionNo: "SR-1",
    studentName: "Test Student",
    dateOfBirth: null,
    fatherName: "Father",
    motherName: null,
    fatherPhone: "9999999999",
    motherPhone: null,
    recordStatus: "active",
    classId: "class-1",
    sessionLabel: "2026-27",
    className: "Class 1",
    classLabel: "Class 1",
    sortOrder: 1,
    transportRouteId: null,
    transportRouteName: null,
    transportRouteCode: null,
    studentStatusCode: "existing",
    studentStatusLabel: "Old",
    tuitionFee: 1000,
    transportFee: 0,
    academicFee: 500,
    otherAdjustmentHead: null,
    otherAdjustmentAmount: 0,
    grossBaseBeforeDiscount: 1500,
    discountAmount: 0,
    lateFeeWaiverAmount: 0,
    lateFeeTotal: 0,
    totalDue: 1500,
    totalPaid: 0,
    outstandingAmount: 1500,
    nextDueDate: "2026-04-20",
    nextDueAmount: 1500,
    nextDueLabel: "Installment 1",
    lastPaymentDate: null,
    inst1Pending: 1500,
    inst2Pending: 0,
    inst3Pending: 0,
    inst4Pending: 0,
    statusLabel: "NOT STARTED",
    overrideReason: null,
    ...overrides,
  };
}

function installment(
  overrides: Partial<WorkbookInstallmentBalance>,
): WorkbookInstallmentBalance {
  return {
    installmentId: "installment-1",
    studentId: "student-1",
    admissionNo: "SR-1",
    studentName: "Test Student",
    fatherName: "Father",
    fatherPhone: "9999999999",
    sessionLabel: "2026-27",
    classId: "class-1",
    className: "Class 1",
    classLabel: "Class 1",
    section: "",
    streamName: "",
    installmentNo: 1,
    installmentLabel: "Installment 1",
    dueDate: "2026-04-20",
    transportRouteId: null,
    transportRouteName: null,
    transportRouteCode: null,
    lastPaymentDate: null,
    baseCharge: 1500,
    paidAmount: 0,
    adjustmentAmount: 0,
    rawLateFee: 0,
    waiverApplied: 0,
    finalLateFee: 0,
    totalCharge: 1500,
    pendingAmount: 1500,
    balanceStatus: "pending",
    ...overrides,
  };
}

function transaction(overrides: Partial<WorkbookTransaction>): WorkbookTransaction {
  return {
    receiptId: "receipt-1",
    receiptNumber: "SVP-1",
    paymentDate: "2026-04-24",
    paymentMode: "cash",
    referenceNumber: null,
    receivedBy: null,
    totalAmount: 500,
    studentId: "student-1",
    studentName: "Test Student",
    admissionNo: "SR-1",
    fatherName: "Father",
    fatherPhone: "9999999999",
    classId: "class-1",
    classLabel: "Class 1",
    transportRouteId: null,
    transportRouteLabel: "No Transport",
    sessionLabel: "2026-27",
    currentOutstanding: 1000,
    currentTotalPaid: 500,
    discountApplied: 0,
    lateFeeWaived: 0,
    ...overrides,
  };
}

describe("dashboard summary", () => {
  it("returns zeroed KPI and empty-state values with no source data", () => {
    const summary = buildDashboardSummary({
      financialRows: [],
      studentRows: [],
      installmentRows: [],
      overdueInstallments: [],
      transactions: [],
      todayTransactions: [],
    });

    expect(summary.kpis).toMatchObject({
      totalStudents: 0,
      totalExpectedFees: 0,
      totalCollected: 0,
      totalPending: 0,
      overdueAmount: 0,
      todaysCollection: 0,
      receiptsToday: 0,
      collectionRate: 0,
    });
    expect(summary.emptyState).toEqual({
      hasStudents: false,
      hasReceipts: false,
      hasFinancialData: false,
    });
  });

  it("calculates safe percentages without NaN or over-100 values", () => {
    expect(calculatePercentage(0, 0)).toBe(0);
    expect(calculatePercentage(25, 100)).toBe(25);
    expect(calculatePercentage(120, 100)).toBe(100);
    expect(calculatePercentage(-20, 100)).toBe(0);
  });

  it("uses raw active-session student count even when fee rows are missing", () => {
    const summary = buildDashboardSummary({
      rawStudentCount: 40,
      financialRows: [],
      studentRows: Array.from({ length: 40 }, (_, index) => ({
        studentId: `student-${index + 1}`,
        classId: "class-1",
        sessionLabel: "2026-27",
        classLabel: "Class 1",
      })),
      installmentRows: [],
      overdueInstallments: [],
      transactions: [],
      todayTransactions: [],
    });

    expect(summary.kpis.totalStudents).toBe(40);
    expect(summary.emptyState.hasStudents).toBe(true);
    expect(summary.emptyState.hasFinancialData).toBe(false);
  });

  it("builds class, installment, trend, and follow-up summaries from existing rows", () => {
    const summary = buildDashboardSummary({
      financialRows: [
        student({
          studentId: "student-1",
          classId: "class-1",
          classLabel: "Class 1",
          totalDue: 1500,
          totalPaid: 500,
          outstandingAmount: 1000,
          statusLabel: "PARTLY PAID",
        }),
        student({
          studentId: "student-2",
          classId: "class-2",
          admissionNo: "SR-2",
          studentName: "Second Student",
          classLabel: "Class 2",
          totalDue: 2000,
          totalPaid: 0,
          outstandingAmount: 2000,
          statusLabel: "OVERDUE",
        }),
      ],
      studentRows: [
        {
          studentId: "student-1",
          classId: "class-1",
          sessionLabel: "2026-27",
          classLabel: "Class 1",
        },
        {
          studentId: "student-2",
          classId: "class-2",
          sessionLabel: "2026-27",
          classLabel: "Class 2",
        },
      ],
      installmentRows: [
        installment({ studentId: "student-1", paidAmount: 500, pendingAmount: 1000 }),
        installment({
          installmentId: "installment-2",
          studentId: "student-2",
          classLabel: "Class 2",
          totalCharge: 2000,
          pendingAmount: 2000,
          balanceStatus: "overdue",
        }),
      ],
      overdueInstallments: [
        installment({
          installmentId: "installment-2",
          studentId: "student-2",
          classLabel: "Class 2",
          totalCharge: 2000,
          pendingAmount: 2000,
          balanceStatus: "overdue",
        }),
      ],
      transactions: [
        transaction({ receiptId: "receipt-1", paymentDate: "2026-04-23", totalAmount: 500 }),
        transaction({ receiptId: "receipt-2", paymentDate: "2026-04-24", totalAmount: 750 }),
      ],
      todayTransactions: [
        transaction({ receiptId: "receipt-2", paymentDate: "2026-04-24", totalAmount: 750 }),
      ],
    });

    expect(summary.kpis.totalStudents).toBe(2);
    expect(summary.kpis.totalExpectedFees).toBe(3500);
    expect(summary.kpis.totalCollected).toBe(500);
    expect(summary.kpis.totalPending).toBe(3000);
    expect(summary.kpis.overdueAmount).toBe(2000);
    expect(summary.classSummary[0]?.classLabel).toBe("Class 2");
    expect(summary.classSummary[0]?.totalStudents).toBe(1);
    expect(summary.installmentSummary[0]?.pendingAmount).toBe(3000);
    expect(summary.collectionTrend).toHaveLength(2);
    expect(summary.followUpQueue[0]?.studentName).toBe("Second Student");
  });

  it("keeps class rows visible even when dues are missing", () => {
    const summary = buildDashboardSummary({
      financialRows: [],
      studentRows: [
        {
          studentId: "student-1",
          classId: "class-1",
          sessionLabel: "2026-27",
          classLabel: "Class 1",
        },
      ],
      installmentRows: [],
      overdueInstallments: [],
      transactions: [],
      todayTransactions: [],
      rawStudentCount: 1,
    });

    expect(summary.kpis.totalStudents).toBe(1);
    expect(summary.classSummary[0]?.classLabel).toBe("Class 1");
    expect(summary.classSummary[0]?.totalStudents).toBe(1);
    expect(summary.classSummary[0]?.expectedAmount).toBe(0);
  });

  it("formats payment mode labels for dashboard display", () => {
    expect(formatPaymentModeLabel("upi")).toBe("UPI");
    expect(formatPaymentModeLabel("bank_transfer")).toBe("Bank transfer");
    expect(formatPaymentModeLabel("cheque")).toBe("Cheque");
    expect(formatPaymentModeLabel("cash")).toBe("Cash");
  });
});
