import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasRolePermission, type StaffRole } from "@/platform/auth/roles";

const requireStaffPermission = vi.fn();
const createClient = vi.fn();
const upsertStudentFeeOverride = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();
const drainFinancialViewRefresh = vi.fn();
const publishOfficeSyncEvent = vi.fn();
const recordActivity = vi.fn();
const getStudentConventionalDiscountAssignments = vi.fn();
const saveStudentConventionalDiscountAssignments = vi.fn();

const afterCallbacks: Array<() => unknown> = [];

async function flushAfter() {
  while (afterCallbacks.length > 0) {
    await afterCallbacks.shift()!();
  }
}

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
  },
}));

vi.mock("@/platform/supabase/session", () => ({ requireStaffPermission }));
vi.mock("@/platform/supabase/server", () => ({ createClient }));
vi.mock("@/modules/fees/domain/queries", () => ({ upsertStudentFeeOverride }));
vi.mock("@/modules/fees/data/conventional-discounts", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/fees/domain/conventional-discount-rules")
  >("@/modules/fees/domain/conventional-discount-rules");
  return {
    applyConventionalDiscountsToTuition: actual.applyConventionalDiscountsToTuition,
    getStudentConventionalDiscountAssignments,
    saveStudentConventionalDiscountAssignments,
  };
});
vi.mock("@/modules/system-sync/domain/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
}));
vi.mock("@/modules/system-sync/data/financial-view-refresh", () => ({
  drainFinancialViewRefresh,
}));
vi.mock("@/modules/system-sync/data/office-sync-events", () => ({ publishOfficeSyncEvent }));
vi.mock("@/modules/activity/data/events", () => ({ recordActivity }));

const STUDENT_ID = "00000000-0000-4000-8000-000000000222";
const SESSION_LABEL = "TEST-2026-27";

const EXISTING_OVERRIDE = {
  custom_books_fee_amount: null,
  custom_admission_activity_misc_fee_amount: null,
  custom_late_fee_flat_amount: null,
  late_fee_waiver_amount: 750,
  discount_amount: 0,
  student_type_override: "new" as const,
  transport_applies_override: null,
  notes: "Existing note",
};

function buildSupabaseClient(overrideRow: Record<string, unknown> | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: overrideRow, error: null })),
          })),
        })),
      })),
    })),
  };
}

