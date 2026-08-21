import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The admin modules on a phone.
 *
 * The design gives each of them a real phone screen rather than a squeezed
 * table. Most already had one; these pin the parts that were added, and the
 * one invariant that matters more than any of the styling: a mobile control
 * must drive the SAME write path as its desktop twin. A parallel mobile-only
 * mutation is how an alternate payment-posting route or an RLS gap gets in.
 */

describe("Fee Setup — phone amount steppers", () => {
  const client = read("src/components/fees/fee-setup-client.tsx");

  it("drives the same updater as the typed field", () => {
    // Both the stepper and the number input call updateClassAnnualTuition,
    // so there is one place class tuition changes and one thing to audit.
    const stepper = client.slice(client.indexOf("<AmountStepper"));
    expect(stepper.slice(0, 400)).toContain("updateClassAnnualTuition(row.label, next)");
  });

  it("keeps the typed field alongside the stepper", () => {
    // Annual tuition here runs ₹20,000–38,000. Nudging is for corrections;
    // setting a fresh figure must still be typeable, or the stepper becomes
    // 40 taps.
    expect(client).toContain('id={`class-fee-${row.label}`}');
    expect(client).toContain('type="number"');
  });

  it("respects canEdit on the stepper as well as the field", () => {
    const stepper = client.slice(client.indexOf("<AmountStepper"));
    expect(stepper.slice(0, 400)).toContain("disabled={!canEdit}");
  });

  it("steps by a figure that suits annual amounts, not the mock's monthly one", () => {
    // The prototype nudges ₹50 because it edits a monthly fee. At ₹50 a tap,
    // moving a ₹20,000 annual tuition is 400 taps.
    const kit = read("src/ui/mobile/amount-stepper.tsx");
    expect(kit).toContain("step = 500");
  });

  it("still publishes through the impact preview", () => {
    // Hard Safety Rule 7 — publish previews impact first and protects
    // paid/partial/adjusted rows. The phone must not gain a shortcut.
    expect(client).toContain("FeeSetupImpactPreview");
  });
});

describe("More hub", () => {
  const nav = read("src/ui/shell/mobile-bottom-nav.tsx");

  it("closes with the account row and build line from the design", () => {
    expect(nav).toContain("initialsFromEmail");
    expect(nav).toContain('tMobile("buildLine")');
  });

  it("keeps the bar permission-driven rather than the mock's fixed five", () => {
    // The prototype hardcodes Home/Students/Collect/Calls/More for one
    // persona. A view_only account must not be shown a Collect button.
    expect(nav).toContain("getMobileBottomNavigation(staffRole)");
    expect(nav).toContain("getMobileMoreGroups(staffRole)");
  });

  it("derives avatar initials without inventing a name", () => {
    // Staff sign in with an email; there is no display name to fall back on.
    const fn = nav.slice(nav.indexOf("function initialsFromEmail"));
    expect(fn.slice(0, 400)).toContain('split("@")');
  });
});
