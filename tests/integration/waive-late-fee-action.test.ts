import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasRolePermission, type StaffRole } from "@/lib/auth/roles";

const requireStaffPermission = vi.fn();
const createAdminClient = vi.fn();
const upsertStudentFeeOverride = vi.fn();
const syncAfterStudentChange = vi.fn();
const recordActivity = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
}));

vi.mock("@/lib/fees/data", () => ({
  upsertStudentFeeOverride,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  syncAfterStudentChange,
}));

vi.mock("@/lib/activity/events", () => ({
  recordActivity,
}));

const STUDENT_ID = "00000000-0000-4000-8000-000000000111";

function buildAdminClient({
  studentRow = { id: STUDENT_ID } as Record<string, unknown> | null,
  financialRow = {
    outstanding_amount: 5000,
    late_fee_total: 1000,
    pending_late_fee_amount: 1000,
  } as Record<string, unknown> | null,
  overrideRow = null as Record<string, unknown> | null,
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "students") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: studentRow, error: null }),
            }),
          }),
        };
      }
      if (table === "v_workbook_student_financials") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: financialRow, error: null }),
            }),
          }),
        };
      }
      if (table === "student_fee_overrides") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: overrideRow, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function setStaff(role: StaffRole) {
  if (hasRolePermission(role, "payments:waive_late_fee")) {
    requireStaffPermission.mockResolvedValue({
      id: "staff-1",
      email: `${role}@example.com`,
      appRole: role,
    });
  } else {
    requireStaffPermission.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { code: "PERMISSION_DENIED" }),
    );
  }
}

function makeFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  formData.set("amount", "500");
  formData.set("reason", "Family emergency, principal approval.");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("waiveLateFeeAction — RBAC + write path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertStudentFeeOverride.mockResolvedValue(undefined);
    syncAfterStudentChange.mockResolvedValue(undefined);
    recordActivity.mockResolvedValue(undefined);
    createAdminClient.mockReturnValue(buildAdminClient());
  });

  it("admin can waive: writes student_fee_overrides.late_fee_waiver_amount with reason and triggers sync", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("success");
    expect(result.newWaiverAmount).toBe(500);
    expect(upsertStudentFeeOverride).toHaveBeenCalledTimes(1);
    const upsertArg = upsertStudentFeeOverride.mock.calls[0][0];
    expect(upsertArg.lateFeeWaiverAmount).toBe(500);
    expect(upsertArg.studentId).toBe(STUDENT_ID);
    expect(upsertArg.reason).toContain("Waive late fee 500");
    expect(upsertArg.reason).toContain("admin@example.com");
    expect(upsertArg.reason).toContain("Family emergency");
    expect(syncAfterStudentChange).toHaveBeenCalledWith(STUDENT_ID);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "staff-1",
        kind: "payment_posted",
        refId: STUDENT_ID,
        payload: expect.objectContaining({
          action: "late_fee_waiver",
          waivedAmount: 500,
          newWaiverTotal: 500,
        }),
      }),
    );
  });

  it("accountant can waive (same path as admin)", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("success");
    expect(upsertStudentFeeOverride).toHaveBeenCalledTimes(1);
    expect(upsertStudentFeeOverride.mock.calls[0][0].lateFeeWaiverAmount).toBe(500);
  });

  it.each(["teacher", "fee_collector", "view_only"] as const)(
    "%s cannot waive — requireStaffPermission rejects before any write",
    async (role) => {
      setStaff(role);
      const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
        await import("@/app/protected/payments/waive-late-fee-actions");

      const result = await waiveLateFeeAction(
        INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
        makeFormData(),
      );

      expect(result.status).toBe("error");
      expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
      expect(syncAfterStudentChange).not.toHaveBeenCalled();
      // The role itself is denied at the permission layer — that is the
      // truth we assert. The catch-all error string is incidental.
      expect(hasRolePermission(role, "payments:waive_late_fee")).toBe(false);
    },
  );

  it("rejects when reason is shorter than 4 characters", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ reason: "no" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/at least 4 characters/i);
    expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
  });

  it("rejects when waiver amount exceeds pending late fee", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "999999" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot exceed/i);
    expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
  });

  it("rejects when there is no pending late fee", async () => {
    setStaff("accountant");
    createAdminClient.mockReturnValue(
      buildAdminClient({
        financialRow: {
          outstanding_amount: 5000,
          late_fee_total: 0,
          pending_late_fee_amount: 0,
        },
      }),
    );
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/no pending late fee/i);
    expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
  });

  it("adds the new waiver on top of an existing override (additive)", async () => {
    setStaff("accountant");
    createAdminClient.mockReturnValue(
      buildAdminClient({
        overrideRow: {
          id: "override-1",
          discount_amount: 1500,
          reason: "Prior note: scholarship.",
          notes: null,
          custom_tuition_fee_amount: null,
          custom_transport_fee_amount: null,
          custom_books_fee_amount: null,
          custom_admission_activity_misc_fee_amount: null,
          custom_other_fee_heads: null,
          custom_late_fee_flat_amount: null,
          other_adjustment_head: null,
          other_adjustment_amount: null,
          late_fee_waiver_amount: 300,
          student_type_override: null,
          transport_applies_override: null,
        },
      }),
    );
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "400" }),
    );

    expect(result.status).toBe("success");
    expect(result.newWaiverAmount).toBe(700);
    const upsertArg = upsertStudentFeeOverride.mock.calls[0][0];
    expect(upsertArg.lateFeeWaiverAmount).toBe(700);
    // Existing discount preserved — we are not editing other fields.
    expect(upsertArg.discountAmount).toBe(1500);
    // Reason is appended, never replaced.
    expect(upsertArg.reason).toContain("Prior note: scholarship.");
    expect(upsertArg.reason).toContain("Waive late fee 400");
  });
});
