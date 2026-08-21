import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasRolePermission, type StaffRole } from "@/platform/auth/roles";

const requireStaffPermission = vi.fn();
const createClient = vi.fn();
const recordActivity = vi.fn();
const revalidateAfterPaymentPosting = vi.fn();
const revalidateSessionFinance = vi.fn();
const drainFinancialViewRefresh = vi.fn();

/**
 * `after()` callbacks are collected rather than run inline so each test can
 * assert what the staffer waited for (nothing beyond the RPC) versus what was
 * deferred until after the response.
 */
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

vi.mock("@/platform/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/platform/supabase/server", () => ({
  createClient,
}));

vi.mock("@/modules/activity/data/events", () => ({
  recordActivity,
}));

vi.mock("@/modules/system-sync/domain/finance-revalidation", () => ({
  revalidateAfterPaymentPosting,
  revalidateSessionFinance,
}));

vi.mock("@/modules/system-sync/data/financial-view-refresh", () => ({
  drainFinancialViewRefresh,
}));

const STUDENT_ID = "00000000-0000-4000-8000-000000000111";
const CLIENT_REQUEST_ID = "11111111-2222-4333-8444-555555555555";
const SESSION_LABEL = "TEST-2026-27";

type RpcRow = {
  ok: boolean;
  message: string | null;
  new_waiver_amount: number | null;
  added_amount: number | null;
};

