import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Receipts gained filters, and they have to behave like the ones on Students:
 * instant-apply, a live count in the pinned footer, and removable pills.
 *
 * These are source assertions because the alternative is mounting a client
 * component that fetches — and the things most likely to be undone by a
 * refactor here are structural, not behavioural.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const QUICK_LOAD = "src/modules/receipts/ui/receipts-quick-load.tsx";
const SHEET = "src/modules/receipts/ui/receipts-filter-sheet.tsx";

describe("Receipts filters", () => {
  it("mounts the sheet outside both breakpoint branches", () => {
    const source = read(QUICK_LOAD);
    const mobileBranch = source.indexOf('className="flex flex-col gap-2.5 md:hidden"');
    const deskBranch = source.indexOf('className="hidden md:block"');
    const sheetMount = source.indexOf("<ReceiptsFilterSheet");

    expect(mobileBranch).toBeGreaterThan(-1);
    expect(deskBranch).toBeGreaterThan(-1);
    // Inside either branch, `display:none` at the other width swallows the
    // sheet the button just opened — the trap Transactions is guarded for.
    expect(sheetMount).toBeGreaterThan(deskBranch);
  });

  it("pins a live count and total, with no Apply button", () => {
    const sheet = read(SHEET);

    expect(sheet).toContain("footer={");
    expect(sheet).toContain('t("filterShowNReceipts", { count:');
    expect(sheet).toContain('t("filterTotalLine"');
    expect(sheet).not.toContain("filterApplyFilters");
  });

  it("restates what is applied as removable pills", () => {
    const source = read(QUICK_LOAD);

    expect(source).toContain("<ActiveFilterSummary");
    expect(source).toContain("countActiveReceiptFilters");
  });

  it("keeps the phone list search-first and a reversed receipt visible", () => {
    const source = read(QUICK_LOAD);

    expect(source).toContain('className="h-[52px] min-w-0 flex-1');
    // Dimmed and struck through, never hidden: a reversed receipt is a real
    // record and the ledger is append-only.
    expect(source).toContain("border-destructive/30 opacity-60");
    expect(source).toContain("line-through");
  });

  it("filters on the stored staff value, never the rendered name", () => {
    const sheet = read(SHEET);

    // Two people can render as the same display name; the filter has to key
    // off the raw received_by string the desk stored.
    expect(sheet).toContain("toggleStaff(row.receivedBy)");
    expect(sheet).toContain("staffDisplayName(row.receivedBy)");
  });

  it("applies every filter to the list, the totals and the facets alike", () => {
    const data = read("src/modules/receipts/data/queries.ts");

    // One builder for all three passes. A filter on the list but not the
    // aggregate shows a stat strip that disagrees with the rows under it.
    expect(data).toContain("function applyReceiptFilters");
    expect(data.match(/applyReceiptFilters\(/g) ?? []).toHaveLength(3);
    // The facet pass excludes the two filters it describes, so a count reads
    // as "how many more you would get".
    expect(data).toContain("skipModes: true, skipStaff: true");
  });

  it("says so when the aggregate had to stop reading", () => {
    const data = read("src/modules/receipts/data/queries.ts");
    const quickLoad = read(QUICK_LOAD);

    // Judged on the SERVER-side count, not the netted one. `receiptCount` now
    // excludes reversed receipts and is therefore derived from the capped fetch,
    // so comparing it to the cap could never be true and this warning would have
    // gone quiet exactly when the total was least trustworthy.
    expect(data).toContain(
      "truncated: (aggregateResult.count ?? aggregateRows.length) > AGGREGATE_ROW_CAP",
    );
    // A total that is quietly short is worse than one marked approximate.
    expect(quickLoad).toContain('aggregate.truncated ? "≈ " : ""');
  });

  it("uses !inner for the class filter only, so unknown students still render", () => {
    const data = read("src/modules/receipts/data/queries.ts");

    // PostgREST nulls a non-inner embed instead of dropping the parent row,
    // so filtering one would return every receipt with a blank student.
    expect(data).toContain('const studentJoin = filters?.classId ? "students!inner" : "students"');
    expect(data).toContain('student?.full_name ?? "Unknown student"');
  });

  it("keeps the page a page", () => {
    const data = read("src/modules/receipts/data/queries.ts");
    // The sorted list query must still be ranged — without it the "page" is
    // however many rows PostgREST felt like returning.
    expect(data).toContain(").range(from, to);");
  });
});
