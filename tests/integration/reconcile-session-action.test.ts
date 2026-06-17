import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const generateSessionLedgersAction = vi.fn();
const redirect = vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT:${href}`);
});
const requireStaffPermission = vi.fn();
const revalidateSessionFinance = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/fees/generator", () => ({
  generateSessionLedgersAction,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  revalidateSessionFinance,
}));

function buildFormData(sessionLabel: string) {
  const formData = new FormData();
  formData.set("sessionLabel", sessionLabel);
  return formData;
}

describe("reconcileSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ id: "staff-1", appRole: "admin" });
    generateSessionLedgersAction.mockResolvedValue({
      installmentsToInsert: 4,
      installmentsToUpdate: 2,
      lockedInstallments: 1,
      skippedStudents: [{ studentId: "student-1" }],
      errors: [],
    });
  });

  it("writes the reconcile log, runs the selected session, and redirects with the outcome", async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "log-1" },
          error: null,
        }),
      }),
    });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const from = vi.fn((table: string) => {
      if (table === "session_reconcile_log") {
        return { insert, update };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
    createClient.mockResolvedValue({ from });

    const { reconcileSessionAction } = await import(
      "@/app/protected/admin-tools/session-health/actions"
    );

    await expect(reconcileSessionAction(buildFormData("2026-27"))).rejects.toThrow(
      "NEXT_REDIRECT:/protected/admin-tools/session-health?reconciled=2026-27&prepared=4",
    );

    expect(requireStaffPermission).toHaveBeenCalledWith("fees:write");
    expect(insert).toHaveBeenCalledWith({
      session_label: "2026-27",
      run_by: "staff-1",
    });
    expect(generateSessionLedgersAction).toHaveBeenCalledWith({
      scopedSessionLabel: "2026-27",
      useAdminClient: true,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        prepared_count: 4,
        updated_count: 2,
        locked_count: 1,
        attention_count: 1,
      }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", "log-1");
    expect(revalidateSessionFinance).toHaveBeenCalledWith("2026-27");
    expect(redirect).toHaveBeenCalledWith(
      "/protected/admin-tools/session-health?reconciled=2026-27&prepared=4&session=2026-27",
    );
  });

  it("does not write a log row when fee write permission is denied", async () => {
    requireStaffPermission.mockRejectedValue(new Error("You do not have permission: fees:write"));

    const { reconcileSessionAction } = await import(
      "@/app/protected/admin-tools/session-health/actions"
    );

    await expect(reconcileSessionAction(buildFormData("2026-27"))).rejects.toThrow(
      "You do not have permission: fees:write",
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(generateSessionLedgersAction).not.toHaveBeenCalled();
  });
});
