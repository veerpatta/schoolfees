import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const createStudentImportBatch = vi.fn();
const getStudentImportBatchSummary = vi.fn();
const commitStudentImportBatch = vi.fn();
const getAuthenticatedStaff = vi.fn();
const hasStaffPermission = vi.fn();
const hasAnyStaffPermission = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/import/data", () => ({
  createStudentImportBatch,
  getStudentImportBatchSummary,
  commitStudentImportBatch,
}));

vi.mock("@/lib/supabase/session", () => ({
  getAuthenticatedStaff,
  hasStaffPermission,
  hasAnyStaffPermission,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

describe("student import api routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedStaff.mockResolvedValue({ appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
    hasAnyStaffPermission.mockReturnValue(true);
  });

  it("upload route returns batch summary payload", async () => {
    createStudentImportBatch.mockResolvedValue({
      batchId: "batch-1",
      autoValidated: true,
      targetSessionLabel: "2026-27",
    });
    getStudentImportBatchSummary.mockResolvedValue({
      batchId: "batch-1",
      mode: "add",
      targetSessionLabel: "2026-27",
      status: "validated",
      reviewSummary: {
        approvedRows: 1,
        pendingRows: 0,
        heldRows: 0,
        skippedRows: 0,
        unresolvedAnomalyRows: 0,
        readyToImportRows: 1,
        readyCreateRows: 1,
        readyUpdateRows: 0,
        correctionRows: 0,
        warningRows: 0,
        pendingSafeRows: 0,
      },
      problemRows: [],
      readyPreviewRows: [],
      warningSummary: [],
    });

    const { POST } = await import("@/app/api/imports/students/upload/route");
    const form = new FormData();
    form.set("mode", "add");
    form.set("sessionLabel", "2026-27");
    form.set("importFile", new File(["Student name,Class\nAsha,Class 1"], "students.csv"));

    const response = await POST(
      new Request("http://localhost/api/imports/students/upload", {
        method: "POST",
        body: form,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.batchId).toBe("batch-1");
    expect(getStudentImportBatchSummary).toHaveBeenCalledWith("batch-1");
    expect(createStudentImportBatch).toHaveBeenCalledWith(
      expect.any(File),
      "add",
      "2026-27",
    );
  });

  it("commit route commits approved rows and returns final summary", async () => {
    commitStudentImportBatch.mockResolvedValue({
      batchId: "batch-2",
      createdCount: 2,
      updatedCount: 1,
      importedCount: 3,
      failedCount: 0,
      skippedCount: 0,
      temporarySrGeneratedCount: 1,
      affectedStudentIds: ["student-1"],
      status: "completed",
    });
    getStudentImportBatchSummary.mockResolvedValue({
      batchId: "batch-2",
      mode: "add",
      targetSessionLabel: "2026-27",
      status: "completed",
      reviewSummary: {
        approvedRows: 3,
        pendingRows: 0,
        heldRows: 0,
        skippedRows: 0,
        unresolvedAnomalyRows: 0,
        readyToImportRows: 0,
        readyCreateRows: 0,
        readyUpdateRows: 0,
        correctionRows: 0,
        warningRows: 0,
        pendingSafeRows: 0,
      },
      problemRows: [],
      readyPreviewRows: [],
      warningSummary: [],
    });

    const { POST } = await import("@/app/api/imports/students/batch/[batchId]/commit/route");
    const response = await POST(
      new Request("http://localhost/api/imports/students/batch/batch-2/commit", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ batchId: "batch-2" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(commitStudentImportBatch).toHaveBeenCalledWith("batch-2");
    expect(payload.result.createdCount).toBe(2);
    expect(revalidatePath).toHaveBeenCalledWith("/protected/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/protected/ledger");
    expect(revalidatePath).toHaveBeenCalledWith("/protected/students/student-1");
  });
});
