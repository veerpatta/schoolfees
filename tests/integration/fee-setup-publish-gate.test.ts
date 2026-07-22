import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Fee Setup rewrites student dues, so publishing must be a deliberate second
 * step: compute the impact, show it, then apply that exact reviewed batch.
 *
 * Before this gate the only reachable path was `submitFeeSetup("save")`,
 * which built a preview and immediately applied it — the impact card existed
 * but its render condition was unreachable, so nobody ever saw the numbers.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const client = read("components/fees/fee-setup-client.tsx");
const actions = read("app/protected/fee-setup/actions.ts");
const gate = read("components/fees/fee-setup-impact-preview.tsx");

describe("fee setup publish gate", () => {
  it("routes both save buttons through the preview intent", () => {
    expect(client).toContain('submitFeeSetup("preview")');
    // Desktop topbar + mobile save bar — neither may apply in one shot.
    expect(client.match(/submitFeeSetup\("preview"\)/g)?.length).toBe(2);
    expect(client).not.toContain('submitFeeSetup("save")');
  });

  it("publishes only via the reviewed batch", () => {
    expect(client).toContain('submitFeeSetup("apply")');
    // apply must carry the batch id the preview returned.
    expect(client).toContain("createWorkbookFormData(form, intent, saveState.changeBatchId)");
    expect(actions).toContain('parseUuid(formData.get("changeBatchId"), "Review batch")');
    expect(actions).toContain("applyWorkbookFeeSetupBatch(batchId, payload)");
  });

  it("renders the gate whenever a preview is pending, and can be dismissed without writing", () => {
    expect(client).toContain("<FeeSetupImpactPreview");
    expect(client).toContain('saveState.status === "preview" && saveState.preview');
    // Keep editing simply clears local state — nothing was written by preview.
    expect(client).toContain("function discardPreview()");
    expect(client).toContain("setSaveState(INITIAL_FEE_SETUP_ACTION_STATE)");
  });

  it("shows the protected-row guarantee, not just the change count", () => {
    // The whole point for the office: money already posted is never rewritten.
    expect(gate).toContain("previewFrozenRows");
    expect(gate).toContain("blockedInstallments");
    expect(gate).toContain("previewNeverEditsMoney");
    expect(gate).toContain("blockedFullyPaidInstallments");
    expect(gate).toContain("blockedPartiallyPaidInstallments");
    expect(gate).toContain("blockedAdjustedInstallments");
  });

  it("keeps the server-side single-shot save available for other callers", () => {
    // The resync path ("No Fee Setup changes detected") depends on it.
    expect(actions).toContain('intent === "save"');
    expect(actions).toContain("No Fee Setup changes detected");
  });

  it("drives the stepper from real workflow state", () => {
    expect(client).toContain("stageDraftEdited");
    expect(client).toContain("stagePreviewImpact");
    expect(client).toContain("stagePublished");
    // Not from the transient in-flight flag, which only flashed during a save.
    expect(client).not.toContain('{ key: "stageReview", active: isSaving }');
  });
});
