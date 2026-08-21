import { describe, expect, it } from "vitest";

import { normalizeCellText, parseCell } from "@/modules/students/domain/bulk-update/cells";
import {
  buildBulkUpdatePreview,
  buildLookupResolver,
  type BulkUpdateSnapshotStudent,
} from "@/modules/students/domain/bulk-update/diff";
import { getBulkUpdateField, resolveBulkUpdateFields } from "@/modules/students/domain/bulk-update/fields";

const lookups = buildLookupResolver({
  classes: [
    { id: "class-1", label: "Class 1 - A" },
    { id: "class-2", label: "Class 2" },
  ],
  routes: [
    { id: "route-1", label: "Sanganer", code: "R1" },
    { id: "route-2", label: "Tonk Road", code: "R2" },
  ],
});

function field(key: string) {
  const found = getBulkUpdateField(key);
  if (!found) throw new Error(`missing field ${key}`);
  return found;
}

describe("bulk update cell parsing", () => {
  it("treats a blank cell as leave-unchanged", () => {
    expect(parseCell(field("fatherPhone"), "", lookups)).toEqual({ kind: "skip" });
    expect(parseCell(field("fatherPhone"), "   ", lookups)).toEqual({ kind: "skip" });
    expect(parseCell(field("fatherPhone"), null, lookups)).toEqual({ kind: "skip" });
    expect(parseCell(field("fatherPhone"), undefined, lookups)).toEqual({ kind: "skip" });
  });

  it("only blanks a value when CLEAR is typed, in any casing", () => {
    expect(parseCell(field("motherPhone"), "CLEAR", lookups)).toEqual({ kind: "set", value: null });
    expect(parseCell(field("motherPhone"), " clear ", lookups)).toEqual({
      kind: "set",
      value: null,
    });
  });

  it("refuses to clear a column every student must have", () => {
    const status = parseCell(field("status"), "CLEAR", lookups);
    const klass = parseCell(field("class"), "CLEAR", lookups);

    expect(status.kind).toBe("error");
    expect(klass.kind).toBe("error");
  });

  it("rejects a malformed phone rather than storing it", () => {
    expect(parseCell(field("fatherPhone"), "not-a-number", lookups).kind).toBe("error");
    expect(parseCell(field("fatherPhone"), "9829012345", lookups)).toEqual({
      kind: "set",
      value: "9829012345",
    });
  });

  it("accepts both ISO and day-first dates and rejects impossible ones", () => {
    expect(parseCell(field("dateOfBirth"), "2015-04-20", lookups)).toEqual({
      kind: "set",
      value: "2015-04-20",
    });
    expect(parseCell(field("dateOfBirth"), "20-04-2015", lookups)).toEqual({
      kind: "set",
      value: "2015-04-20",
    });
    expect(parseCell(field("dateOfBirth"), "20/04/2015", lookups)).toEqual({
      kind: "set",
      value: "2015-04-20",
    });
    // Date() would silently roll this to 02 March.
    expect(parseCell(field("dateOfBirth"), "31-02-2015", lookups).kind).toBe("error");
    expect(parseCell(field("dateOfBirth"), "hello", lookups).kind).toBe("error");
  });

  it("reads an Excel Date cell without shifting the day across timezones", () => {
    expect(normalizeCellText(new Date(Date.UTC(2015, 3, 20)))).toBe("2015-04-20");
  });

  it("resolves classes and routes by label, and routes by code", () => {
    expect(parseCell(field("class"), "class 1 - a", lookups)).toEqual({
      kind: "set",
      value: "class-1",
    });
    expect(parseCell(field("route"), "R2", lookups)).toEqual({ kind: "set", value: "route-2" });
    expect(parseCell(field("class"), "Class 9", lookups).kind).toBe("error");
  });

  it("accepts New/Existing, and the Old wording the app shows on screen", () => {
    expect(parseCell(field("studentType"), "New", lookups)).toEqual({
      kind: "set",
      value: "new",
    });
    expect(parseCell(field("studentType"), "existing", lookups)).toEqual({
      kind: "set",
      value: "existing",
    });
    // The student page labels a continuing student "Old", so staff type that.
    expect(parseCell(field("studentType"), "Old", lookups)).toEqual({
      kind: "set",
      value: "existing",
    });
    expect(parseCell(field("studentType"), "maybe", lookups).kind).toBe("error");
  });

  it("refuses to clear the New/Old flag", () => {
    // There is no unset state the fee engine could read: a missing value bills
    // as Existing, which is a silent Rs 600 discount rather than a blank.
    expect(parseCell(field("studentType"), "CLEAR", lookups).kind).toBe("error");
  });

  it("accepts a status by label or by stored value", () => {
    expect(parseCell(field("status"), "Left", lookups)).toEqual({ kind: "set", value: "left" });
    expect(parseCell(field("status"), "active", lookups)).toEqual({ kind: "set", value: "active" });
    expect(parseCell(field("status"), "gone", lookups).kind).toBe("error");
  });
});

const snapshot: BulkUpdateSnapshotStudent[] = [
  {
    studentId: "s-1",
    admissionNo: "SVP-001",
    fullName: "Aarav",
    values: { fatherPhone: "9829000001", route: null, class: "class-1" },
  },
  {
    studentId: "s-2",
    admissionNo: "SVP-002",
    fullName: "Diya",
    values: { fatherPhone: "9829000002", route: "route-1", class: "class-1" },
  },
];

const fields = resolveBulkUpdateFields(["fatherPhone", "route"]);

