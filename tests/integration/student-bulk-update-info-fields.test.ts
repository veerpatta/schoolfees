import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildBulkUpdatePreview,
  buildLookupResolver,
  type BulkUpdateSnapshotStudent,
} from "@/modules/students/domain/bulk-update/diff";
import { resolveBulkUpdateFields } from "@/modules/students/domain/bulk-update/fields";
import {
  BULK_UPDATE_LISTS_SHEET_NAME,
  BULK_UPDATE_SHEET_NAME,
  buildBulkUpdateTemplateWorkbook,
  buildBulkUpdateValidations,
  buildTemplateHeaders,
  readBulkUpdateSheet,
  workbookToBuffer,
} from "@/modules/students/domain/bulk-update/workbook";
import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";

/**
 * Bulk editing the 25 information fields.
 *
 * The catalogue generates these from `STUDENT_INFO_FIELDS`, so the risk is not
 * that a field is missing but that the spreadsheet plumbing quietly disagrees
 * with it — a header that does not round-trip, or a dropdown pointing at
 * another field's column, which would offer blood groups in the Gender cell.
 */
const lookups = buildLookupResolver({
  classes: [{ id: "class-1", label: "Class 1 - A" }],
  routes: [{ id: "route-1", label: "Sanganer", code: "R1" }],
});

const snapshot: BulkUpdateSnapshotStudent[] = [
  {
    studentId: "11111111-1111-4111-8111-111111111111",
    admissionNo: "SVP-001",
    fullName: "Aarav Sharma",
    values: {
      gender: "Male",
      category: "OBC",
      aadhaarNo: "111122223333",
      district: "Bhilwara",
      bloodGroup: null,
    },
  },
  {
    studentId: "22222222-2222-4222-8222-222222222222",
    admissionNo: "SVP-002",
    fullName: "Diya Verma",
    values: {
      gender: null,
      category: null,
      aadhaarNo: null,
      district: null,
      bloodGroup: null,
    },
  },
];

const infoFieldKeys = ["gender", "bloodGroup", "category", "aadhaarNo", "district"];

function toFile(buffer: Buffer, name = "bulk.xlsx") {
  return new File([new Uint8Array(buffer)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Rewrites one cell of a downloaded template and hands back an upload File. */
async function editedUpload(
  workbook: Awaited<ReturnType<typeof buildBulkUpdateTemplateWorkbook>>,
  rowIndex: number,
  header: string,
  value: string,
) {
  const grid = XLSX.utils.sheet_to_json<string[]>(
    workbook.Sheets[BULK_UPDATE_SHEET_NAME],
    { header: 1 },
  );
  grid[rowIndex][grid[0].indexOf(header)] = value;

  const editedBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    editedBook,
    XLSX.utils.aoa_to_sheet(grid),
    BULK_UPDATE_SHEET_NAME,
  );

  return toFile(await workbookToBuffer(editedBook));
}

async function buildSheet(keys: readonly string[] = infoFieldKeys) {
  const fields = resolveBulkUpdateFields(keys);
  const workbook = await buildBulkUpdateTemplateWorkbook({
    students: snapshot,
    fields,
    labels: { classLabelById: new Map(), routeLabelById: new Map() },
    classLabels: ["Class 1 - A"],
    allClassLabels: ["Class 1 - A"],
    allRouteLabels: ["Sanganer"],
  });

  return { fields, workbook };
}

describe("bulk update carries the student information fields", () => {
  it("offers every one of the 25 in the catalogue", () => {
    const resolved = resolveBulkUpdateFields(
      STUDENT_INFO_FIELDS.map((field) => field.name),
    );

    expect(resolved).toHaveLength(STUDENT_INFO_FIELDS.length);
    expect(resolved.map((field) => field.header)).toEqual(
      STUDENT_INFO_FIELDS.map((field) => field.header),
    );
  });

  it("writes the locked columns plus the ticked information headers", async () => {
    const { fields, workbook } = await buildSheet();
    const sheet = workbook.Sheets[BULK_UPDATE_SHEET_NAME];
    const [headerRow] = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    expect(headerRow).toEqual(buildTemplateHeaders(fields));
    expect(headerRow).toContain("Aadhaar no");
    expect(headerRow).toContain("District");
  });

  it("pre-fills current values, so an untouched download applies nothing", async () => {
    const { fields, workbook } = await buildSheet();
    const rows = await readBulkUpdateSheet(toFile(await workbookToBuffer(workbook)));
    const preview = buildBulkUpdatePreview({
      table: rows,
      fields,
      snapshot,
      lookups,
    });

    expect(preview.rows.flatMap((row) => row.changes)).toEqual([]);
  });

  it("round-trips an edited Aadhaar and normalises how it was typed", async () => {
    const { fields, workbook } = await buildSheet();
    // Spreadsheets hand Aadhaar over spaced or hyphenated all the time.
    const file = await editedUpload(workbook, 1, "Aadhaar no", "4444 5555 6666");

    const preview = buildBulkUpdatePreview({
      table: await readBulkUpdateSheet(file),
      fields,
      snapshot,
      lookups,
    });
    const changes = preview.rows.flatMap((row) => row.changes);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      column: "aadhaar_no",
      toValue: "444455556666",
    });
  });

  it("rejects a choice value that is not on the list", async () => {
    const { fields, workbook } = await buildSheet();
    const file = await editedUpload(workbook, 1, "Category", "Genral");

    const preview = buildBulkUpdatePreview({
      table: await readBulkUpdateSheet(file),
      fields,
      snapshot,
      lookups,
    });

    expect(preview.rows.flatMap((row) => row.errors).join(" ")).toContain("Genral");
  });

  it("accepts a choice value in any casing and stores the canonical spelling", async () => {
    const { fields, workbook } = await buildSheet();
    const file = await editedUpload(workbook, 2, "Gender", "female");

    const preview = buildBulkUpdatePreview({
      table: await readBulkUpdateSheet(file),
      fields,
      snapshot,
      lookups,
    });
    const changes = preview.rows.flatMap((row) => row.changes);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ column: "gender", toValue: "Female" });
  });
});

