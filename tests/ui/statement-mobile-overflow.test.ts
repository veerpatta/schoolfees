import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The statement has to be readable on a phone and printable on A4, and those
 * are not the same layout.
 *
 * A six-column table is fine on paper and unusable at 375px — it either runs off
 * the edge or squeezes every column to nothing. The rest of the app already
 * answered this: receipts, dues and transactions all render a stacked card list
 * below 768px and keep the table for wider screens. The statement never did,
 * so its installment table overflowed, and the payments timeline added in this
 * session would have overflowed the same way.
 *
 * Print is the third case and it is easy to get wrong: `md:hidden` alone would
 * hide the table when printing from a phone, and `hidden md:block` alone would
 * hide it when the print stylesheet applies. Both halves therefore carry an
 * explicit print variant.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const STATEMENT = read("components/students/master-statement-document.tsx");

describe("master statement: phone cards, desktop and print tables", () => {
  it("stacks both tables into cards below md, and hides those cards in print", () => {
    const cardShells = STATEMENT.match(/md:hidden print:hidden/g) ?? [];
    // One for installment-wise dues, one for the payments timeline.
    expect(cardShells).toHaveLength(2);
  });

  it("keeps both tables for desktop AND for paper", () => {
    const tableShells = STATEMENT.match(/hidden md:block print:block/g) ?? [];
    expect(tableShells).toHaveLength(2);
  });

  it("never leaves a multi-column table as the only rendering of a section", () => {
    // A <thead> is the tell for a wide, column-headed table — those are the ones
    // that cannot survive 375px. The fee-breakup table deliberately has none: it
    // is two columns, label and amount, and reads fine on a phone as-is.
    const wideTables = STATEMENT.match(/<thead/g) ?? [];
    const tableShells = STATEMENT.match(/hidden md:block print:block/g) ?? [];
    expect(wideTables.length).toBe(tableShells.length);
    expect(wideTables.length).toBeGreaterThan(0);
  });

  it("stacks the letterhead on a phone but restores it side-by-side on paper", () => {
    expect(STATEMENT).toContain("flex flex-col gap-3 sm:flex-row");
    expect(STATEMENT).toContain("print:flex-row");
  });

  it("uses tighter page padding on a phone", () => {
    expect(STATEMENT).toContain("p-4 text-foreground shadow-sm sm:p-6");
  });
});

describe("touch targets on the actions added this session", () => {
  it("gives the Danger Zone close-balance buttons a full-width 44px target on a phone", () => {
    const dangerZone = read("components/students/student-danger-zone.tsx");

    // Two buttons, both h-11 w-full on a phone and auto-width from sm up.
    const mobileCtas = dangerZone.match(/h-11 w-full justify-center rounded-xl/g) ?? [];
    expect(mobileCtas).toHaveLength(2);
    expect(dangerZone).toContain("sm:h-9 sm:w-auto");
    expect(dangerZone).toContain("flex flex-col gap-2 sm:flex-row sm:flex-wrap");
  });

  it("gives the waive-late-fee installment picker a 44px target on a phone", () => {
    const sheet = read("components/payments/waive-late-fee-sheet.tsx");

    expect(sheet).toContain("h-11 w-full rounded-md border border-border");
    expect(sheet).toContain("sm:h-10");
    // 16px text on the control so iOS does not zoom the viewport on focus.
    expect(sheet).toMatch(/text-base sm:h-10 sm:text-sm/);
  });
});
