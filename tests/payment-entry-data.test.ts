import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getStudentDetail = vi.fn();
const getWorkbookStudentFinancials = vi.fn();
const getWorkbookInstallmentBalances = vi.fn();
const getWorkbookTransactions = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

vi.mock("@/lib/students/data", () => ({
  getStudentDetail,
}));

vi.mock("@/lib/workbook/data", () => ({
  getWorkbookStudentFinancials,
  getWorkbookInstallmentBalances,
  getWorkbookTransactions,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

describe("payment entry data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({
      academicSessionLabel: "2026-27",
      receiptPrefix: "SVP",
      lateFeeLabel: "Flat Rs 1000",
      acceptedPaymentModes: [
        { value: "cash", label: "Cash" },
        { value: "upi", label: "UPI" },
      ],
    });
    getWorkbookTransactions.mockResolvedValue([]);
    const emptyStudentQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    createClient.mockResolvedValue({
      from: vi.fn(() => emptyStudentQuery),
    });
  });

  it("loads a selected student even when the class filter does not include them", async () => {
    getWorkbookStudentFinancials.mockImplementation(async (filters?: { classId?: string; studentId?: string }) => {
      if (filters?.studentId === "student-1") {
        return [
          {
            studentId: "student-1",
            admissionNo: "SR-1",
            studentName: "Asha Sharma",
            fatherName: "Ramesh",
            motherName: null,
            fatherPhone: "9999999999",
            motherPhone: null,
            recordStatus: "active",
            classId: "class-2",
            sessionLabel: "2026-27",
            className: "Class 2",
            classLabel: "Class 2",
            sortOrder: 2,
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
          },
        ];
      }

      return [];
    });
    getWorkbookInstallmentBalances.mockResolvedValue([
      {
        installmentId: "inst-1",
        installmentNo: 1,
        installmentLabel: "Installment 1",
        dueDate: "2026-04-20",
        baseCharge: 1500,
        paidAmount: 0,
        adjustmentAmount: 0,
        rawLateFee: 0,
        waiverApplied: 0,
        finalLateFee: 0,
        totalCharge: 1500,
        pendingAmount: 1500,
        balanceStatus: "pending",
      },
    ]);

    const { getPaymentEntryPageData } = await import("@/lib/payments/data");
    const data = await getPaymentEntryPageData({
      studentId: "student-1",
      searchQuery: "",
      classId: "class-1",
    });

    expect(data.selectedStudent?.id).toBe("student-1");
    expect(data.selectedStudentIssue).toBeNull();
    expect(data.studentOptions[0]?.id).toBe("student-1");
  });

  it("shows a recovery message when a student exists but dues are not generated", async () => {
    getWorkbookStudentFinancials.mockResolvedValue([]);
    getStudentDetail.mockResolvedValue({
      id: "student-2",
      admissionNo: "SR-2",
      fullName: "Test Student",
      dateOfBirth: null,
      fatherName: "Father",
      motherName: null,
      fatherPhone: "8888888888",
      motherPhone: null,
      address: null,
      classId: "class-1",
      classLabel: "Class 1",
      classSessionLabel: "2026-27",
      transportRouteId: null,
      transportRouteLabel: "No Transport",
      status: "active",
      studentTypeOverride: "existing",
      studentStatusLabel: "Old",
      tuitionOverride: null,
      transportOverride: null,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      overrideReason: null,
      overrideNotes: null,
      notes: null,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    });

    const { getPaymentEntryPageData } = await import("@/lib/payments/data");
    const data = await getPaymentEntryPageData({
      studentId: "student-2",
      searchQuery: "",
      classId: "class-1",
    });

    expect(data.selectedStudent).toBeNull();
    expect(data.selectedStudentIssue?.title).toContain("Dues are not prepared");
    expect(data.selectedStudentIssue?.actionHref).toBeNull();
    expect(data.selectedStudentIssue?.repairStudentId).toBe("student-2");
  });
});
