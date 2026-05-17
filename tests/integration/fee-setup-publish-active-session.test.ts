import { beforeEach, describe, expect, it, vi } from "vitest";

const requireStaffPermission = vi.fn();
const applyWorkbookFeeSetupBatch = vi.fn();
const createWorkbookFeeSetupPreview = vi.fn();
const upsertConventionalDiscountPolicies = vi.fn();
const getActiveSessionLabel = vi.fn();
const setActiveSessionLabel = vi.fn();
const revalidatePath = vi.fn();
const revalidateCoreFinancePaths = vi.fn();
const repairMissingDues = vi.fn();

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
  repairMissingDues,
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

function workbookSaveForm(sessionLabel: string) {
  const formData = workbookApplyForm(sessionLabel);
  formData.set("_intent", "save");
  formData.delete("changeBatchId");
  return formData;
}

describe("Fee Setup publish working-session behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    applyWorkbookFeeSetupBatch.mockResolvedValue({ message: "Fee Setup saved." });
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
    repairMissingDues.mockResolvedValue({
      installmentsToInsert: 0,
      installmentsToUpdate: 0,
      installmentsToCancel: 0,
    });
  });

  it("publishes the already-active session without switching", async () => {
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookApplyForm("2026-27"));

    expect(result.status).toBe("success");
    expect(setActiveSessionLabel).not.toHaveBeenCalled();
    expect(applyWorkbookFeeSetupBatch).toHaveBeenCalled();
  });

  it("saves and syncs Fee Setup in one action without a separate approval step", async () => {
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookSaveForm("2026-27"));

    expect(result.status).toBe("success");
    expect(createWorkbookFeeSetupPreview).toHaveBeenCalled();
    expect(applyWorkbookFeeSetupBatch).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ academicSessionLabel: "2026-27" }),
    );
    expect(result.message).toContain("Fee Setup saved");
  });

  it("saving an unchanged Fee Setup resyncs missing dues instead of blocking staff", async () => {
    createWorkbookFeeSetupPreview.mockRejectedValueOnce(
      new Error("No Fee Setup changes detected. Update at least one value before reviewing."),
    );
    repairMissingDues.mockResolvedValueOnce({
      installmentsToInsert: 4,
      installmentsToUpdate: 0,
      installmentsToCancel: 0,
    });
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookSaveForm("TEST-2026-27"));

    expect(result.status).toBe("success");
    expect(repairMissingDues).toHaveBeenCalledWith("TEST-2026-27");
    expect(applyWorkbookFeeSetupBatch).not.toHaveBeenCalled();
    expect(result.message).toContain("Dues synced automatically");
  });

  it("publishes a different working session without switching the default active session", async () => {
    const { saveWorkbookFeeSetupAction } = await import("@/app/protected/fee-setup/actions");

    const result = await saveWorkbookFeeSetupAction(previousState, workbookApplyForm("2025-26"));

    expect(result.status).toBe("success");
    expect(applyWorkbookFeeSetupBatch).toHaveBeenCalled();
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
