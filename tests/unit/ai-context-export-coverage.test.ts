import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("AI context export coverage", () => {
  it("keeps recovery and carry-forward context wired into the AI workbook bundle", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "app/protected/exports/[exportType]/route.ts"),
      "utf8",
    );

    expect(routeSource).toContain('"Recovery Follow-Up"');
    expect(routeSource).toContain('"Previous Year Dues"');
    expect(routeSource).toContain('"Left Student Recovery"');
    expect(routeSource).toContain("getContactSummariesForStudents");
    expect(routeSource).toContain("getPrevYearDuesCollectionRows");
    expect(routeSource).toContain("getRecoveryQueue");
  });
});
