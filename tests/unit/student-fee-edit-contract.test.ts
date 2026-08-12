import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two surfaces write the same student fee-override columns: this form and
 * StudentFeePlanSheet. The sheet was always the stricter — `fees:write`, a
 * mandatory reason, and it unwinds the conventional discount that Patch C
 * backfilled into `discount_amount`. The form asked for none of it, so the same
 * money moved under a weaker contract depending on which button was clicked.
 *
 * The form now holds the same guards and refuses the one case only the sheet
 * handles correctly, rather than carrying a second copy of that logic — a
 * second copy is how the two drifted apart to begin with.
 */
const SAVED = {
  id: "student-1",
  admissionNo: "TEST-001",
  fullName: "TEST Student",
  classId: "class-5",
  status: "active",
  studentTypeOverride: "existing",
  tuitionOverride: null as number | null,
  transportOverride: null as number | null,
  discountAmount: 0,
  otherAdjustmentHead: null as string | null,
  otherAdjustmentAmount: null as number | null,
  overrideReason: null as string | null,
  overrideNotes: null as string | null,
  conventionalDiscountPolicyIds: [] as string[],
  conventionalDiscountReason: null,
  conventionalDiscountNotes: null,
  conventionalDiscountFamilyGroupLabel: null,
  conventionalDiscountManualOverrideReason: null,
};

const getStudentDetail = vi.fn(async () => SAVED);
const updateStudent = vi.fn(async () => "student-1");
const hasStaffPermission =
  vi.fn<(staff: unknown, permission: unknown) => boolean>(() => true);

vi.mock("@/lib/students/data", () => ({
  getStudentDetail: (...a: unknown[]) => getStudentDetail(...(a as [])),
  updateStudent: (...a: unknown[]) => updateStudent(...(a as [])),
  getStudentFormOptions: vi.fn(async () => ({
    classOptions: [{ id: "class-5", label: "Class 5", sessionLabel: "2026-27" }],
    routeOptions: [],
    resolvedSessionLabel: "2026-27",
  })),
  createStudent: vi.fn(),
  archiveStudent: vi.fn(),
  hardDeleteStudent: vi.fn(),
  bulkUpdateStudentFields: vi.fn(),
  getStudentDeletionSafety: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({
  requireAnyStaffPermission: vi.fn(async () => ({ id: "staff-1", appRole: "admin" })),
  requireStaffPermission: vi.fn(async () => ({ id: "staff-1", appRole: "admin" })),
  hasStaffPermission: (staff: unknown, permission: unknown) =>
    hasStaffPermission(staff, permission),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/activity/events", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/fees/conventional-discounts", () => ({
  applyThirdChildPolicyForStudentFamilies: vi.fn(async () => []),
}));

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();

  data.set("fullName", "TEST Student");
  data.set("classId", "class-5");
  data.set("admissionNo", "TEST-001");
  data.set("status", "active");
  data.set("studentTypeOverride", "existing");
  data.set("sessionLabel", "2026-27");
  // Present-and-empty across the board = "no fee change".
  for (const field of [
    "tuitionOverride",
    "transportOverride",
    "otherAdjustmentHead",
    "otherAdjustmentAmount",
    "feeProfileReason",
    "feeProfileNotes",
  ]) {
    data.set(field, "");
  }
  data.set("discountAmount", "0");

  for (const [key, value] of Object.entries(overrides)) {
    data.set(key, value);
  }

  return data;
}

async function callUpdate(data: FormData) {
  const { updateStudentAction } = await import("@/app/protected/students/actions");

  return updateStudentAction(
    "student-1",
    { status: "idle", message: null, fieldErrors: {}, studentId: null },
    data,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getStudentDetail.mockResolvedValue(SAVED);
  hasStaffPermission.mockReturnValue(true);
});

describe("changing a fee exception on the edit form", () => {
  it("needs fees:write, not just students:write", () => {
    // Only admin holds either today, but the two are separate permissions and
    // the roles get rebalanced. The contract should not depend on that.
    hasStaffPermission.mockImplementation((_staff: unknown, permission: unknown) =>
      permission !== "fees:write",
    );

    return callUpdate(form({ tuitionOverride: "21000", feeProfileReason: "Approved" })).then(
      (result) => {
        expect(result.status).toBe("error");
        expect(result.message).toContain("fee-edit permission");
        expect(updateStudent).not.toHaveBeenCalled();
      },
    );
  });

  it("needs a reason of at least 4 characters", async () => {
    const result = await callUpdate(form({ tuitionOverride: "21000", feeProfileReason: "ok" }));

    expect(result.status).toBe("error");
    expect(result.message).toContain("at least 4 characters");
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("refuses a tuition override on a student carrying a policy discount", async () => {
    // Only the fee-plan sheet unwinds the backfilled conventional discount from
    // discount_amount. Doing it here would double-subtract.
    getStudentDetail.mockResolvedValue({
      ...SAVED,
      conventionalDiscountPolicyIds: ["policy-rte"],
    });

    const result = await callUpdate(
      form({ tuitionOverride: "6000", feeProfileReason: "Third child policy" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("Edit custom fees");
    expect(updateStudent).not.toHaveBeenCalled();
  });

  // The two below assert the guard LET THE WRITE THROUGH. They deliberately do
  // not assert the action's final status: past this point it runs dues sync,
  // revalidation and activity logging, none of which is simulated here, so a
  // status assertion would be testing the mocks rather than the contract.

  it("allows the change when the contract is met", async () => {
    await callUpdate(
      form({ tuitionOverride: "21000", feeProfileReason: "Approved by principal" }),
    );

    expect(updateStudent).toHaveBeenCalled();
  });

  it("leaves non-fee edits alone — no reason required to fix a phone number", async () => {
    await callUpdate(form({ fatherPhone: "9876543210" }));

    expect(updateStudent).toHaveBeenCalled();
  });
});
