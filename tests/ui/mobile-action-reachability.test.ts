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

/**
 * Source with comments stripped.
 *
 * For the negative assertions below, which are about what the code DOES. A
 * file has to be able to explain why it avoids a pattern without failing the
 * check that it avoids it — and the comment retiring the blind
 * `setTimeout(…) → scrollIntoView` necessarily names the very thing being
 * banned.
 */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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
    // The sibling picker autofocuses its search field, so on a phone the
    // keyboard is up the moment the sheet opens and a submit left at the end
    // of the scroll body sits under it.
    ["components/students/link-sibling-sheet.tsx", "linkSiblingConfirm"],
    // The student information quick-edit is a form of text inputs, so on a
    // phone the keyboard is up for most of the time the sheet is open.
    ["components/students/student-info-sheet.tsx", "studentInfoSave"],
    // The photo sheet's body grows by a preview image once a picture is
    // chosen, which is exactly when Save has to still be reachable.
    ["components/students/student-photo-sheet.tsx", "studentPhotoSave"],
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
  ])("%s clears the fixed mobile bottom nav", (path) => {
    expect(read(path)).toContain(NAV_CLEARANCE);
  });

  it("keeps the Defaulters call queue free of a sticky bottom bar", () => {
    // The inverse guard: this file used to be in the list above, carrying a
    // sticky Prev/Next bar that could not be made to sit right. It was
    // `lg:hidden` while the tab bar it cleared is `md:hidden`, so between 768
    // and 1023px it floated clear of the bottom edge reserving room for a bar
    // that was not there; its containing block closed before page.tsx rendered
    // two further sections, so it pinned and then scrolled away — the "stuck"
    // feel; and it shared z-40 with both the tab bar and the bulk-selection
    // bar inside the same 76px band. The design has no such bar: it advances
    // via "Skip for now" under the family card and self-advancing call mode.
    const source = read("components/defaulters/defaulters-workspace.tsx");
    expect(source).not.toMatch(/sticky bottom-\[/);
    expect(source).not.toContain(NAV_CLEARANCE);
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

  it("keeps all three payment panels stretched to the keyboard edge", () => {
    const sheet = read("components/payments/mobile-payment-flow-sheet.tsx");
    const offsets = sheet.match(/bottom: "var\(--keyboard-offset, 0px\)"/g) ?? [];

    // Class picker, student picker AND payment entry. Entry was the one left
    // out: `bottom-0` at a fixed height, so on iOS — where the layout viewport
    // does not shrink — its footer sat under the keyboard.
    expect(offsets.length).toBeGreaterThanOrEqual(3);
    expect(sheet).not.toContain('h-[88svh] rounded-t-2xl');
  });

  it("compensates for the keyboard exactly once in the payment entry footer", () => {
    // The panel now ends at the keyboard edge, so a footer that ALSO adds the
    // offset floats the Collect button a full keyboard-height into mid-screen.
    // Two edits that are only correct together; this is the guard that stops
    // one of them being reverted alone.
    const sheet = readCode("components/payments/mobile-payment-flow-sheet.tsx");

    // Safe area only — the keyboard is already accounted for by the panel.
    expect(sheet).toContain(
      'paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)"',
    );
    // No paddingBottom anywhere in this file may add the keyboard offset.
    for (const declaration of sheet.match(/paddingBottom:[^\n]*/g) ?? []) {
      expect(declaration).not.toContain("--keyboard-offset");
    }
  });

  it("reacts to the keyboard instead of guessing at it with a timer", () => {
    const provider = readCode("components/system/keyboard-offset-provider.tsx");
    const sheet = readCode("components/payments/mobile-payment-flow-sheet.tsx");

    // iOS fires visualViewport `scroll` at touch frequency while the keyboard
    // is up; each unthrottled write re-resolves every var() that reads it.
    expect(provider).toContain("requestAnimationFrame");
    // The covered height is innerHeight - (height + offsetTop). Dropping
    // offsetTop overstates the keyboard once the page is scrolled under it,
    // which is what made lifted footers drift.
    expect(provider).toContain("offsetTop");

    // A `setTimeout` wrapping a scrollIntoView is the pattern being retired:
    // it guessed the keyboard's animation length and fired even for focus
    // calls made with `preventScroll: true`.
    expect(sheet).not.toMatch(/setTimeout\([\s\S]{0,160}?scrollIntoView/);
    expect(sheet).toContain("scroll-pb-");
  });
});
