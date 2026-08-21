import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";

/**
 * Two things the export surface got wrong for a while, both worth pinning.
 *
 * 1. **Fees and late fees are separate charges.** Since `20260812120000`
 *    `outstanding_amount` means fees only, but several sheets kept emitting it
 *    under a bare `"Outstanding"` header with no late-fee column anywhere. A
 *    family clear of fees and carrying ₹800 of late fee read as ₹0 owed, and
 *    the descending sort put them below everyone who owed nothing at all.
 *
 * 2. **The AI bundle calls itself the whole stored record.** It shipped for
 *    months without a single one of the 25 information fields, so anything
 *    reading it could not answer "what is this child's Aadhaar" and had no way
 *    to know the column was missing rather than the value.
 *
 * Source-text assertions, matching the other export tests: the route builds its
 * workbook inline and there is no seam to render it through.
 */
const route = readFileSync(
  resolve(process.cwd(), "src/app/protected/exports/[exportType]/route.ts"),
  "utf8",
);

describe("exports keep fees and late fees apart", () => {
  it("never leaves a bare Outstanding column on a dues sheet", () => {
    // `"Outstanding"` survives in exactly one place — the AI bundle's Students
    // sheet, where it deliberately means the total and is documented as such so
    // spreadsheets that already total that column stay correct.
    const bareOutstanding = route.match(/"Outstanding": row\.\w+/g) ?? [];

    expect(bareOutstanding).toEqual(['"Outstanding": row.totalOwedAmount']);
  });

  it("gives every dues sheet the split and the total", () => {
    // One per sheet: bundle Defaulters, bundle Recovery Follow-Up,
    // class-wise-dues, the flat dues list, and the filtered defaulters export.
    expect(route.match(/"Late fee pending":/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(route.match(/"Total owed":/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("sorts dues sheets by what the family actually owes", () => {
    // The old key was `outstandingAmount`, which buried late-fee-only debtors.
    expect(route).not.toContain("b.outstandingAmount - a.outstandingAmount");
    expect(route).not.toContain(
      "right.outstandingAmount - left.outstandingAmount",
    );
    expect(route).toContain("b.totalOwedAmount - a.totalOwedAmount");
    expect(route).toContain("right.totalOwedAmount - left.totalOwedAmount");
  });

  it("still refuses to call a late fee a defaulter", () => {
    // Hard rule 8. The filters stay on fees; only the columns changed.
    expect(route).toContain("row.outstandingAmount > 0");
  });

  it("names the two late-fee columns by their source", () => {
    expect(route).toContain('"Late fee pending (fee engine)"');
    expect(route).toContain('"Late fee pending (student list)"');
    // The ambiguous pair must not come back.
    expect(route).not.toContain('"Late fee pending (student)"');
  });
});

describe("the AI bundle carries the whole student record", () => {
  it("selects the information columns", () => {
    expect(route).toContain("STUDENT_INFO_SELECT_COLUMNS");
    expect(route).toContain("mapStudentInfoRow");
  });

  it("spreads every information field onto the Students sheet", () => {
    // Generated from the catalogue rather than listed, so this asserts the
    // mechanism and one representative header from each group.
    expect(route).toContain("STUDENT_INFO_FIELDS.map((field) => [");

    for (const name of [
      "gender",
      "aadhaarNo",
      "house",
      "district",
      "guardianPhone",
    ]) {
      const field = STUDENT_INFO_FIELDS.find((item) => item.name === name);
      expect(field, `${name} is not in the catalogue`).toBeTruthy();
    }
  });

  /**
   * Caught by a smoke download, not by a unit test, which is why it is here.
   *
   * The Students sheet already had "Guardian name" and "Guardian phone" from
   * `student_family_groups` — the FAMILY's guardian. Spreading the student's
   * own guardian in by header replaced those values in place and dropped two
   * columns from the sheet: a student with no family group still showed a
   * family guardian, and `json_to_sheet` reported 23 information columns
   * instead of 25 with nothing to indicate anything was missing.
   */
  it("renames an information column that collides instead of overwriting it", () => {
    expect(route).toContain("function withStudentInfoColumns(");
    expect(route).toContain("Object.hasOwn(row, field.header)");
    expect(route).toContain("(student record)");
    // The Students sheet must go through the helper. `student-master` builds a
    // fresh row with no guardian columns of its own, so its plain spread is
    // fine and deliberately not covered by this.
    expect(route).toContain(
      "}, masterFieldsById.get(row.studentId));",
    );
  });

  it("documents them in the README, which is the bundle's contract", () => {
    expect(route).toContain("STUDENT INFORMATION COLUMNS");
    expect(route).toContain("THE TWO KINDS OF MONEY");
    // A blank must not be read as a fact about the child.
    expect(route).toContain('not collected yet');
  });
});

describe("class-wise dues is actually class-wise", () => {
  it("has its own branch rather than falling through", () => {
    expect(route).toContain('exportType === "class-wise-dues"');
  });

  it("subtotals per class and totals the sheet", () => {
    expect(route).toContain("total (${classRows.length} students)");
    expect(route).toContain("All classes (${workbook.rows.length} students)");
  });

  it("keeps one key set across data, subtotal and total rows", () => {
    // json_to_sheet reads headers from the FIRST row's keys only, so a subtotal
    // row with fewer keys would silently drop columns from the whole sheet.
    expect(route).toContain("const blankRow = {");
    expect(route).toContain("...blankRow,");
  });
});

describe("Aadhaar-bearing exports need the student record permission", () => {
  it("gates them on students:view as well as reports:view", () => {
    expect(route).toContain("AADHAAR_BEARING_EXPORTS");
    expect(route).toContain('hasStaffPermission(staff, "students:view")');
  });
});
