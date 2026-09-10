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
  "src/modules/whatsapp/ui/audience-builder.tsx",
  "src/modules/whatsapp/ui/notice-picker.tsx",
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

describe("what the office taps, measured at 390px", () => {
  const AUDIENCE = "src/modules/whatsapp/ui/audience-builder.tsx";
  const PICKER = "src/modules/whatsapp/ui/notice-picker.tsx";

  /**
   * Both chip rows scrolled horizontally with `no-scrollbar` until 2026-09-10,
   * and measured on a 390px viewport — where the card's inner width is 298px —
   * that hid most of both:
   *
   * | row | row width | hidden | reachable |
   * |---|---|---|---|
   * | 12 templates | 1571px | 1265px | ~3 of 12 |
   * | 5 audiences  |  759px |  453px |  2 of 5  |
   *
   * They are fixed in OPPOSITE directions on purpose, and the reason is how
   * often each is touched rather than how many chips it holds.
   */
  it("wraps the five audience chips, so none of the primary control is off-screen", () => {
    const source = read(AUDIENCE);
    const row = source.slice(
      source.indexOf("audience shortcuts"),
      source.indexOf("AUDIENCE_SHORTCUTS.map"),
    );

    // Wrapped at EVERY width. This is the control the office retunes on every
    // run, so all five counts have to be comparable at a glance.
    expect(row).toContain('className="flex flex-wrap gap-2"');
    expect(row).not.toContain("overflow-x-auto");
  });

  it("keeps the twelve template chips on one row, but says so", () => {
    const source = read(PICKER);

    // Twelve chips WRAPPED cost six rows and 304px — 35% of an 861px card —
    // spent on the control changed least, and pushed "Who gets it" from 890px
    // to 1156px on an 844px screen. So it still scrolls, but the affordance
    // `no-scrollbar` removed is put back explicitly.
    expect(source).toContain("snap-x");
    expect(source).toContain("snap-start");
    expect(source).toContain("bg-gradient-to-l from-card");
    expect(source).toContain("Swipe for all {NOTICE_SITUATIONS.length} messages.");
  });

  it("gives every chip a 44px tap target on a phone", () => {
    // The panel's own rule — "44px on a phone, the desk's own 36 above md" —
    // which chips were the one exception to, at a flat h-9.
    for (const path of [AUDIENCE, PICKER]) {
      const source = read(path);
      expect(source, path).toMatch(/h-11[^"]*md:h-9/);
      expect(source, path).not.toMatch(/inline-flex h-9 shrink-0/);
    }
  });

  it("wins the button height fight with the primitive's compound variant", () => {
    // `size="sm"` carries `{ size: "sm", class: "max-md:h-10" }`, so a bare
    // `h-11` loses inside the media query and Apply/Add measured 40px beside
    // 44px selects. Overriding at the same variant level is what works.
    const source = read(AUDIENCE);
    expect(source).toContain('className="max-md:h-11 px-6 md:h-9"');
    expect(source).toContain('className="max-md:h-11 px-4 md:h-9"');
    expect(source).not.toContain('className="h-11 px-6 md:h-9"');
  });

  it("splits the audience sentence into three weights rather than one wall", () => {
    // One string measured six lines and 124px of uniform semibold at 390px,
    // and it is both the first thing on the card and the last thing read
    // before a few hundred billed messages go out.
    const source = read(AUDIENCE);
    expect(source).toContain("sentence.headline");
    expect(source).toContain("sentence.claim");
    expect(source).toContain("sentence.notes");
    // One live region around all three, so a screen reader hears one update
    // rather than three.
    const region = source.slice(
      source.indexOf('aria-live="polite"'),
      source.indexOf("sentence.notes"),
    );
    expect(region).toContain("flex flex-col gap-1");
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
