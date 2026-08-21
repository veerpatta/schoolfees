import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("AI context export coverage", () => {
  it("keeps recovery and carry-forward context wired into the AI workbook bundle", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/protected/exports/[exportType]/route.ts"),
      "utf8",
    );

    expect(routeSource).toContain('"Recovery Follow-Up"');
    expect(routeSource).toContain('"Previous Year Dues"');
    expect(routeSource).toContain('"Left Student Recovery"');
    expect(routeSource).toContain("getContactSummariesForStudents");
    expect(routeSource).toContain("getPrevYearDuesCollectionRows");
    expect(routeSource).toContain("getRecoveryQueue");
  });

  // The Students sheet used to emit phones but not the names behind them, and
  // none of the rest of the student master. It is meant to be the complete
  // stored record so the bundle can answer questions without a second export.
  it("exports the whole student master, not just the fee projection", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/protected/exports/[exportType]/route.ts"),
      "utf8",
    );

    for (const column of [
      '"Student ID"',
      '"Father name"',
      '"Mother name"',
      '"Date of birth"',
      '"Email"',
      '"Address"',
      '"Joined on"',
      '"Left on"',
      '"Family group"',
      '"Guardian name"',
      '"Guardian phone"',
      '"Sibling order"',
      '"Student notes"',
      '"Has photo"',
      '"Record created at"',
      '"Record updated at"',
    ]) {
      expect(routeSource).toContain(column);
    }

    // Sourced from the tables, since the financials view carries none of these.
    expect(routeSource).toContain("studentDetailById");
    expect(routeSource).toContain("familyByStudentId");
    expect(routeSource).toContain("student_family_members");
  });
});
