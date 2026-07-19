import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const getStudentDetail = vi.fn();
const createClient = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
  getFeePolicyForSession: getFeePolicySummary,
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

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

type UniversalClientOptions = {
  /** Sequential results for countNonCancelledInstallments (initial, recount). */
  counts?: number[];
  /** Row returned by the clientRequestId idempotency lookup (.maybeSingle). */
  existingReceipt?: { id: string; receipt_number: string; total_amount?: number } | null;
  /** Row returned by the 60-second near-duplicate check. */
  nearDuplicate?: { id: string; receipt_number: string } | null;
  /** Row returned by the daily same-amount soft check. */
  dailyDuplicate?: { id: string; receipt_number: string } | null;
  /** Result rows for preview_workbook_payment_allocation. */
  previewRows?: Array<Record<string, unknown>>;
  /** Result row for post_student_payment_with_adjustments. */
  postResult?: Record<string, unknown> | null;
  /** Error for the posting RPC. */
  postError?: { message: string } | null;
};

// postStudentPayment now runs its independent reads (idempotency lookup,
// preflight, duplicate checks) in parallel, so mocks keyed to createClient
// call ORDER no longer work. This client dispatches on the shape of each
// query instead: the terminal method (or awaiting the builder itself)
// identifies which data-layer helper is asking.
function universalClient(options: UniversalClientOptions = {}) {
  const counts = [...(options.counts ?? [])];
  const rpc = vi.fn((name: string) => {
    if (name === "preview_workbook_payment_allocation") {
      return Promise.resolve({ data: options.previewRows ?? [], error: null });
    }

    if (options.postError) {
      return Promise.resolve({ data: null, error: options.postError });
    }

    return Promise.resolve({ data: options.postResult ?? null, error: null });
  });
  const from = vi.fn(() => {
    let sawGte = false;
    const query: Record<string, unknown> = {};
    const chain = vi.fn(() => query);
    Object.assign(query, {
      select: chain,
      eq: chain,
      order: chain,
      limit: chain,
      gte: vi.fn(() => {
        sawGte = true;
        return query;
      }),
      // countNonCancelledInstallments terminates in .neq()
      neq: vi.fn(() =>
        Promise.resolve({ count: counts.length > 0 ? counts.shift() : 0, error: null }),
      ),
      // findReceiptByClientRequestId / financial-state lookups terminate in .maybeSingle()
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: options.existingReceipt ?? null, error: null }),
      ),
      // findLikelyDuplicateReceipt with a null reference terminates in .is()
      is: vi.fn(() =>
        Promise.resolve({
          data: options.nearDuplicate ? [options.nearDuplicate] : [],
          error: null,
        }),
      ),
      // findLikelyDailyDuplicateReceipt awaits the builder itself after .limit();
      // findLikelyDuplicateReceipt with a reference number does the same after
      // .eq() — the .gte() call distinguishes the two.
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => {
        const row = sawGte ? options.nearDuplicate : options.dailyDuplicate;
        return Promise.resolve({ data: row ? [row] : [], error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    });
    return query;
  });

  return { client: { from, rpc }, rpc };
}