describe("choice fields get their own dropdown", () => {
  it("puts each ticked choice list in its own column on the lists sheet", async () => {
    const { workbook } = await buildSheet();
    const listRows = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets[BULK_UPDATE_LISTS_SHEET_NAME],
      { header: 1 },
    );

    // Four fixed lists, then one per ticked choice field, in field order.
    expect(listRows[0].slice(0, 4)).toEqual([
      "Classes",
      "Routes",
      "Record status",
      "New/Old",
    ]);
    expect(listRows[0].slice(4)).toEqual(["Gender", "Blood group", "Category"]);
    // Gender's values sit under Gender's header, not another field's.
    expect(listRows[1][4]).toBe("Male");
    expect(listRows[2][4]).toBe("Female");
    expect(listRows[1][5]).toBe("A+");
  });

  it("builds a validation per choice field, pointed at its own column", async () => {
    const { fields } = await buildSheet();
    const validations = buildBulkUpdateValidations({
      fields,
      classCount: 1,
      routeCount: 1,
      rowCount: snapshot.length,
    });
    const byName = new Map(validations.map((item) => [item.definedName, item]));

    expect(byName.get("VPPS_BU_Choice_gender")?.sourceColumn).toBe(5);
    expect(byName.get("VPPS_BU_Choice_bloodGroup")?.sourceColumn).toBe(6);
    expect(byName.get("VPPS_BU_Choice_category")?.sourceColumn).toBe(7);
    // Aadhaar and District are free text — no dropdown.
    expect(byName.has("VPPS_BU_Choice_aadhaarNo")).toBe(false);
    expect(byName.has("VPPS_BU_Choice_district")).toBe(false);
  });

  it("leaves the dropdown non-strict so CLEAR stays typeable", async () => {
    const { fields } = await buildSheet();
    const validations = buildBulkUpdateValidations({
      fields,
      classCount: 1,
      routeCount: 1,
      rowCount: snapshot.length,
    });

    for (const validation of validations.filter((item) =>
      item.definedName.startsWith("VPPS_BU_Choice_"),
    )) {
      expect(validation.strict).toBe(false);
    }
  });

  it("still produces a workbook Excel can open", async () => {
    const { fields, workbook } = await buildSheet();
    const buffer = await workbookToBuffer(
      workbook,
      buildBulkUpdateValidations({
        fields,
        classCount: 1,
        routeCount: 1,
        rowCount: snapshot.length,
      }),
    );

    const reread = XLSX.read(buffer, { type: "buffer" });
    expect(reread.SheetNames).toContain(BULK_UPDATE_SHEET_NAME);
    expect(reread.SheetNames).toContain(BULK_UPDATE_LISTS_SHEET_NAME);
  });
});
