import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createStudent = vi.fn();
const updateStudent = vi.fn();
const getStudentDetail = vi.fn();
const getStudentFormOptions = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();
const revalidateFinanceSurfaces = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission: vi.fn(async () => undefined),
}));

vi.mock("@/lib/students/data", () => ({
  createStudent,
  archiveStudent: vi.fn(),
  hardDeleteStudent: vi.fn(),
  getStudentDeletionSafety: vi.fn(),
  getStudentDetail,
  getStudentFormOptions,
  updateStudent,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
}));

function baseFormData() {
  const formData = new FormData();
  formData.set("fullName", "Test Student Smoke");
  formData.set("classId", "class-1");
  formData.set("admissionNo", "");
  formData.set("dateOfBirth", "");
  formData.set("fatherName", "Test Father");
  formData.set("motherName", "");
  formData.set("fatherPhone", "9999999999");
  formData.set("motherPhone", "");
  formData.set("address", "");
  formData.set("transportRouteId", "");
  formData.set("status", "active");
  formData.set("studentTypeOverride", "existing");
  formData.set("tuitionOverride", "");
  formData.set("transportOverride", "");
  formData.set("discountAmount", "0");
  formData.set("lateFeeWaiverAmount", "0");
  formData.set("otherAdjustmentHead", "");
  formData.set("otherAdjustmentAmount", "");
  formData.set("feeProfileReason", "");
  formData.set("feeProfileNotes", "");
  formData.set("conventionalDiscountReason", "");
  formData.set("conventionalDiscountNotes", "");
  formData.set("conventionalDiscountFamilyGroup", "");
  formData.set("conventionalDiscountManualOverrideReason", "");
  formData.set("notes", "");
  return formData;
}

describe("student server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStudentFormOptions.mockResolvedValue({
      classOptions: [{ id: "class-1", label: "Class 1", sessionLabel: "TEST-2026-27" }],
      routeOptions: [],
      resolvedSessionLabel: "TEST-2026-27",
    });
    createStudent.mockResolvedValue("student-1");
    updateStudent.mockResolvedValue("student-1");
    getStudentDetail.mockResolvedValue({
      classId: "class-1",
      status: "active",
      transportRouteId: null,
      studentTypeOverride: "existing",
      tuitionOverride: null,
      transportOverride: null,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      conventionalDiscountPolicyIds: [],
    });
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 1,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
    });
  });

  it("keeps submitted values when create validation fails", async () => {
    const { createStudentAction } = await import("@/app/protected/students/actions");
    const formData = baseFormData();
    formData.set("fullName", "");
    formData.set("fatherPhone", "bad");

    const result = await createStudentAction(
      { status: "idle", message: null, fieldErrors: {}, studentId: null },
      formData,
    );

    expect(result.status).toBe("error");
    expect(result.submittedValues?.fatherPhone).toBe("bad");
    expect(result.submittedValues?.classId).toBe("class-1");
  });

  it("returns a recovery message when dues prep fails after student creation", async () => {
    const { createStudentAction } = await import("@/app/protected/students/actions");
    prepareDuesForStudentsAutomatically.mockRejectedValue(new Error("ledger unavailable"));

    const result = await createStudentAction(
      { status: "idle", message: null, fieldErrors: {}, studentId: null },
      baseFormData(),
    );

    expect(createStudent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "error",
      studentId: "student-1",
      message:
        "Student record was saved, but dues could not be prepared automatically. Open Admin Tools \u2192 Session Health if this student does not appear in Payment Desk.",
    });
  });
});
