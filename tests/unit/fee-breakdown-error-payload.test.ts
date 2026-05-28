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

  it("defaulter export workflow sorts by outstanding desc (audit 1.26 cross-check)", () => {
    const exportRoute = readFileSync(
      join(process.cwd(), "app/protected/exports/[exportType]/route.ts"),
      "utf8",
    );
    expect(exportRoute).toMatch(/sort\(\([^)]+\)\s*=>/);
    expect(exportRoute).toContain("right.outstandingAmount - left.outstandingAmount");
  });
});
