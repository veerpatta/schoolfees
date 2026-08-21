import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * The phone day summary (mobile v2, Transactions) renders the day's money as
 * an ink hero with a proportional mode-split bar.
 *
 * The rule it must not break: it shows the SAME figures the desk strip does,
 * from the same `todaySnapshot`. The design mocks a "3 reversed" count and a
 * day picker; neither is in this payload, and inventing them would put a
 * fabricated number on a financial screen.
 */
describe("mobile transactions day summary", () => {
  const component = readRepoFile("src/components/transactions/mobile-day-summary.tsx");
  const shell = readRepoFile("src/components/transactions/transactions-client-shell.tsx");

  it("renders on phones only, with the desk strip taking over from md up", () => {
    expect(component).toContain("md:hidden");
    expect(shell).toContain("<MobileDaySummary");
    expect(shell).toContain('<div className="hidden md:block">');
  });

  it("reads the existing snapshot rather than adding a query", () => {
    // Money figures are read straight off the snapshot in the component.
    for (const field of ["total", "cashTotal", "upiTotal", "bankTotal", "chequeTotal"]) {
      expect(component, `${field} should come from the snapshot`).toContain(`snapshot.${field}`);
    }
    // The receipt count arrives as a pre-translated label so the component
    // stays presentational — but it must still originate in the snapshot.
    expect(shell).toContain("count: todaySnapshot.receiptCount");
    // No data fetching of its own: same payload the desk strip already has.
    expect(component).not.toMatch(/\bfetch\(|useEffect|createClient/);
  });

  it("never divides by a zero-total day", () => {
    // A school holiday means total === 0; the split bar must not render NaN%.
    expect(component).toContain("snapshot.total > 0");
    expect(component).toContain("(mode.value / snapshot.total) * 100");
  });

  it("invents no figure the payload does not carry", () => {
    // Guards against copying the design's mocked "reversed" count and day
    // chips, which have no source in TodaySnapshot.
    expect(component).not.toMatch(/reversed/i);
    expect(component).not.toMatch(/Yesterday|This week/i);
  });

  it("hides modes with no money instead of printing four zeroes", () => {
    expect(component).toContain("filter((mode) => mode.value > 0)");
  });
});