function buildSupabaseClient(rpcRow: RpcRow | { error: { message: string } }) {
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
  formData.set("sessionLabel", SESSION_LABEL);
  formData.set("clientRequestId", CLIENT_REQUEST_ID);
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

async function loadAction() {
  const { waiveLateFeeAction } = await import(
    "@/app/protected/payments/waive-late-fee-actions"
  );
  const { INITIAL_WAIVE_LATE_FEE_ACTION_STATE } = await import(
    "@/app/protected/payments/waive-late-fee-action-state"
  );
  return { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE };
}

describe("waiveLateFeeAction — RBAC + RPC path (audit 1.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    recordActivity.mockResolvedValue(undefined);
    drainFinancialViewRefresh.mockResolvedValue(undefined);
    createClient.mockResolvedValue(
      buildSupabaseClient({
        ok: true,
        message: "Waiver applied.",
        new_waiver_amount: 500,
        added_amount: 500,
      }),
    );
  });

  it("admin can waive: invokes the waive_late_fee RPC with the studentId/amount/remarks and threaded session + request id", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("success");
    expect(result.newWaiverAmount).toBe(500);

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith("waive_late_fee", {
      p_student_id: STUDENT_ID,
      p_amount: 500,
      p_remarks: "Family emergency, principal approval.",
      p_session_label: SESSION_LABEL,
      p_client_request_id: CLIENT_REQUEST_ID,
      // Null means "allocate oldest-first" — the sheet only sends an id when the
      // staff member aims the waiver at one installment.
      p_installment_id: null,
    });

    // A waiver moves late_fee_pending and total_pending, so the dashboard's
    // late-fee board has to be evicted. revalidateAfterPaymentPosting alone is
    // not enough: it busts PATHS and `student:{id}`, and a revalidatePath does
    // not evict the `session:{label}` unstable_cache entry the board reads.
    expect(revalidateSessionFinance).toHaveBeenCalledWith(SESSION_LABEL, [STUDENT_ID]);

    await flushAfter();
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

  it("revalidates only the payment-affected surfaces, never the whole finance tree", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    await waiveLateFeeAction(INITIAL_WAIVE_LATE_FEE_ACTION_STATE, makeFormData());

    expect(revalidateAfterPaymentPosting).toHaveBeenCalledWith([STUDENT_ID]);
  });

  it("defers the matview drain and activity log to after(), and drains before logging", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const order: string[] = [];
    drainFinancialViewRefresh.mockImplementation(async () => {
      order.push("drain");
    });
    recordActivity.mockImplementation(async () => {
      order.push("activity");
    });

    await waiveLateFeeAction(INITIAL_WAIVE_LATE_FEE_ACTION_STATE, makeFormData());

    // Nothing expensive ran on the click-to-toast path.
    expect(drainFinancialViewRefresh).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await flushAfter();
    expect(order).toEqual(["drain", "activity"]);
  });

  it("drops a non-UUID clientRequestId rather than letting PostgREST reject the uuid parameter", async () => {
    setStaff("admin");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ clientRequestId: "not-a-uuid" }),
    );

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      "waive_late_fee",
      expect.objectContaining({ p_client_request_id: null }),
    );
  });

  it("accountant can waive (same path as admin)", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("success");
    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0][0]).toBe("waive_late_fee");
  });

  it.each(["teacher", "fee_collector", "view_only"] as const)(
    "%s cannot waive — requireStaffPermission rejects before any write",
    async (role) => {
      setStaff(role);
      const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
        await loadAction();

      const result = await waiveLateFeeAction(
        INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
        makeFormData(),
      );

      expect(result.status).toBe("error");
      expect(createClient).not.toHaveBeenCalled();
      expect(revalidateAfterPaymentPosting).not.toHaveBeenCalled();
      expect(afterCallbacks).toHaveLength(0);
      expect(hasRolePermission(role, "payments:waive_late_fee")).toBe(false);
    },
  );

  it("rejects when reason is shorter than 4 characters (input guard runs before any RPC call)", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ reason: "no" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/at least 4 characters/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  // parseAmount used to apply Math.round before the Number.isInteger check ran,
  // which made that check unreachable — "1500.75" reached the RPC as 1501 and a
  // family was handed a receipt for a rupee nobody typed. Every money column is
  // `integer`, so a fractional rupee is refused, not absorbed. The browser form
  // is step={1}, but a Server Action is a POST endpoint and the guard is what
  // actually holds.
  it("refuses a fractional rupee instead of rounding it (input guard runs before any RPC call)", async () => {
    setStaff("accountant");
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "1500.75" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/positive late-fee amount/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("still accepts a whole rupee amount", async () => {
    setStaff("accountant");
    createClient.mockResolvedValue(
      buildSupabaseClient({
        ok: true,
        message: null,
        new_waiver_amount: 1500,
        added_amount: 1500,
      }),
    );
    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "1500" }),
    );

    expect(result.status).toBe("success");
  });

  it("surfaces RPC validation rejections (e.g. amount exceeds pending late fee)", async () => {
    setStaff("accountant");
    createClient.mockResolvedValue(
      buildSupabaseClient({
        ok: false,
        message: "Waiver cannot exceed the current pending late fee (1000).",
        new_waiver_amount: 0,
        added_amount: 0,
      }),
    );

    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "999999" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot exceed/i);
    expect(revalidateAfterPaymentPosting).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("surfaces RPC rejection when there is no pending late fee", async () => {
    setStaff("accountant");
    createClient.mockResolvedValue(
      buildSupabaseClient({
        ok: false,
        message: "This student has no pending late fee to waive.",
        new_waiver_amount: null,
        added_amount: null,
      }),
    );

    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/no pending late fee/i);
    expect(revalidateAfterPaymentPosting).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("returns the additive new_waiver_amount the RPC computed under the lock", async () => {
    setStaff("accountant");
    createClient.mockResolvedValue(
      buildSupabaseClient({
        ok: true,
        message: "Waiver applied.",
        new_waiver_amount: 700,
        added_amount: 400,
      }),
    );

    const { waiveLateFeeAction, INITIAL_WAIVE_LATE_FEE_ACTION_STATE } =
      await loadAction();

    const result = await waiveLateFeeAction(
      INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
      makeFormData({ amount: "400" }),
    );

    expect(result.status).toBe("success");
    expect(result.newWaiverAmount).toBe(700);

    await flushAfter();
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
