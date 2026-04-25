import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getStudentDetail = vi.fn();
const getWorkbookStudentFinancials = vi.fn();
const getWorkbookInstallmentBalances = vi.fn();
const getWorkbookTransactions = vi.fn();
const createClient = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();

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

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
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
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    createClient.mockResolvedValue({
      from: vi.fn(() => emptyStudentQuery),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            installment_id: "inst-1",
            installment_no: 1,
            installment_label: "Installment 1",
            due_date: "2026-04-20",
            total_charge: 1500,
            paid_amount: 0,
            adjustment_amount: 0,
            raw_late_fee: 0,
            waiver_applied: 0,
            final_late_fee: 0,
            pending_amount: 1500,
            balance_status: "pending",
          },
        ],
        error: null,
      }),
    });
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 1,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
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

    expect(data.initialStudentSummary?.id).toBe("student-1");
    expect(data.initialStudentIssue).toBeNull();
    expect(data.initialStudentId).toBe("student-1");
  });

  it("does not load workbook dues for every student before a student is selected", async () => {
    const studentQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) =>
        resolve({
          data: [
            {
              id: "student-3",
              full_name: "Counter Student",
              admission_no: "SR-3",
              father_name: null,
              primary_phone: null,
              secondary_phone: null,
              class_ref: {
                id: "class-1",
                session_label: "2026-27",
                class_name: "Class 1",
                section: null,
                stream_name: null,
                status: "active",
              },
            },
          ],
          error: null,
        }),
      ),
    };
    createClient.mockResolvedValue({
      from: vi.fn(() => studentQuery),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { getPaymentEntryPageData } = await import("@/lib/payments/data");
    const data = await getPaymentEntryPageData({
      studentId: null,
      searchQuery: "",
      classId: "class-1",
    });

    expect(getWorkbookStudentFinancials).not.toHaveBeenCalled();
    expect(data.studentIndex).toHaveLength(1);
    expect(data.studentIndex[0]?.admissionNo).toBe("SR-3");
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

    expect(data.initialStudentSummary).toBeNull();
    expect(data.initialStudentIssue?.title).toContain("Dues are not prepared");
    expect(data.initialStudentIssue?.actionHref).toBeNull();
    expect(data.initialStudentIssue?.repairStudentId).toBe("student-2");
  });

  it("auto-prepares selected active student dues once when Payment Desk can post", async () => {
    getWorkbookStudentFinancials.mockImplementation(async (filters?: { studentId?: string }) => {
      if (!filters?.studentId) {
        return [];
      }

      return [
        {
          studentId: "student-2",
          admissionNo: "SR-2",
          studentName: "Test Student",
          fatherName: "Father",
          motherName: null,
          fatherPhone: "8888888888",
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
        },
      ];
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
    getStudentDetail.mockResolvedValue({
      id: "student-2",
      admissionNo: "SR-2",
      fullName: "Test Student",
      classLabel: "Class 1",
      classSessionLabel: "2026-27",
      status: "active",
    });
    const studentQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    const installmentCountQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === "installments" ? installmentCountQuery : studentQuery)),
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({
          data: [
            {
              installment_id: "inst-1",
              installment_no: 1,
              installment_label: "Installment 1",
              due_date: "2026-04-20",
              total_charge: 1500,
              paid_amount: 0,
              adjustment_amount: 0,
              raw_late_fee: 0,
              waiver_applied: 0,
              final_late_fee: 0,
              pending_amount: 1500,
              balance_status: "pending",
            },
          ],
          error: null,
        }),
    });

    const { getPaymentEntryPageData } = await import("@/lib/payments/data");
    const data = await getPaymentEntryPageData({
      studentId: "student-2",
      searchQuery: "",
      classId: "class-1",
      autoPrepareMissingDues: true,
    });

    expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith({
      studentIds: ["student-2"],
      reason: "Payment Desk selected student",
    });
    expect(data.initialStudentSummary?.id).toBe("student-2");
    expect(data.initialStudentIssue).toBeNull();
  });
});