function preview(headers: string[], rows: unknown[][]) {
  return buildBulkUpdatePreview({
    table: { headers, rows },
    fields,
    snapshot,
    lookups,
  });
}

describe("bulk update preview", () => {
  it("reports only cells that genuinely differ", () => {
    const result = preview(
      ["Student ID", "SR no", "Father phone", "Transport route"],
      [
        // same phone as stored -> not a change
        ["s-1", "SVP-001", "9829000001", "Sanganer"],
        ["s-2", "SVP-002", "9999999999", "Sanganer"],
      ],
    );

    expect(result.changeCount).toBe(2);
    expect(result.changedStudentCount).toBe(2);
    const first = result.applicableRows.find((row) => row.studentId === "s-1");
    expect(first?.changes.map((c) => c.fieldKey)).toEqual(["route"]);
    const second = result.applicableRows.find((row) => row.studentId === "s-2");
    expect(second?.changes.map((c) => c.fieldKey)).toEqual(["fatherPhone"]);
  });

  it("leaves untouched every field whose cell is blank", () => {
    const result = preview(
      ["Student ID", "SR no", "Father phone", "Transport route"],
      [["s-2", "SVP-002", "", ""]],
    );

    expect(result.changeCount).toBe(0);
    expect(result.unchangedRowCount).toBe(1);
    expect(result.errorRowCount).toBe(0);
  });

  it("matches on SR no when the Student ID column was deleted", () => {
    const result = preview(
      ["SR no", "Father phone"],
      [["svp-002", "9111111111"]],
    );

    expect(result.applicableRows[0]?.studentId).toBe("s-2");
  });

  it("flags a row whose student is not in this class list", () => {
    const result = preview(["SR no", "Father phone"], [["SVP-999", "9111111111"]]);

    expect(result.errorRowCount).toBe(1);
    expect(result.applicableRows).toHaveLength(0);
    expect(result.rows[0]?.errors[0]).toContain("SVP-999");
  });

  it("applies a row all-or-nothing when one of its cells is invalid", () => {
    const result = preview(
      ["Student ID", "Father phone", "Transport route"],
      [["s-1", "garbage", "Tonk Road"]],
    );

    expect(result.errorRowCount).toBe(1);
    // The valid route change on the same row must NOT slip through.
    expect(result.applicableRows).toHaveLength(0);
    expect(result.changeCount).toBe(0);
  });

  it("keeps only the first row when a student is listed twice", () => {
    const result = preview(
      ["Student ID", "Father phone"],
      [
        ["s-1", "9111111111"],
        ["s-1", "9222222222"],
      ],
    );

    expect(result.applicableRows).toHaveLength(1);
    expect(result.applicableRows[0]?.changes[0]?.toValue).toBe("9111111111");
    expect(result.errorRowCount).toBe(1);
  });

  it("ignores blank padding rows left at the bottom of the sheet", () => {
    const result = preview(
      ["Student ID", "Father phone"],
      [
        ["s-1", "9111111111"],
        ["", ""],
        [null, null],
      ],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.errorRowCount).toBe(0);
  });

  it("collects students needing a dues recalculation", () => {
    const result = preview(
      ["Student ID", "Father phone", "Transport route"],
      [
        ["s-1", "9111111111", "Tonk Road"],
        ["s-2", "9222222222", ""],
      ],
    );

    // s-1 changed route (fee-affecting); s-2 only changed a phone.
    expect(result.feeImpactStudentIds).toEqual(["s-1"]);
  });

  it("ignores a template column the user deleted", () => {
    const result = preview(["Student ID", "Father phone"], [["s-2", "9333333333"]]);

    expect(result.applicableRows[0]?.changes.map((c) => c.fieldKey)).toEqual(["fatherPhone"]);
  });
});

describe("New/Old in the preview", () => {
  const typeFields = resolveBulkUpdateFields(["studentType"]);
  // A student with no fee-override row bills as Existing, so that is what the
  // snapshot reports — writing "Existing" for them must be a no-op, not a
  // change that would create a pointless override row.
  const typeSnapshot: BulkUpdateSnapshotStudent[] = [
    { studentId: "s-1", admissionNo: "SVP-001", fullName: "Aarav", values: { studentType: "existing" } },
    { studentId: "s-2", admissionNo: "SVP-002", fullName: "Diya", values: { studentType: "new" } },
  ];

  function typePreview(rows: unknown[][]) {
    return buildBulkUpdatePreview({
      table: { headers: ["Student ID", "New/Old"], rows },
      fields: typeFields,
      snapshot: typeSnapshot,
      lookups,
    });
  }

  it("reports no change when the sheet repeats the stored type", () => {
    const result = typePreview([
      ["s-1", "Existing"],
      ["s-2", "New"],
    ]);

    expect(result.changeCount).toBe(0);
    expect(result.feeImpactStudentIds).toEqual([]);
  });

  it("shows a flip with readable labels and marks the fee impact", () => {
    const result = typePreview([["s-1", "New"]]);

    expect(result.applicableRows[0]?.changes).toEqual([
      expect.objectContaining({
        fieldKey: "studentType",
        fromLabel: "Existing",
        toLabel: "New",
        toValue: "new",
        column: "student_type_override",
        target: "feeOverride",
        affectsFees: true,
      }),
    ]);
    expect(result.feeImpactStudentIds).toEqual(["s-1"]);
  });

  it("treats Old in the sheet as the same value as Existing", () => {
    expect(typePreview([["s-1", "Old"]]).changeCount).toBe(0);
  });
});
