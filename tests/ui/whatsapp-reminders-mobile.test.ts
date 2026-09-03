import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The reminders screens on a phone.
 *
 * This route has TWO opposite bottom-spacing rules, and getting them backwards
 * is invisible on a desk and obvious on a handset:
 *
 * - `/protected/reminders` is a top-level TAB. `MobileBottomNav` is really
 *   there, so anything pinned to the bottom must clear it with
 *   `--mobile-bottom-nav-offset`.
 * - `/protected/reminders/` — every sub-page — is in `mobileTakeoverRoutes`, so
 *   the bar renders nothing and the same variable would reserve 68px for a bar
 *   that is not on screen.
 *
 * `tests/ui/mobile-action-reachability.test.ts` holds the first rule for
 * `reminders-workspace.tsx`. This file holds the second for everything added
 * after it, plus the three traps this codebase has hit before.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const NAV_CLEARANCE = "var(--mobile-bottom-nav-offset,0px)";
const SAFE_AREA = "var(--mobile-safe-area-bottom, 0px)";

/** Everything added to this feature that a phone renders. */
const NEW_SURFACES = [
  "src/modules/whatsapp/ui/due-today-card.tsx",
  "src/modules/whatsapp/ui/holdout-control.tsx",
  "src/modules/whatsapp/ui/run-measurement-panel.tsx",
  "src/modules/whatsapp/ui/run-comparisons.tsx",
  "src/app/protected/reminders/unreachable/page.tsx",
  "src/app/protected/reminders/runs/[runId]/run-delivery-panel.tsx",
  "src/app/pay/[code]/page.tsx",
];

/** The sub-pages, where the tab bar is NOT rendered. */
const TAKEOVER_SURFACES = [
  "src/app/protected/reminders/unreachable/page.tsx",
  "src/app/protected/reminders/runs/[runId]/run-delivery-panel.tsx",
];

describe("reminders sub-pages are takeovers, not tab screens", () => {
  it.each(TAKEOVER_SURFACES)("%s pads for the safe area, not for a tab bar", (path) => {
    const source = read(path);

    // The bar is not rendered on a takeover, so reserving room for it leaves a
    // 68px band of nothing above the home indicator.
    expect(source).not.toContain(NAV_CLEARANCE);
    expect(source).toContain(SAFE_AREA);
  });
});

describe("the phone traps this codebase has already hit", () => {
  it.each(NEW_SURFACES)("%s uses dvh, never vh", (path) => {
    // 100vh is taller than the visible viewport on a phone browser with a
    // chrome bar, so a button positioned against it lands underneath.
    const source = read(path);
    expect(source).not.toMatch(/\b(h-screen|min-h-screen)\b/);
    expect(source).not.toContain("100vh");
  });

  it.each(NEW_SURFACES)("%s reads no window during render", (path) => {
    // `window` exists during hydration, so reading it in a `useState`
    // initializer mismatches the server and throws a hydration error. The
    // pattern here is `useSyncExternalStore` with a server snapshot.
    const source = read(path);
    expect(source).not.toMatch(/useState\([^)]*window/);
    expect(source).not.toMatch(/useState\(\(\)\s*=>\s*window/);
  });

  it.each(NEW_SURFACES)("%s spaces conditional blocks with flex gap", (path) => {
    // Tailwind's `space-y` puts a margin around a `hidden` child too, so a
    // twin-branch block leaks a visible band onto the phone. Every stack here
    // that can hide a child uses `flex flex-col gap-*`.
    //
    // `space-y-1.5` on a Label+field pair is exempt and deliberate: it is the
    // repo's own field idiom and neither child is ever conditional.
    const source = read(path);
    const stacks = source.match(/space-y-(?!1\.5\b)[\w.]+/g) ?? [];
    expect(stacks).toEqual([]);
  });
});

describe("what a parent taps", () => {
  it("gives the pay button a full-width, thumb-sized target", () => {
    // The only thing on the page anybody came to do, tapped one-handed.
    const source = read("src/app/pay/[code]/page.tsx");
    expect(source).toMatch(/h-14 w-full/);
    expect(source).toContain("min-h-dvh");
  });

  it("shows the UPI id as selectable text beside the button", () => {
    // The button does nothing on a phone with no app registered to the `upi://`
    // scheme, and a parent can still type the id into the one they have.
    const source = read("src/app/pay/[code]/page.tsx");
    expect(source).toContain("select-all");
    expect(source).toContain("payment.vpa");
  });

  it("leaks nothing about the student on the public pay page", () => {
    // A payment link, not a portal. Someone who guesses a code must learn that
    // somebody owes some money and nothing more.
    const source = read("src/app/pay/[code]/page.tsx");
    for (const forbidden of ["student_name", "full_name", "class_label", "father_name"]) {
      expect(source).not.toContain(forbidden);
    }
    // The admission number reaches the UPI note so the office can match the
    // payment, and must never be rendered.
    expect(source).not.toMatch(/\{\s*result\.reference\s*\}/);
  });

  it("scrolls a wide comparison table inside itself", () => {
    // The page body must never scroll sideways on a phone.
    const source = read("src/modules/whatsapp/ui/run-comparisons.tsx");
    expect(source).toContain("overflow-x-auto");
  });
});
