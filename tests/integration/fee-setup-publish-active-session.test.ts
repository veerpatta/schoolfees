import { beforeEach, describe, expect, it, vi } from "vitest";

const requireStaffPermission = vi.fn();
const applyWorkbookFeeSetupBatch = vi.fn();
const createWorkbookFeeSetupPreview = vi.fn();
const upsertConventionalDiscountPolicies = vi.fn();
const getActiveSessionLabel = vi.fn();
const setActiveSessionLabel = vi.fn();
const revalidatePath = vi.fn();
const revalidateCoreFinancePaths = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/fees/workbook-setup-change", () => ({
  applyWorkbookFeeSetupBatch,
  createWorkbookFeeSetupPreview,
}));

vi.mock("@/lib/fees/conventional-discounts", () => ({
  upsertConventionalDiscountPolicies,
}));

vi.mock("@/lib/session/active", () => ({
  getActiveSessionLabel,
}));

vi.mock("@/lib/session/set-active", () => ({
  setActiveSessionLabel,
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  revalidateCoreFinancePaths,
}));

const previousState = {
  status: "idle" as const,
  message: "",
  changeBatchId: null,
  preview: null,
};

function workbookApplyForm(sessionLabel: string) {
  const formData = new FormData();
  formData.set("_intent", "apply");
  formData.set("changeBatchId", "00000000-0000-4000-8000-000000000001");
  formData.set("academicSessionLabel", sessionLabel);
  formData.set("installmentDueDate", "2026-04-20");
  formData.set("lateFeeFlatAmount", "1000");
  formData.set("newStudentAcademicFeeAmount", "1100");
  formData.set("oldStudentAcademicFeeAmount", "500");
  return formData;
}

describe("Fee Setup publish active-session guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    applyWorkbookFeeSetupBatch.mockResolvedValue({ message: "Published." });
    createWorkbookFeeSetupPreview.mockResolvedValue({
      batchId: "00000000-0000-4000-8000-000000000001",
      preview: {
        studentsAffected: 0,
        installmentsToUpdate: 0,
        installmentsToInsert: 0,
        installmentsToCancel: 0,
        blockedInstallments: 0,
      },
    });
    upsertConventionalDiscountPolicies.mockResolvedValue(undefined);
    getActiveSessionLabel.mockResolvedValue("2026-27");
    setActiveSessionLabel.mockResolvedValue(undefined);
  });

  it("publishes the already-active session without switching", async () => {
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookApplyForm("2026-27"));

    expect(result.status).toBe("success");
    expect(setActiveSessionLabel).not.toHaveBeenCalled();
    expect(applyWorkbookFeeSetupBatch).toHaveBeenCalled();
  });

  it("refuses to publish a different session as a silent active-session switch", async () => {
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookApplyForm("2025-26"));

    expect(result.status).toBe("error");
    expect(result.message).toContain("Refusing to switch the active session");
    expect(result.message).toContain("Current active is 2026-27");
    expect(applyWorkbookFeeSetupBatch).not.toHaveBeenCalled();
    expect(setActiveSessionLabel).not.toHaveBeenCalled();
  });

  it("setLiveActiveSessionAction switches the active session after explicit confirmation", async () => {
    const { setLiveActiveSessionAction } = await import("@/app/protected/master-data/actions");
    const formData = new FormData();
    formData.set("sessionLabel", "2025-26");
    formData.set("confirmSessionLabel", "2025-26");

    const result = await setLiveActiveSessionAction(
      { status: "idle", message: "" },
      formData,
    );

    expect(result.status).toBe("success");
    expect(setActiveSessionLabel).toHaveBeenCalledWith("2025-26");
  });
});