function setStaff(role: StaffRole) {
  if (hasRolePermission(role, "fees:write")) {
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

function makeFormData(
  overrides: Record<string, string> = {},
  heads: Array<{ label: string; amount: string }> = [],
) {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  formData.set("sessionLabel", SESSION_LABEL);
  formData.set("reason", "Principal-approved concession.");
  formData.set("tuitionMode", "default");
  formData.set("transportMode", "default");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  for (const head of heads) {
    formData.append("headLabel", head.label);
    formData.append("headAmount", head.amount);
  }
  return formData;
}

async function loadAction() {
  const { saveStudentFeePlanAction } = await import(
    "@/app/protected/students/fee-plan-actions"
  );
  const { INITIAL_STUDENT_FEE_PLAN_ACTION_STATE } = await import(
    "@/app/protected/students/fee-plan-action-state"
  );
  return { saveStudentFeePlanAction, INITIAL_STUDENT_FEE_PLAN_ACTION_STATE };
}

async function run(formData: FormData) {
  const { saveStudentFeePlanAction, INITIAL_STUDENT_FEE_PLAN_ACTION_STATE } =
    await loadAction();
  return saveStudentFeePlanAction(INITIAL_STUDENT_FEE_PLAN_ACTION_STATE, formData);
}

describe("saveStudentFeePlanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    createClient.mockResolvedValue(buildSupabaseClient(EXISTING_OVERRIDE));
    upsertStudentFeeOverride.mockResolvedValue("override-1");
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 1,
      duesNeedAttentionCount: 0,
    });
    drainFinancialViewRefresh.mockResolvedValue(undefined);
    publishOfficeSyncEvent.mockResolvedValue(undefined);
    recordActivity.mockResolvedValue(undefined);
    getStudentConventionalDiscountAssignments.mockResolvedValue([]);
    saveStudentConventionalDiscountAssignments.mockResolvedValue(undefined);
  });

  describe("RBAC", () => {
    it("admin can save", async () => {
      setStaff("admin");
      const result = await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      expect(result.status).toBe("success");
      expect(upsertStudentFeeOverride).toHaveBeenCalledTimes(1);
    });

    it.each(["accountant", "teacher", "fee_collector", "view_only"] as const)(
      "%s cannot save — rejected before any write",
      async (role) => {
        setStaff(role);
        const result = await run(makeFormData());

        expect(result.status).toBe("error");
        expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
        expect(prepareDuesForStudentsAutomatically).not.toHaveBeenCalled();
        expect(hasRolePermission(role, "fees:write")).toBe(false);
      },
    );
  });

  describe("validation", () => {
    beforeEach(() => setStaff("admin"));

    it("requires a reason of at least 4 characters, before touching the database", async () => {
      const result = await run(makeFormData({ reason: "no" }));

      expect(result.status).toBe("error");
      expect(result.message).toMatch(/at least 4 characters/i);
      expect(createClient).not.toHaveBeenCalled();
    });

    it("rejects a fee head with a zero or negative amount", async () => {
      const result = await run(makeFormData({}, [{ label: "Uniform adj.", amount: "0" }]));

      expect(result.status).toBe("error");
      expect(result.message).toMatch(/whole amount above/i);
      expect(upsertStudentFeeOverride).not.toHaveBeenCalled();
    });

    it("rejects a fee head with no name", async () => {
      const result = await run(makeFormData({}, [{ label: "", amount: "800" }]));

      expect(result.status).toBe("error");
      expect(result.message).toMatch(/give every extra fee head a name/i);
    });

    it("ignores a wholly blank row the admin added and left alone", async () => {
      const result = await run(
        makeFormData({}, [
          { label: "Lab fee", amount: "1200" },
          { label: "", amount: "" },
        ]),
      );

      expect(result.status).toBe("success");
      expect(upsertStudentFeeOverride.mock.calls[0][0].customFeeHeadAmounts).toEqual({
        lab_fee: 1200,
      });
    });

    it("caps the number of extra heads", async () => {
      const heads = Array.from({ length: 9 }, (_, index) => ({
        label: `Head ${index}`,
        amount: "100",
      }));
      const result = await run(makeFormData({}, heads));

      expect(result.status).toBe("error");
      expect(result.message).toMatch(/at most 8/i);
    });
  });

  describe("named head storage", () => {
    beforeEach(() => setStaff("admin"));

    it("slugifies labels and stores the display label alongside the amount", async () => {
      await run(
        makeFormData({}, [
          { label: "Uniform adj.", amount: "800" },
          { label: "Lab fee", amount: "1200" },
        ]),
      );

      const payload = upsertStudentFeeOverride.mock.calls[0][0];
      expect(payload.customFeeHeadAmounts).toEqual({ uniform_adj: 800, lab_fee: 1200 });
      expect(payload.customOtherFeeHeadLabels).toEqual({
        uniform_adj: "Uniform adj.",
        lab_fee: "Lab fee",
      });
      expect(payload.allowUncatalogedHeads).toBe(true);
    });

    it("keeps colliding slugs distinct rather than overwriting", async () => {
      await run(
        makeFormData({}, [
          { label: "Lab fee", amount: "1200" },
          { label: "Lab Fee", amount: "300" },
        ]),
      );

      const payload = upsertStudentFeeOverride.mock.calls[0][0];
      expect(payload.customFeeHeadAmounts).toEqual({ lab_fee: 1200, lab_fee_2: 300 });
      expect(payload.customOtherFeeHeadLabels).toEqual({
        lab_fee: "Lab fee",
        lab_fee_2: "Lab Fee",
      });
    });

    it("clears the scalar other_adjustment columns so the jsonb is the live source", async () => {
      await run(makeFormData({}, [{ label: "Lab fee", amount: "1200" }]));

      const payload = upsertStudentFeeOverride.mock.calls[0][0];
      expect(payload.otherAdjustmentAmount).toBeNull();
      expect(payload.otherAdjustmentHead).toBeNull();
    });
  });

  describe("preserving fields this editor does not own", () => {
    beforeEach(() => setStaff("admin"));

    it("carries late_fee_waiver_amount through untouched", async () => {
      await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      const payload = upsertStudentFeeOverride.mock.calls[0][0];
      expect(payload.lateFeeWaiverAmount).toBe(750);
      expect(payload.studentTypeOverride).toBe("new");
      expect(payload.notes).toBe("Existing note");
    });

    it("defaults cleanly when the student has no override row yet", async () => {
      createClient.mockResolvedValue(buildSupabaseClient(null));
      await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      const payload = upsertStudentFeeOverride.mock.calls[0][0];
      expect(payload.lateFeeWaiverAmount).toBe(0);
      expect(payload.studentTypeOverride).toBeNull();
    });
  });

  describe("tuition mode", () => {
    beforeEach(() => setStaff("admin"));

    it("writes null when switched back to the class default", async () => {
      await run(makeFormData({ tuitionMode: "default" }));

      expect(upsertStudentFeeOverride.mock.calls[0][0].customTuitionFeeAmount).toBeNull();
    });

    it("accepts a custom tuition of zero", async () => {
      await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "0" }));

      expect(upsertStudentFeeOverride.mock.calls[0][0].customTuitionFeeAmount).toBe(0);
    });

    it("rejects a fractional custom tuition", async () => {
      const result = await run(
        makeFormData({ tuitionMode: "custom", tuitionAmount: "12000.5" }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toMatch(/whole amount/i);
    });
  });

  describe("custom tuition wins outright over conventional discounts", () => {
    beforeEach(() => {
      setStaff("admin");
      getStudentConventionalDiscountAssignments.mockResolvedValue([
        {
          isActive: true,
          beforeTuitionAmount: 16000,
          policy: {
            displayName: "Staff Child",
            calculationType: "tuition_percentage",
            percentage: 50,
            fixedTuitionAmount: null,
            isActive: true,
          },
        },
      ]);
      createClient.mockResolvedValue(
        buildSupabaseClient({ ...EXISTING_OVERRIDE, discount_amount: 8000 }),
      );
    });

    it("clears the assignments and nets the backfilled discount out of discount_amount", async () => {
      const result = await run(
        makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }),
      );

      expect(result.status).toBe("success");
      expect(result.message).toMatch(/Staff Child removed/i);

      expect(saveStudentConventionalDiscountAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: STUDENT_ID, policyIds: [] }),
      );
      // 8000 backfilled conventional discount removed, leaving no owner extra.
      expect(upsertStudentFeeOverride.mock.calls[0][0].discountAmount).toBe(0);
    });

    it("leaves conventional policies alone when no custom tuition is set", async () => {
      await run(makeFormData({ tuitionMode: "default" }));

      expect(saveStudentConventionalDiscountAssignments).not.toHaveBeenCalled();
      expect(upsertStudentFeeOverride.mock.calls[0][0].discountAmount).toBe(8000);
    });
  });

  describe("sync and deferral", () => {
    beforeEach(() => setStaff("admin"));

    it("awaits the dues rebuild WITH a sessionLabel so the sync takes its fast branch", async () => {
      await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith(
        expect.objectContaining({
          studentIds: [STUDENT_ID],
          sessionLabel: SESSION_LABEL,
        }),
      );
    });

    it("defers the matview drain, office sync and activity log to after()", async () => {
      await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      expect(drainFinancialViewRefresh).not.toHaveBeenCalled();
      expect(publishOfficeSyncEvent).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();

      await flushAfter();

      expect(drainFinancialViewRefresh).toHaveBeenCalledTimes(1);
      expect(publishOfficeSyncEvent).toHaveBeenCalledTimes(1);
      expect(recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "student_edited",
          refId: STUDENT_ID,
          payload: expect.objectContaining({ action: "fee_plan_updated" }),
        }),
      );
    });

    it("surfaces a dues warning when the rebuild flags the student", async () => {
      prepareDuesForStudentsAutomatically.mockResolvedValue({
        readyForPaymentCount: 0,
        duesNeedAttentionCount: 1,
      });

      const result = await run(makeFormData({ tuitionMode: "custom", tuitionAmount: "12000" }));

      expect(result.status).toBe("success");
      expect(result.duesNeedAttention).toBe(true);
      expect(result.message).toMatch(/dues need attention/i);
    });
  });
});
