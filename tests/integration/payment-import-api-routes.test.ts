import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAuthenticatedStaff = vi.fn();
const hasStaffPermission = vi.fn();
const createPaymentImportBatch = vi.fn();
const getPaymentImportBatchSummary = vi.fn();
const commitPaymentImportRows = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  getAuthenticatedStaff,
  hasStaffPermission,
}));

vi.mock("@/lib/payments/bulk/data", () => ({
  createPaymentImportBatch,
  getPaymentImportBatchSummary,
  commitPaymentImportRows,
}));

vi.mock("@/lib/system-sync/finance-revalidation", () => ({
  revalidateAfterPaymentPosting: vi.fn(),
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  revalidateSessionFinance: vi.fn(),
}));

describe("bulk payment API routes — permission gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedStaff.mockResolvedValue({ id: "staff-1", appRole: "accountant" });
    hasStaffPermission.mockReturnValue(false);
  });

  it("upload rejects staff without payments:bulk", async () => {
    const { POST } = await import("@/app/api/imports/payments/upload/route");
    const response = await POST(new Request("http://test/upload", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(hasStaffPermission).toHaveBeenCalledWith(expect.anything(), "payments:bulk");
    expect(createPaymentImportBatch).not.toHaveBeenCalled();
  });

  it("summary rejects staff without payments:bulk", async () => {
    const { GET } = await import("@/app/api/imports/payments/batch/[batchId]/summary/route");
    const response = await GET(new Request("http://test/summary"), {
      params: Promise.resolve({ batchId: "batch-1" }),
    });

    expect(response.status).toBe(403);
    expect(getPaymentImportBatchSummary).not.toHaveBeenCalled();
  });

  it("commit rejects staff without payments:bulk", async () => {
    const { POST } = await import("@/app/api/imports/payments/batch/[batchId]/commit/route");
    const response = await POST(
      new Request("http://test/commit", {
        method: "POST",
        body: JSON.stringify({ rowIds: ["row-1"] }),
      }),
      { params: Promise.resolve({ batchId: "batch-1" }) },
    );

    expect(response.status).toBe(403);
    expect(commitPaymentImportRows).not.toHaveBeenCalled();
  });

  it("commit posts for an admin with payments:bulk and returns the refreshed summary", async () => {
    hasStaffPermission.mockReturnValue(true);
    getAuthenticatedStaff.mockResolvedValue({
      id: "staff-1",
      appRole: "admin",
      email: "raj@vpps.co.in",
    });
    commitPaymentImportRows.mockResolvedValue({ posted: 1, failed: 0, results: [] });
    getPaymentImportBatchSummary.mockResolvedValue({
      batchId: "batch-1",
      sessionLabel: "TEST-2026-27",
      rows: [],
    });

    const { POST } = await import("@/app/api/imports/payments/batch/[batchId]/commit/route");
    const response = await POST(
      new Request("http://test/commit", {
        method: "POST",
        body: JSON.stringify({ rowIds: ["row-1"], acknowledgedRowIds: [] }),
      }),
      { params: Promise.resolve({ batchId: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(commitPaymentImportRows).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-1",
        rowIds: ["row-1"],
        receivedBy: "raj@vpps.co.in",
      }),
    );
  });
});
