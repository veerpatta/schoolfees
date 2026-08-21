import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A form that stops rendering the fee inputs must not wipe them.
 *
 * ABSENT and EMPTY are different answers. A text input that is on screen always
 * posts — empty string included — so "empty" means the user cleared the field.
 * "Absent" means the form never offered it, and the only safe reading is "leave
 * what is on the record".
 *
 * This is the guard that has to exist BEFORE fee editing moves entirely into
 * StudentFeePlanSheet. Without it, the first save from the slimmed form silently
 * zeroes every override on the student — and payments have already been taken
 * against those figures.
 */
const SAVED = {
  id: "student-1",
  admissionNo: "TEST-001",
  fullName: "TEST Student",
  studentTypeOverride: "existing",
  tuitionOverride: 21000,
  transportOverride: 14000,
  discountAmount: 3000,
  otherAdjustmentHead: "Lab fee",
  otherAdjustmentAmount: 750,
  overrideReason: "Approved by principal",
  overrideNotes: "Sibling concession",
  conventionalDiscountPolicyIds: [],
  conventionalDiscountReason: null,
  conventionalDiscountNotes: null,
  conventionalDiscountFamilyGroupLabel: null,
  conventionalDiscountManualOverrideReason: null,
};

const getStudentDetail = vi.fn(async () => SAVED);
const updateStudent = vi.fn(async () => ({ id: "student-1" }));
const getStudentFormOptions = vi.fn(async () => ({
  classOptions: [{ id: "class-5", label: "Class 5", sessionLabel: "2026-27" }],
  routeOptions: [],
  resolvedSessionLabel: "2026-27",
}));

vi.mock("@/modules/students/data/queries", () => ({
  getStudentDetail: (...args: unknown[]) => getStudentDetail(...(args as [])),
  getStudentFormOptions: (...args: unknown[]) => getStudentFormOptions(...(args as [])),
  updateStudent: (...args: unknown[]) => updateStudent(...(args as [])),
  createStudent: vi.fn(),
  archiveStudent: vi.fn(),
  hardDeleteStudent: vi.fn(),
  bulkUpdateStudentFields: vi.fn(),
  getStudentDeletionSafety: vi.fn(),
}));

vi.mock("@/platform/supabase/session", () => ({
  requireAnyStaffPermission: vi.fn(async () => ({ id: "staff-1", appRole: "admin" })),
  requireStaffPermission: vi.fn(async () => ({ id: "staff-1", appRole: "admin" })),
  // Admin: every permission granted, so the legacy low-privilege restore path
  // does NOT run. The absent-field restore must work on its own.
  hasStaffPermission: vi.fn(() => true),
}));

vi.mock("@/platform/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/modules/activity/data/events", () => ({ recordActivity: vi.fn() }));
vi.mock("@/modules/fees/data/conventional-discounts", () => ({
  applyThirdChildPolicyForStudentFamilies: vi.fn(),
}));

function baseForm() {
  const form = new FormData();

  form.set("fullName", "TEST Student");
  form.set("classId", "class-5");
  form.set("admissionNo", "TEST-001");
  form.set("status", "active");
  form.set("sessionLabel", "2026-27");

  return form;
}

async function callUpdate(form: FormData) {
  const { updateStudentAction } = await import("@/app/protected/students/actions");

  return updateStudentAction(
    "student-1",
    { status: "idle", message: null, fieldErrors: {}, studentId: null },
    form,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getStudentDetail.mockResolvedValue(SAVED);
});

describe("updateStudentAction: absent fee fields are restored, not cleared", () => {
  it("keeps every override when the form does not render the fee inputs", async () => {
    const form = baseForm();

    await callUpdate(form);

    // The action mutates the FormData in place before validating it, so the
    // restored values are observable without depending on the DB layer.
    expect(form.get("tuitionOverride")).toBe("21000");
    expect(form.get("transportOverride")).toBe("14000");
    expect(form.get("discountAmount")).toBe("3000");
    expect(form.get("otherAdjustmentHead")).toBe("Lab fee");
    expect(form.get("otherAdjustmentAmount")).toBe("750");
    expect(form.get("feeProfileReason")).toBe("Approved by principal");
    expect(form.get("feeProfileNotes")).toBe("Sibling concession");
  });

  it("still lets a rendered-but-empty field clear the override", async () => {
    // The distinction that matters: present-and-empty is a deliberate clear.
    const form = baseForm();
    form.set("tuitionOverride", "");
    form.set("transportOverride", "");
    form.set("discountAmount", "0");
    form.set("otherAdjustmentHead", "");
    form.set("otherAdjustmentAmount", "");
    form.set("feeProfileReason", "");
    form.set("feeProfileNotes", "");

    await callUpdate(form);

    expect(form.get("tuitionOverride")).toBe("");
    expect(form.get("transportOverride")).toBe("");
    expect(form.get("discountAmount")).toBe("0");
    expect(form.get("otherAdjustmentHead")).toBe("");
  });

  it("restores only the fields that are missing, leaving submitted ones alone", async () => {
    const form = baseForm();
    form.set("tuitionOverride", "9999");

    await callUpdate(form);

    expect(form.get("tuitionOverride")).toBe("9999");
    expect(form.get("transportOverride")).toBe("14000");
  });

  it("does not read the student record when the form posts every fee field", async () => {
    // An admin editing the full form should not pay for an extra round trip.
    const form = baseForm();
    for (const field of [
      "tuitionOverride",
      "transportOverride",
      "discountAmount",
      "otherAdjustmentHead",
      "otherAdjustmentAmount",
      "feeProfileReason",
      "feeProfileNotes",
    ]) {
      form.set(field, "");
    }

    await callUpdate(form);

    expect(getStudentDetail).not.toHaveBeenCalled();
  });
});
