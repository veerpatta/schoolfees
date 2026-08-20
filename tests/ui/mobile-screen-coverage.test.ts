import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phone coverage for the screens converted after the Students work.
 *
 * `mobile-wide-tables.test.ts` only catches tables with an explicit
 * `min-w-[Npx]`. The Reports tables use `min-w-full` and got wide from column
 * count alone, so they slipped past it — this file pins the phone branch on
 * each screen that had a desk-shaped layout on a 390px viewport.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Transactions on a phone", () => {
  const shell = read("components/transactions/transactions-client-shell.tsx");
  const page = read("app/protected/transactions/page.tsx");

  it("opens on its own sticky chip header, not the desktop page title", () => {
    expect(page).toContain("hideOnMobile");
    expect(shell).toContain("sticky top-0 z-20");
    expect(shell).toContain("readOnlyShort");
  });

  it("keeps the desk filter bar off the phone", () => {
    // A search box, a native class select and a More-filters panel is a
    // reconciliation shape. The phone asks "which day, which view" instead.
    expect(shell).toContain('className="hidden md:block"\n        title={t("viewFilterTitle")}');
  });

  it("drives both chip rows from one day-range helper", () => {
    // The desk row used to recompute IST dates inline; two copies could
    // disagree about which day "Today" is after midnight.
    expect(shell).toContain("function applyDayRange");
    expect(shell.match(/applyDayRange\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("gives the receipt list the design's row, not a second desk table", () => {
    expect(shell).toContain("flex flex-col gap-2.5 md:hidden");
    expect(shell).toContain("rowActionOpen");
  });

  it("mounts everything the phone opens OUTSIDE the desk card", () => {
    // Regression: MobileDatePicker lived inside the filter card. Gating that
    // card behind `hidden md:block` put the picker in a display:none subtree,
    // so the phone's calendar chip set state and nothing appeared. Anything a
    // phone control opens has to sit outside that branch.
    const deskCard = shell.indexOf('className="hidden md:block"\n        title={t("viewFilterTitle")}');
    const deskCardEnd = shell.indexOf("</SectionCard>", deskCard);
    const insideDeskCard = shell.slice(deskCard, deskCardEnd);

    expect(deskCard).toBeGreaterThan(-1);
    expect(insideDeskCard).not.toContain("<MobileDatePicker");
    expect(insideDeskCard).not.toContain("<Sheet");
    expect(shell).toContain("<MobileDatePicker");
    expect(shell).toContain("phoneFiltersOpen");
  });

  it("keeps search, class, route and session reachable from the phone", () => {
    // Hiding the desk bar would otherwise have taken all four with it.
    expect(shell).toContain("txn-query-phone");
    expect(shell).toContain("txn-session-phone");
    expect(shell).toContain("phoneFilterCount");
  });
});

describe("Receipts lookup on a phone", () => {
  const source = read("components/receipts/receipts-quick-load.tsx");

  it("is search-first, with the desk cards behind md:", () => {
    expect(source).toContain('h-[52px]');
    expect(source).toContain('<SectionCard className="hidden md:block" title={t("lookupTitle")}');
  });

  it("dims a reversed receipt instead of hiding it", () => {
    expect(source).toContain("border-destructive/30 opacity-60");
  });
});

describe("Reports on a phone", () => {
  const source = read("app/protected/reports/page.tsx");

  it("gives every wide table a card list beside it", () => {
    const tables = source.match(/<div className="hidden overflow-x-auto rounded-xl border border-border md:block">/g) ?? [];
    const cardLists = source.match(/<ReportCardList/g) ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(6);
    expect(cardLists.length).toBe(tables.length);
  });

  it("routes the phone rows through the shared record card", () => {
    expect(source).toContain("MobileRecordCard");
    expect(source).toContain("MobileEmptyRows");
  });
});

describe("Defaulters on a phone", () => {
  const workspace = read("components/defaulters/defaulters-workspace.tsx");
  const page = read("app/protected/defaulters/page.tsx");

  it("opens on the family being called, not on a metric row", () => {
    // The page title, the standing office notice, the desk metric tiles and
    // the progress panel all used to sit above the one card the screen exists
    // for. They are ordered below it on a phone now.
    expect(page).toContain("hideOnMobile");
    expect(page).toContain("max-md:order-2");
    expect(workspace).toContain("max-md:order-1");
    expect(workspace).toContain("max-md:order-3");
  });

  it("carries the count and the progress bar in its own phone header", () => {
    expect(workspace).toContain("md:hidden");
    expect(workspace).toContain("callPct");
  });

  it("keeps the desk metric tiles off the phone", () => {
    expect(workspace).toContain('className="hidden grid-cols-3 gap-2 md:grid"');
  });
});

describe("desktop-only surfaces say so on the phone", () => {
  it.each([
    "app/protected/payments/bulk/page.tsx",
    "app/protected/admin-tools/promotion/page.tsx",
    "app/protected/admin-tools/promotion/[runId]/page.tsx",
    "app/protected/admin-tools/session-health/page.tsx",
  ])("%s carries a MobileDesktopOnlyNotice", (path) => {
    // Being honest that a task belongs on a computer beats shipping a cramped
    // table that invites a mistake on live money.
    expect(read(path)).toContain("MobileDesktopOnlyNotice");
  });
});
