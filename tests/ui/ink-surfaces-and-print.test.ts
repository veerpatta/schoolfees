import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The redesign introduced dark "ink" surfaces (--nav*). Three things must
 * stay true or the office notices immediately:
 *  1. Paper is always paper — printing while dark mode is on must not emit a
 *     near-black A4 page.
 *  2. The receipt's ink header must not flood-fill toner on every page.
 *  3. Light-mode chips must not be rendered onto ink surfaces, where they
 *     either look pasted-on or (in dark mode) vanish entirely.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("print output survives dark mode", () => {
  const globals = read("app/globals.css");

  it("resets the dark palette inside @media print", () => {
    const printBlock = globals.slice(globals.lastIndexOf("@media print"));

    expect(printBlock).toContain(".dark {");
    // The surfaces that actually carry a receipt.
    expect(printBlock).toContain("--card: 0 0% 100%");
    expect(printBlock).toContain("--foreground: 222 25% 11%");
  });
});

describe("receipt v3 ink header", () => {
  const receipt = read("components/receipts/receipt-document-v3.tsx");

  it("inverts to paper with a saffron rule when printed", () => {
    expect(receipt).toContain("receipt-ink-band");
    expect(receipt).toContain(".receipt-ink-band {");
    expect(receipt).toContain("background: #ffffff !important");
    expect(receipt).toContain("border-bottom: 2px solid hsl(var(--accent))");
  });

  it("prints the school's own contact line, not just the parent's phone", () => {
    // v2 printed address + phone + email; v3 shipped with only the address,
    // silently dropping the school's contact details from every receipt.
    expect(receipt).toContain("schoolProfile.phone");
    expect(receipt).toContain("schoolProfile.email");
  });
});

describe("ink surfaces stay legible", () => {
  it("does not put a light chip on the dashboard ink hero", () => {
    const dashboard = read("app/protected/dashboard/page.tsx");

    // The ink hero must pass onInk so the chip uses nav tokens; in dark mode
    // bg-surface-2 is the same lightness as --nav and disappears.
    expect(dashboard).toContain("<KpiDeltaLine delta={todayDelta} onInk />");
    expect(dashboard).toContain("onInk?: boolean");
    // And the ink hero must not try to print.
    expect(dashboard).toContain("bg-nav px-5 py-5 text-nav-foreground shadow-md print:hidden");
  });

  it("uses an ink-appropriate focus ring on the sidebar", () => {
    const globals = read("app/globals.css");
    const nav = read("components/admin/sidebar-nav.tsx");
    const shell = read("components/admin/dashboard-shell.tsx");

    expect(globals).toContain(".focus-ring-ink");
    // The paper recipe offsets against --background (cream) and would draw a
    // bright halo on ink.
    expect(globals).toContain("--tw-ring-offset-color: hsl(var(--nav))");
    expect(nav).toContain("focus-ring-ink");
    expect(shell).toContain("focus-ring-ink");
  });

  it("keeps the brand eyebrow off failing saffron-on-ink contrast", () => {
    const brand = read("components/branding/school-brand.tsx");
    // Anchor on the style-object key, not the earlier prop type union.
    const inkVariant = brand.slice(brand.indexOf('"sidebar-ink": {'));
    const eyebrowLine = inkVariant.slice(0, inkVariant.indexOf("title:"));

    // accent on --nav is ~3.7:1 — below AA for 10px text.
    expect(eyebrowLine).not.toContain("text-accent");
  });
});