function useClient(options: UniversalClientOptions = {}) {
  const { client, rpc } = universalClient(options);
  createClient.mockResolvedValue(client);
  return rpc;
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
    const rpc = useClient({
      counts: [0, 4],
      previewRows: [previewRow()],
      postResult: {
        receipt_id: "00000000-0000-4000-8000-000000000201",
        receipt_number: "SVP20260425-0001",
        allocated_total: 1000,
      },
    });

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
    expect(rpc).toHaveBeenCalledWith("preview_workbook_payment_allocation", {
      p_student_id: "00000000-0000-4000-8000-000000000001",
      p_payment_date: "2026-04-25",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "post_student_payment_with_adjustments",
      expect.any(Object),
    );
    expect(receipt.receiptNumber).toBe("SVP20260425-0001");
  });

  it("payment_submit_shows_exact_reason_when_class_fee_missing", async () => {
    useClient({ counts: [0] });
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
    useClient({ counts: [4] });
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
    useClient({
      counts: [4],
      previewRows: [previewRow()],
      postResult: {
        receipt_id: "00000000-0000-4000-8000-000000000201",
        receipt_number: "SVP20260425-0001",
        allocated_total: 1500,
      },
    });

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

  it("server preflight rejects overpayment after quick discount", async () => {
    useClient({
      counts: [4],
      previewRows: [previewRow({ total_charge: 1000, pending_amount: 1000 })],
    });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 1000,
        quickDiscountAmount: 100,
        paymentMode: "cash",
        referenceNumber: null,
      }),
    ).rejects.toThrow("Payment amount is more than net payable after discount.");
  });

  it("server preflight rejects late fee waiver above pending late fee", async () => {
    useClient({
      counts: [4],
      previewRows: [
        previewRow({
          total_charge: 1100,
          raw_late_fee: 100,
          final_late_fee: 100,
          pending_amount: 1100,
        }),
      ],
    });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 1000,
        quickLateFeeWaiverAmount: 200,
        paymentMode: "cash",
        referenceNumber: null,
      }),
    ).rejects.toThrow("Late fee waiver cannot be more than pending late fee.");
  });

  it("server preflight accepts UPI payment without a reference number", async () => {
    useClient({ counts: [4] });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 900,
        paymentMode: "upi",
        referenceNumber: null,
      }),
    ).rejects.not.toThrow("Reference number is required for UPI, bank transfer, and cheque payments.");
  });

  it("payment submit passes quick adjustments to the adjustment RPC", async () => {
    const rpc = useClient({
      counts: [4],
      previewRows: [previewRow({ total_charge: 1000, pending_amount: 1000 })],
      postResult: {
        receipt_id: "00000000-0000-4000-8000-000000000201",
        receipt_number: "SVP20260425-0001",
        allocated_total: 900,
      },
    });

    const { postStudentPayment } = await import("@/lib/payments/data");

    const receipt = await postStudentPayment({
      studentId: "00000000-0000-4000-8000-000000000001",
      paymentDate: "2026-04-25",
      paymentMode: "cash",
      paymentAmount: 900,
      quickDiscountAmount: 100,
      quickLateFeeWaiverAmount: 0,
      referenceNumber: null,
      remarks: null,
      receivedBy: "Admin",
      clientRequestId: "00000000-0000-4000-8000-000000000901",
    });

    expect(rpc).toHaveBeenLastCalledWith("post_student_payment_with_adjustments", expect.objectContaining({
      p_total_amount: 900,
      p_quick_discount_amount: 100,
      p_quick_late_fee_waiver_amount: 0,
    }));
    expect(receipt).toMatchObject({
      quickDiscountApplied: 100,
      lateFeeWaivedApplied: 0,
      remainingBalance: 0,
    });
  });

  it("likely duplicate payment returns a friendly warning without posting again", async () => {
    const rpc = useClient({
      counts: [4],
      previewRows: [previewRow()],
      nearDuplicate: {
        id: "00000000-0000-4000-8000-000000000301",
        receipt_number: "SVP20260425-0001",
      },
    });

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
      "A similar payment was just recorded for this student. Open the latest receipt to verify before posting again.",
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "post_student_payment_with_adjustments",
      expect.anything(),
    );
  });

  it("regular mode still blocks a non-active student (safety gate intact)", async () => {
    getStudentDetail.mockResolvedValue(student({ status: "left" }));
    useClient({ counts: [4] });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 1000,
        paymentMode: "cash",
        referenceNumber: null,
      }),
    ).rejects.toThrow("No payable dues found for selected payment date.");
    expect(prepareDuesForStudentsAutomatically).not.toHaveBeenCalled();
  });

  it("recovery mode allows a non-active student but never auto-prepares dues", async () => {
    getStudentDetail.mockResolvedValue(student({ status: "left" }));
    // installmentCount === 0 -> regular would auto-prepare; recovery must error.
    useClient({ counts: [0] });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 1000,
        paymentMode: "cash",
        referenceNumber: null,
        collectionContext: "left_student_recovery",
      }),
    ).rejects.toThrow("No existing dues to recover for this student.");
    expect(prepareDuesForStudentsAutomatically).not.toHaveBeenCalled();
  });

  it("recovery mode rejects overpayment beyond existing pending dues", async () => {
    getStudentDetail.mockResolvedValue(student({ status: "left" }));
    useClient({
      counts: [4],
      previewRows: [
        previewRow({
          installment_label: "Installment 3",
          due_date: "2026-10-20",
          total_charge: 1000,
          pending_amount: 1000,
        }),
      ],
    });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 2000,
        paymentMode: "cash",
        referenceNumber: null,
        collectionContext: "left_student_recovery",
      }),
    ).rejects.toThrow("Payment amount is more than net payable after discount.");
  });

  it("recovery mode accepts a valid collection against a left student's existing dues", async () => {
    getStudentDetail.mockResolvedValue(student({ status: "left" }));
    useClient({
      counts: [4],
      previewRows: [
        previewRow({
          installment_label: "Installment 3",
          due_date: "2026-10-20",
          total_charge: 1000,
          pending_amount: 1000,
        }),
      ],
    });

    const { preflightPaymentPosting } = await import("@/lib/payments/data");

    await expect(
      preflightPaymentPosting({
        studentId: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-04-25",
        paymentAmount: 1000,
        paymentMode: "cash",
        referenceNumber: null,
        collectionContext: "left_student_recovery",
      }),
    ).resolves.toBeTruthy();
    expect(prepareDuesForStudentsAutomatically).not.toHaveBeenCalled();
  });
});
