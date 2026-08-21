import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * A closed day must show what its receipts actually say.
 *
 * `collection_closures.summary_snapshot` is frozen at midnight by the nightly
 * cron. This office back-dates payments — a receipt for the 2nd is routinely
 * keyed on the 9th — and reverses receipts long after the day they belong to.
 * Both happen after the close, and neither reaches a frozen figure.
 *
 * Finance Controls preferred that frozen copy, so a closed day showed a total
 * that disagreed with the receipts listed directly beneath it. Measured on the
 * live session: 38 closed days out by Rs 14,73,508, the large majority of it
 * from ordinary back-dated entry rather than any single edit.
 */

describe("day close reads live, not frozen", () => {
  const client = read("src/modules/finance-controls/ui/finance-controls-client.tsx");

  it("takes the recomputed summary in preference to the stored snapshot", () => {
    // The bug in one line: `closure?.summarySnapshot ?? data.summary`.
    expect(client).not.toContain("closure?.summarySnapshot ?? data.summary");
    expect(client).toContain("const summary = data.summary;");
  });

  it("still says so when the day closed on a different figure", () => {
    // Overriding silently would be its own trap: a printout taken on the night
    // of the close will not match this screen.
    expect(client).toContain("closedOnADifferentFigure");
    expect(client).toContain("This day closed at");
  });

  it("names the reversed money it excluded", () => {
    expect(client).toContain("summary.reversedTotal > 0");
    expect(client).toContain("reversedReceiptCount");
  });
});

describe("the live summary nets reversals before it is shown", () => {
  const data = read("src/modules/finance-controls/data/queries.ts");

  it("filters reversed receipts out of the day's collection", () => {
    expect(data).toContain("isReceiptReversed(payload.reversalTotals");
    expect(data).toContain("countedReceipts");
  });

  it("carries the reversed figure rather than only subtracting it", () => {
    expect(data).toContain("reversedReceiptCount");
    expect(data).toContain("reversedTotal");
  });
});

describe("the nightly close writes a figure that nets reversals", () => {
  const cron = read("src/app/api/cron/auto-day-close/route.ts");

  it("excludes fully reversed receipts from the snapshot it freezes", () => {
    expect(cron).toContain("getReceiptReversalTotals");
    expect(cron).toContain("isReceiptReversed");
  });

  it("records what it excluded, so a re-run is auditable", () => {
    expect(cron).toContain("reversedReceiptCount");
    expect(cron).toContain("reversedTotal");
  });
});
