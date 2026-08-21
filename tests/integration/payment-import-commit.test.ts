import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
const postStudentPayment = vi.fn();

vi.mock("@/platform/supabase/server", () => ({ createClient }));
vi.mock("@/modules/payments/data/queries", async () => {
  const actual = await vi.importActual<typeof import("@/modules/payments/data/queries")>(
    "@/modules/payments/data/queries",
  );
  return {
    ...actual,
    postStudentPayment,
  };
});

type RowSeed = {
  id: string;
  validation_status?: string;
  duplicate_acknowledged?: boolean;
  intra_file_duplicate?: boolean;
  existing_receipt_duplicate?: boolean;
  posted_at?: string | null;
  receipt_id?: string | null;
  receipt_number?: string | null;
  student_id?: string | null;
  amount?: number | null;
};

function rowSeed(overrides: RowSeed) {
  return {
    row_number: 2,
    admission_no: "2486",
    student_name: "Test Student",
    payment_date: "2026-07-01",
    payment_mode: "cash",
    amount: 6300,
    remarks: null,
    validation_status: "valid",
    validation_messages: [],
    duplicate_acknowledged: false,
    intra_file_duplicate: false,
    existing_receipt_duplicate: false,
    client_request_id: `crid-${overrides.id}`,
    receipt_id: null,
    receipt_number: null,
    posted_at: null,
    post_error: null,
    student_id: "00000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

function mockClient(rows: ReturnType<typeof rowSeed>[]) {
  const rowUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const batchUpdates: Array<Record<string, unknown>> = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table === "payment_import_batches") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "batch-1", session_label: "TEST-2026-27", status: "validated" },
            error: null,
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            batchUpdates.push(patch);
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }),
        };
      }
      if (table === "payment_import_rows") {
        return {
          select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
            if (options?.count) {
              return {
                eq: vi.fn().mockReturnThis(),
                not: vi.fn().mockResolvedValue({
                  count: rowUpdates.filter((update) => update.patch.posted_at).length,
                  error: null,
                }),
                // `.in(...)` alone counts postable rows; chaining `.is(...)`
                // narrows to rows still worth another attempt (not posted and
                // with no recorded error), which decides the terminal status.
                in: vi.fn(() => {
                  let narrowed = false;
                  const chain = {
                    is: vi.fn(() => {
                      narrowed = true;
                      return chain;
                    }),
                    then: (resolve: (value: { count: number; error: null }) => unknown) =>
                      resolve({
                        count: narrowed
                          ? rows.filter(
                              (row) =>
                                !rowUpdates.some(
                                  (update) =>
                                    update.id === row.id &&
                                    (update.patch.posted_at || update.patch.post_error),
                                ),
                            ).length
                          : rows.length,
                        error: null,
                      }),
                  };
                  return chain;
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: rows, error: null }),
            };
          }),
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: vi.fn((_column: string, id: string) => {
              rowUpdates.push({ id, patch });
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  createClient.mockResolvedValue(client);
  return { rowUpdates, batchUpdates };
}

describe("commitPaymentImportRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postStudentPayment.mockResolvedValue({
      receiptId: "receipt-1",
      receiptNumber: "SVP-TEST-0001",
    });
  });

  it("posts valid rows sequentially through postStudentPayment with the staged client_request_id", async () => {
    const rows = [rowSeed({ id: "row-1" }), rowSeed({ id: "row-2" })];
    const { rowUpdates } = mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    const result = await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1", "row-2"],
      acknowledgedRowIds: [],
      receivedBy: "admin@vpps.co.in",
    });

    expect(result.posted).toBe(2);
    expect(postStudentPayment).toHaveBeenCalledTimes(2);
    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: "crid-row-1",
        sessionLabel: "TEST-2026-27",
        receivedBy: "admin@vpps.co.in",
        acknowledgeDailyDuplicate: false,
      }),
    );
    expect(rowUpdates.some((update) => update.patch.receipt_number === "SVP-TEST-0001")).toBe(true);
  });

  it("skips already-posted rows without re-posting (idempotent re-run)", async () => {
    const rows = [
      rowSeed({
        id: "row-1",
        posted_at: "2026-07-19T05:00:00.000Z",
        receipt_id: "receipt-1",
        receipt_number: "SVP-TEST-0001",
      }),
    ];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    const result = await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: [],
      receivedBy: "admin@vpps.co.in",
    });

    expect(postStudentPayment).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ ok: true, receiptNumber: "SVP-TEST-0001" });
  });

  it("blocks warning rows without acknowledgment and passes the ack through when given", async () => {
    const rows = [
      rowSeed({ id: "row-1", validation_status: "warning" }),
      rowSeed({ id: "row-2", validation_status: "warning" }),
    ];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    const result = await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1", "row-2"],
      acknowledgedRowIds: ["row-2"],
      receivedBy: "admin@vpps.co.in",
    });

    expect(result.results.find((item) => item.rowId === "row-1")).toMatchObject({ ok: false });
    expect(postStudentPayment).toHaveBeenCalledTimes(1);
    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: "crid-row-2" }),
    );
  });

  // The two duplicate guards were previously driven by one flag: acknowledging
  // an intra-file duplicate also switched off the same-day check against
  // receipts already on the books, which could post a duplicate receipt.
  it("waives only the near-duplicate guard for an intra-file duplicate", async () => {
    const rows = [
      rowSeed({ id: "row-1", validation_status: "warning", intra_file_duplicate: true }),
    ];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: ["row-1"],
      receivedBy: "admin@vpps.co.in",
      canAcknowledgeNearDuplicate: true,
    });

    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgeNearDuplicate: true,
        acknowledgeDailyDuplicate: false,
      }),
    );
  });

  it("waives only the same-day guard for a row matching an existing receipt", async () => {
    const rows = [
      rowSeed({ id: "row-1", validation_status: "warning", existing_receipt_duplicate: true }),
    ];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: ["row-1"],
      receivedBy: "admin@vpps.co.in",
      canAcknowledgeNearDuplicate: true,
    });

    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgeNearDuplicate: false,
        acknowledgeDailyDuplicate: true,
      }),
    );
  });

  it("does not waive the near-duplicate guard without payments:adjust", async () => {
    const rows = [
      rowSeed({ id: "row-1", validation_status: "warning", intra_file_duplicate: true }),
    ];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: ["row-1"],
      receivedBy: "accountant@vpps.co.in",
      canAcknowledgeNearDuplicate: false,
    });

    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgeNearDuplicate: false }),
    );
  });

  // A client could otherwise pre-acknowledge a clean row and silently switch off
  // a duplicate guard the operator was never shown.
  it("ignores acknowledgments sent for rows that carry no warning", async () => {
    const rows = [rowSeed({ id: "row-1", existing_receipt_duplicate: true })];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: ["row-1"],
      receivedBy: "admin@vpps.co.in",
      canAcknowledgeNearDuplicate: true,
    });

    expect(postStudentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgeNearDuplicate: false,
        acknowledgeDailyDuplicate: false,
      }),
    );
  });

  it("records a post_error instead of failing the batch when a row throws", async () => {
    postStudentPayment.mockRejectedValueOnce(new Error("boom"));
    const rows = [rowSeed({ id: "row-1" }), rowSeed({ id: "row-2" })];
    const { rowUpdates } = mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    const result = await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1", "row-2"],
      acknowledgedRowIds: [],
      receivedBy: "admin@vpps.co.in",
    });

    expect(result.posted).toBe(1);
    expect(result.failed).toBe(1);
    expect(rowUpdates.some((update) => typeof update.patch.post_error === "string")).toBe(true);
  });

  it("never posts rows with validation errors", async () => {
    const rows = [rowSeed({ id: "row-1", validation_status: "error" })];
    mockClient(rows);

    const { commitPaymentImportRows } = await import("@/modules/payments/data/bulk/data");
    const result = await commitPaymentImportRows({
      batchId: "batch-1",
      rowIds: ["row-1"],
      acknowledgedRowIds: ["row-1"],
      receivedBy: "admin@vpps.co.in",
    });

    expect(postStudentPayment).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });
});
