import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the class of bug that hid the Payment Desk "Collect" button: a
 * primary action rendered where the on-screen keyboard or the fixed mobile
 * bottom nav covers it, with no way to scroll to it.
 *
 * Two rules:
 *  1. A bottom-anchored action bar must clear the fixed nav (z-40, bottom-0)
 *     — either by sitting above it via --mobile-bottom-nav-offset, or by
 *     being desktop-only.
 *  2. A sheet whose body contains a text input must pin its submit action
 *     outside the scroll area (the Sheet `footer` prop), not as the last
 *     child of a scrolling form.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const NAV_CLEARANCE = "var(--mobile-bottom-nav-offset,0px)";

describe("mobile primary actions stay reachable", () => {
  it("publishes the keyboard offset for the whole workspace, not just the payment desk", () => {
    const provider = read("components/system/keyboard-offset-provider.tsx");
    const layout = read("app/protected/layout.tsx");
    const desk = read("components/payments/payment-desk-mobile.tsx");

    expect(provider).toContain("visualViewport");
    expect(provider).toContain("--keyboard-offset");
    expect(layout).toContain("<KeyboardOffsetProvider />");
    // The desk must no longer own a private copy of the listener.
    expect(desk).not.toContain('style.setProperty(\n        "--keyboard-offset"');
    expect(desk).not.toContain("viewport.addEventListener");
  });

  it("lifts bottom sheets above the keyboard and supports a pinned footer", () => {
    const sheet = read("components/ui/sheet.tsx");

    expect(sheet).toContain('marginBottom: "var(--keyboard-offset, 0px)"');
    expect(sheet).toContain("data-sheet-footer");
    // The scroll body must be able to shrink, or the footer gets pushed out.
    expect(sheet).toContain("min-h-0 flex-1 overflow-y-auto");
  });

  it.each([
    ["components/payments/waive-late-fee-sheet.tsx", "waiveSubmit"],
    ["components/defaulters/contact-popover.tsx", "popoverSubmit"],
    ["components/students/close-due-as-discount-sheet.tsx", "Close balance"],
    ["components/whatsapp-templates/template-editor.tsx", "whatsappEditorCreate"],
  ])("%s pins its submit action outside the scroll body", (path, submitMarker) => {
    const source = read(path);

    expect(source).toContain("footer={");
    expect(source).toContain(submitMarker);
    // Pinned buttons live outside <form>, so they need the form attribute.
    expect(source).toMatch(/form=\{[A-Z_]+FORM_ID\}/);
  });

  it.each([
    "components/students/bulk-student-edit-bar.tsx",
    "components/defaulters/bulk-whatsapp-provider.tsx",
    "components/fees/fee-setup-client.tsx",
    "components/students/student-form.tsx",
    "components/forms/save-bar.tsx",
    "components/students/student-quick-load.tsx",
    "components/defaulters/defaulters-workspace.tsx",
  ])("%s clears the fixed mobile bottom nav", (path) => {
    expect(read(path)).toContain(NAV_CLEARANCE);
  });

  it("uses dynamic viewport units for full-height overlays", () => {
    const overlays = [
      "components/payments/confirm-receipt-sheet.tsx",
      "components/payments/success-receipt-sheet.tsx",
      "components/payments/duplicate-receipt-sheet.tsx",
      "components/students/student-bulk-import-dialog.tsx",
      "components/command/command-palette.tsx",
    ];

    for (const path of overlays) {
      const source = read(path);
      // `vh` resolves to the LARGE viewport on mobile, so a vh-sized box can
      // extend under the browser chrome and take its sticky CTA with it.
      expect(source, path).not.toMatch(/max-h-\[\d+vh\]/);
    }
  });

  it("keeps both payment pickers stretched to the keyboard edge", () => {
    const sheet = read("components/payments/mobile-payment-flow-sheet.tsx");
    const offsets = sheet.match(/bottom: "var\(--keyboard-offset, 0px\)"/g) ?? [];

    // Class picker AND student picker — both have search inputs.
    expect(offsets.length).toBeGreaterThanOrEqual(2);
    expect(sheet).not.toContain('h-[88svh] rounded-t-2xl');
  });
});
