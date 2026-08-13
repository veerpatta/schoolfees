import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("fee-breakdown route error payload (audit 1.28)", () => {
  const source = readFileSync(
    join(process.cwd(), "app/protected/defaulters/fee-breakdown/route.ts"),
    "utf8",
  );

  it("returns the studentId and an error code on failure so the drawer can act", () => {
    expect(source).toContain('errorCode: "FEE_BREAKDOWN_FAILED"');
    expect(source).toMatch(/studentId,/);
  });

  /*
   * Audit 1.26 wanted the export ordered like the heat-ordered Defaulters page
   * rather than the workbook's natural order. It still is — but the key moved
   * from `outstandingAmount` to `totalOwedAmount` once fees and late fees were
   * split apart. On the old key a family clear of fees and carrying a late fee
   * sorted below everyone who owed nothing at all.
   */
  it("defaulter export workflow sorts by what the family owes (audit 1.26 cross-check)", () => {
    const exportRoute = readFileSync(
      join(process.cwd(), "app/protected/exports/[exportType]/route.ts"),
      "utf8",
    );
    expect(exportRoute).toMatch(/sort\(\([^)]+\)\s*=>/);
    expect(exportRoute).toContain("right.totalOwedAmount - left.totalOwedAmount");
  });
});
