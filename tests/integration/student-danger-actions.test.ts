import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// These actions now drain the workbook matview refresh queue after the
// response. `after` throws outside a request scope, so run the callback
// inline — the assertions care that the action succeeded, not when the
// drain ran.
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    void callback();
  },
}));

const archiveStudent = vi.fn();
const hardDeleteStudent = vi.fn();
const getStudentDeletionSafety = vi.fn();
const getStudentDetail = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();
const revalidateFinanceSurfaces = vi.fn();
const publishOfficeSyncEvent = vi.fn();
const requireStaffPermission = vi.fn(async () => undefined);

vi.mock("@/platform/supabase/session", () => ({
  requireStaffPermission,
  requireAnyStaffPermission: vi.fn(async () => undefined),
  hasStaffPermission: vi.fn(async () => true),
}));

vi.mock("@/modules/students/data/queries", () => ({
  archiveStudent,
  hardDeleteStudent,
  getStudentDeletionSafety,
  getStudentDetail,
  bulkUpdateStudentFields: vi.fn(),
  createStudent: vi.fn(),
  getStudentFormOptions: vi.fn(),
  updateStudent: vi.fn(),
}));

vi.mock("@/modules/fees/data/conventional-discounts", () => ({
  applyThirdChildPolicyForStudentFamilies: vi.fn(async () => []),
}));

vi.mock("@/modules/system-sync/domain/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
}));

vi.mock("@/modules/system-sync/data/office-sync-events", () => ({
  publishOfficeSyncEvent,
}));

const IDLE = { status: "idle" as const, message: null, deleted: false };

function safety(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "student-1",
    admissionNo: "SVP-1024",
    fullName: "Wrong Entry",
    sessionLabel: "TEST-2026-27",
    hardDeleteAllowed: true,
    ...overrides,
  };
}

describe("student danger-zone actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStudentDetail.mockResolvedValue({ classSessionLabel: "TEST-2026-27" });
    getStudentDeletionSafety.mockResolvedValue(safety());
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 0,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
    });
  });

  it("deletes the record and reports it gone when the SR no matches", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "SVP-1024");

    const result = await hardDeleteStudentAction(IDLE, formData);

    expect(hardDeleteStudent).toHaveBeenCalledWith("student-1", { forceTestRecord: false });
    expect(result.status).toBe("success");
    expect(result.deleted).toBe(true);
  });

  // Staff read the SR no off a printed list; casing and stray spaces are noise.
  it("accepts an SR no typed with different case and padding", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "  svp-1024 ");

    const result = await hardDeleteStudentAction(IDLE, formData);

    expect(result.status).toBe("success");
    expect(hardDeleteStudent).toHaveBeenCalledTimes(1);
  });

  it("returns a mismatch message instead of throwing when the SR no is wrong", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "SVP-9999");

    const result = await hardDeleteStudentAction(IDLE, formData);

    expect(result.status).toBe("error");
    expect(result.deleted).toBe(false);
    expect(result.message).toContain("SVP-1024");
    expect(hardDeleteStudent).not.toHaveBeenCalled();
  });

  // The old action threw, which escaped to the page error boundary: staff saw a
  // blank error screen and lost what they had typed.
  it("surfaces a delete failure as action state rather than throwing", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    hardDeleteStudent.mockRejectedValueOnce(
      new Error("This student is still linked to other records"),
    );
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "SVP-1024");

    const result = await hardDeleteStudentAction(IDLE, formData);

    expect(result).toMatchObject({
      status: "error",
      deleted: false,
      message: "This student is still linked to other records",
    });
  });

  it("reports a missing student instead of throwing", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    getStudentDeletionSafety.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "SVP-1024");

    const result = await hardDeleteStudentAction(IDLE, formData);

    expect(result.status).toBe("error");
    expect(hardDeleteStudent).not.toHaveBeenCalled();
  });

  it("passes the test-record force flag through", async () => {
    const { hardDeleteStudentAction } = await import("@/app/protected/students/actions");
    const formData = new FormData();
    formData.set("studentId", "student-1");
    formData.set("confirmDelete", "SVP-1024");
    formData.set("forceTestRecord", "yes");

    await hardDeleteStudentAction(IDLE, formData);

    expect(hardDeleteStudent).toHaveBeenCalledWith("student-1", { forceTestRecord: true });
  });

  it("withdraws a student and returns success state", async () => {
    const { archiveStudentAction } = await import("@/app/protected/students/actions");
    const formData = new FormData();
    formData.set("studentId", "student-1");

    const result = await archiveStudentAction(IDLE, formData);

    expect(archiveStudent).toHaveBeenCalledWith("student-1");
    expect(result.status).toBe("success");
    expect(result.deleted).toBe(false);
  });

  it("surfaces a withdraw failure as action state rather than throwing", async () => {
    const { archiveStudentAction } = await import("@/app/protected/students/actions");
    archiveStudent.mockRejectedValueOnce(new Error("Unable to archive student: rls denied"));
    const formData = new FormData();
    formData.set("studentId", "student-1");

    const result = await archiveStudentAction(IDLE, formData);

    expect(result).toMatchObject({
      status: "error",
      message: "Unable to archive student: rls denied",
    });
  });

  it("reports a permission failure instead of blanking the page", async () => {
    const { archiveStudentAction } = await import("@/app/protected/students/actions");
    requireStaffPermission.mockRejectedValueOnce(
      new Error("You do not have permission to edit students."),
    );
    const formData = new FormData();
    formData.set("studentId", "student-1");

    const result = await archiveStudentAction(IDLE, formData);

    expect(result.status).toBe("error");
    expect(archiveStudent).not.toHaveBeenCalled();
  });
});
