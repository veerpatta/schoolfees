import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getStudentDetail = vi.fn();
const createClient = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
}));

vi.mock("@/lib/students/data", () => ({
  getStudentDetail,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
}));

function student(overrides: Partial<Awaited<ReturnType<typeof getStudentDetail>>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    classSessionLabel: "2026-27",
    status: "active",
    ...overrides,
  };
}

function queryCount(counts: number[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn(() => Promise.resolve({ count: counts.shift() ?? 0, error: null })),
  };
}

function clientWithRpc(counts: number[], rpc: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn(() => queryCount(counts)),
    rpc,
  };
}

function noExistingReceiptClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
}

function noLikelyDuplicateClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  };
}

function duplicateReceiptQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          receipt_number: "SVP20260425-0001",
        },
      ],
      error: null,
    }),
  };
}

describe("payment submit preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeePolicySummary.mockResolvedValue({
      academicSessionLabel: "2026-27",
      receiptPrefix: "SVP",
      acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
    });
    getStudentDetail.mockResolvedValue(student());
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 1,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
    });
  });

  it("payment_submit_auto_prepares_missing_dues", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            installment_id: "00000000-0000-4000-8000-000000000101",
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
      })
      .mockResolvedValueOnce({
        data: {
          receipt_id: "00000000-0000-4000-8000-000000000201",
          receipt_number: "SVP20260425-0001",
          allocated_total: 1000,
        },
        error: null,
    });
    createClient
      .mockResolvedValueOnce(noExistingReceiptClient())
      .mockResolvedValueOnce(clientWithRpc([0], rpc))
      .mockResolvedValueOnce(clientWithRpc([4], rpc))
      .mockResolvedValueOnce(clientWithRpc([], rpc))
      .mockResolvedValueOnce(noLikelyDuplicateClient())
      .mockResolvedValueOnce({ rpc });

    const { postStudentPayment } = await import("@/lib/payments/data");
    const receipt = await postStudentPayment({
      studentId: "00000000-0000-4000-8000-000000000001",
      paymentDate: "2026-04-25",
      paymentMode: "cash",
      paymentAmount: 1000,
      referenceNumber: null,
      remarks: null,
      receivedBy: "Admin",
      clientRequestId: "00000000-0000-4000-8000-000000000901",
    });

    expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith({
      studentIds: ["00000000-0000-4000-8000-000000000001"],
      reason: "Payment submit auto-prepare",
      useSystemClient: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "preview_workbook_payment_allocation", {
      p_student_id: "00000000-0000-4000-8000-000000000001",
      p_payment_date: "2026-04-25",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "post_student_payment", expect.any(Object));
    expect(receipt.receiptNumber).toBe("SVP20260425-0001");
  });

  it("payment_submit_shows_exact_reason_when_class_fee_missing", async () => {
    createClient
      .mockResolvedValueOnce(noExistingReceiptClient())
      .mockResolvedValueOnce(clientWithRpc([0], vi.fn()));
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 0,
      duesNeedAttentionCount: 1,
      reasonSummary: "Class 1 does not have a fee amount in Fee Setup for 2026-27.",
    });

    const { postStudentPayment } = await import("@/lib/payments/data");

    await expect(
      postStudentPayment({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentAmount: 1000,
        referenceNumber: null,
        remarks: null,
        receivedBy: "Admin",
        clientRequestId: "00000000-0000-4000-8000-000000000901",
      }),
    ).rejects.toThrow("Class 1 does not have a fee amount in Fee Setup for 2026-27.");
  });

  it("payment_submit_shows_exact_reason_when_session_mismatch", async () => {
    createClient
      .mockResolvedValueOnce(noExistingReceiptClient())
      .mockResolvedValueOnce(clientWithRpc([4], vi.fn()));
    getStudentDetail.mockResolvedValue(student({ classSessionLabel: "2025-26" }));

    const { postStudentPayment } = await import("@/lib/payments/data");

    await expect(
      postStudentPayment({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentAmount: 1000,
        referenceNumber: null,
        remarks: null,
        receivedBy: "Admin",
        clientRequestId: "00000000-0000-4000-8000-000000000901",
      }),
    ).rejects.toThrow("Student belongs to another academic year.");
  });

  it("payment_submit_does_not_fail_after_successful_preview", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            installment_id: "00000000-0000-4000-8000-000000000101",
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
      })
      .mockResolvedValueOnce({
        data: {
          receipt_id: "00000000-0000-4000-8000-000000000201",
          receipt_number: "SVP20260425-0001",
          allocated_total: 1500,
        },
        error: null,
      });
    createClient
      .mockResolvedValueOnce(noExistingReceiptClient())
      .mockResolvedValueOnce(clientWithRpc([4], rpc))
      .mockResolvedValueOnce(clientWithRpc([], rpc))
      .mockResolvedValueOnce(noLikelyDuplicateClient())
      .mockResolvedValueOnce({ rpc });

    const { postStudentPayment } = await import("@/lib/payments/data");

    await expect(
      postStudentPayment({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentAmount: 1500,
        referenceNumber: null,
        remarks: null,
        receivedBy: "Admin",
        clientRequestId: "00000000-0000-4000-8000-000000000901",
      }),
    ).resolves.toMatchObject({
      receiptNumber: "SVP20260425-0001",
      allocatedTotal: 1500,
    });
  });

  it("likely duplicate payment returns a friendly warning without posting again", async () => {
    const postRpc = vi.fn();
    const previewRpc = vi.fn().mockResolvedValue({
      data: [
        {
          installment_id: "00000000-0000-4000-8000-000000000101",
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
    });
    const countClient = clientWithRpc([4], vi.fn());
    const previewClient = clientWithRpc([], previewRpc);
    const duplicateClient = {
      from: vi.fn(() => duplicateReceiptQuery()),
    };

    createClient
      .mockResolvedValueOnce(noExistingReceiptClient())
      .mockResolvedValueOnce(countClient)
      .mockResolvedValueOnce(previewClient)
      .mockResolvedValueOnce(duplicateClient);

    const { postStudentPayment } = await import("@/lib/payments/data");

    await expect(
      postStudentPayment({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentMode: "cash",
        paymentAmount: 1500,
        referenceNumber: null,
        remarks: null,
        receivedBy: "Admin",
        clientRequestId: "00000000-0000-4000-8000-000000000901",
      }),
    ).rejects.toThrow(
      "A similar payment was just recorded. Open the latest receipt or start a new payment if this is intentional.",
    );
    expect(postRpc).not.toHaveBeenCalled();
  });
});
