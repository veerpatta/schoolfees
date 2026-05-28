import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasRolePermission, type StaffRole } from "@/lib/auth/roles";

const requireStaffPermission = vi.fn();
const createAdminClient = vi.fn();
const syncAfterStudentChange = vi.fn();
const recordActivity = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  syncAfterStudentChange,
}));

vi.mock("@/lib/activity/events", () => ({
  recordActivity,
}));

const STUDENT_ID = "00000000-0000-4000-8000-000000000111";

type RpcRow = {
  ok: boolean;
  message: string | null;
  new_waiver_amount: number | null;
  added_amount: number | null;
};

function buildAdminClient(rpcRow: RpcRow | { error: { message: string } }) {
  const rpc = vi.fn(() => {
    if ("error" in rpcRow) {
      return Promise.resolve({ data: null, error: rpcRow.error });
    }
    return Promise.resolve({ data: [rpcRow], error: null });
  });
  return { rpc, from: vi.fn() };
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

describe("waiveLateFeeAction — RBAC + RPC path (audit 1.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncAfterStudentChange.mockResolvedValue(undefined);
    recordActivity.mockResolvedValue(undefined);
    createAdminClient.mockReturnValue(
      buildAdminClient({
        ok: true,
        message: "Waiver applied.",
        new_waiver_amount: 500,
        added_amount: 500,
      }),
    );
  });

  it("admin can waive: invokes the waive_late_fee RPC with the studentId/amount/remarks and triggers sync", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("success");
    expect(result.newWaiverAmount).toBe(500);

    const adminClient = createAdminClient.mock.results[0]?.value;
    expect(adminClient.rpc).toHaveBeenCalledWith("waive_late_fee", {
      p_student_id: STUDENT_ID,
      p_amount: 500,
      p_remarks: "Family emergency, principal approval.",
      p_session_label: null,
      p_client_request_id: null,
    });

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
    const adminClient = createAdminClient.mock.results[0]?.value;
    expect(adminClient.rpc).toHaveBeenCalledTimes(1);
    expect(adminClient.rpc.mock.calls[0][0]).toBe("waive_late_fee");
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
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(syncAfterStudentChange).not.toHaveBeenCalled();
      expect(hasRolePermission(role, "payments:waive_late_fee")).toBe(false);
    },
  );

  it("rejects when reason is shorter than 4 characters (input guard runs before any RPC call)", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ reason: "no" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/at least 4 characters/i);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("surfaces RPC validation rejections (e.g. amount exceeds pending late fee)", async () => {
    setStaff("accountant");
    createAdminClient.mockReturnValue(
      buildAdminClient({
        ok: false,
        message: "Waiver cannot exceed the current pending late fee (1000).",
        new_waiver_amount: 0,
        added_amount: 0,
      }),
    );

    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await import("@/app/protected/payments/waive-late-fee-actions");

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "999999" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot exceed/i);
    expect(syncAfterStudentChange).not.toHaveBeenCalled();
  });

  it("surfaces RPC rejection when there is no pending late fee", async () => {
    setStaff("accountant");
    createAdminClient.mockReturnValue(
      buildAdminClient({
        ok: false,
        message: "This student has no pending late fee to waive.",
        new_waiver_amount: null,
        added_amount: null,
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
    expect(syncAfterStudentChange).not.toHaveBeenCalled();
  });

  it("returns the additive new_waiver_amount the RPC computed under the lock", async () => {
    setStaff("accountant");
    createAdminClient.mockReturnValue(
      buildAdminClient({
        ok: true,
        message: "Waiver applied.",
        new_waiver_amount: 700,
        added_amount: 400,
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
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          waivedAmount: 400,
          newWaiverTotal: 700,
        }),
      }),
    );
  });
});
