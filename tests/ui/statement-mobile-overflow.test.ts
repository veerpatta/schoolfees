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
 * so its installment table overflowed.
 *
 * Since the A4 redesign the two layouts are separate FILES rather than twinned
 * branches inside one component: the phone keeps the original stacked-card
 * document, desktop and paper get the A4 sheet, and a single switcher chooses
 * between them. That makes "mobile is frozen" checkable — which is what the
 * tests below check.
 *
 * Print is the third case and it is easy to get wrong: `md:hidden` alone would
 * hide the paper document when printing from a phone, and `hidden md:block`
 * alone would hide it when the print stylesheet applies. Both halves of the
 * switch therefore carry an explicit print variant.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Source with comments removed.
 *
 * The counting assertions below are about what the component RENDERS, and the
 * doc comments in these files name the very class pairs being counted — a
 * comment explaining the phone branch would otherwise be indistinguishable from
 * a second phone branch.
 */
function readMarkup(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const STUDENT_SWITCHER = readMarkup("components/students/master-statement-document.tsx");
const FAMILY_SWITCHER = readMarkup("components/students/family-statement-document.tsx");
const STUDENT_MOBILE = readMarkup("components/students/statement/master-statement-mobile.tsx");
const FAMILY_MOBILE = readMarkup("components/students/statement/family-statement-mobile.tsx");
const LETTERHEAD = readMarkup("components/students/statement/statement-letterhead.tsx");

describe("statement: one door to the phone layout, one to the paper layout", () => {
  it("gives each document exactly one phone branch and one desktop/paper branch", () => {
    for (const source of [STUDENT_SWITCHER, FAMILY_SWITCHER]) {
      expect(source.match(/md:hidden print:hidden/g) ?? []).toHaveLength(1);
      expect(source.match(/hidden md:block print:block/g) ?? []).toHaveLength(1);
    }
  });

  it("keeps the phone document's own card shells stacked below md", () => {
    // Installment-wise dues, the payments timeline, and the EMI schedule.
    expect(STUDENT_MOBILE.match(/md:hidden print:hidden/g) ?? []).toHaveLength(3);
  });

  it("never leaves a column-headed table as the phone's only rendering", () => {
    // A <thead> is the tell for a wide, column-headed table — those are the ones
    // that cannot survive 375px. The phone document renders cards instead, so it
    // has none at all; the fee-breakup table it does keep is two columns, label
    // and amount, and reads fine as-is.
    expect(STUDENT_MOBILE.match(/<thead/g) ?? []).toHaveLength(0);
  });

  it("leaves the family phone document exactly as it was", () => {
    // Deliberately exempt from the rule above. The A4 redesign was scoped to
    // desktop and paper, so the family document's phone rendering — wide tables
    // and all — is frozen at what it has always been rather than quietly
    // rewritten. Changing it is a separate decision, not a side effect.
    expect(FAMILY_MOBILE).toContain("<thead");
  });
});

describe("statement: the paper layout cannot leak onto a phone", () => {
  it("reaches the A4 components only through the switchers", () => {
    // If a *-mobile file imported a paper component, the phone would start
    // rendering A4 markup and no other test here would notice.
    for (const source of [STUDENT_MOBILE, FAMILY_MOBILE]) {
      const paperImports =
        source.match(/from "@\/components\/students\/statement\/(?!.*-mobile")/g) ?? [];
      expect(paperImports).toHaveLength(0);
    }
  });

  it("routes both switchers at the paper documents", () => {
    expect(STUDENT_SWITCHER).toContain("student-statement-paper");
    expect(FAMILY_SWITCHER).toContain("family-statement-paper");
  });
});

describe("statement: the phone document's own layout rules", () => {
  it("stacks the letterhead on a phone", () => {
    expect(STUDENT_MOBILE).toContain("flex flex-col gap-3 sm:flex-row");
  });

  it("uses tighter page padding on a phone", () => {
    expect(STUDENT_MOBILE).toContain("p-4 text-foreground shadow-sm sm:p-6");
  });

  it("gives paper a real letterhead instead: the school mark and a rule", () => {
    expect(LETTERHEAD).toContain("/branding/veer-patta-school-logo.jpg");
    expect(LETTERHEAD).toContain("border-b-2 border-border-strong");
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
