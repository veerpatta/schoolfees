import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildBulkUpdatePreview,
  buildLookupResolver,
  type BulkUpdateSnapshotStudent,
} from "@/modules/students/domain/bulk-update/diff";
import { resolveBulkUpdateFields } from "@/modules/students/domain/bulk-update/fields";
import {
  BULK_UPDATE_SHEET_NAME,
  buildBulkUpdateTemplateWorkbook,
  buildTemplateHeaders,
  readBulkUpdateSheet,
  workbookToBuffer,
} from "@/modules/students/domain/bulk-update/workbook";

const lookups = buildLookupResolver({
  classes: [
    { id: "class-1", label: "Class 1 - A" },
    { id: "class-2", label: "Class 2 - B" },
  ],
  routes: [
    { id: "route-1", label: "Sanganer", code: "R1" },
    { id: "route-2", label: "Tonk Road", code: "R2" },
  ],
});

const snapshot: BulkUpdateSnapshotStudent[] = [
  {
    studentId: "11111111-1111-4111-8111-111111111111",
    admissionNo: "SVP-001",
    fullName: "Aarav Sharma",
    values: {
      fatherPhone: "9829000001",
      motherPhone: null,
      class: "class-1",
      route: "route-1",
      status: "active",
      dateOfBirth: "2015-04-20",
      notes: null,
    },
  },
  {
    studentId: "22222222-2222-4222-8222-222222222222",
    admissionNo: "SVP-002",
    fullName: "Diya Verma",
    values: {
      fatherPhone: null,
      motherPhone: "9829000002",
      class: "class-1",
      route: null,
      status: "active",
      dateOfBirth: null,
      notes: "Sibling of SVP-001",
    },
  },
];

const fields = resolveBulkUpdateFields(["fatherPhone", "route", "dateOfBirth"]);

/** Rebuilds a File from a workbook so the read path is exercised for real. */
function toFile(buffer: Buffer, name = "bulk.xlsx") {
  return new File([new Uint8Array(buffer)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function buildTemplateFile() {
  const workbook = await buildBulkUpdateTemplateWorkbook({
    students: snapshot,
    fields,
    labels: {
      classLabelById: lookups.classLabelById,
      routeLabelById: lookups.routeLabelById,
    },
    classLabels: ["Class 1 - A"],
  });

  return toFile(await workbookToBuffer(workbook));
}

describe("bulk update workbook round trip", () => {
  it("writes only the locked columns plus the chosen fields", async () => {
    const file = await buildTemplateFile();
    const table = await readBulkUpdateSheet(file);

    expect(table.headers).toEqual(
      buildTemplateHeaders(fields),
    );
    // Columns follow the catalogue order, not the order the keys were passed
    // in, so a template's shape is stable however the boxes were ticked.
    expect(table.headers).toEqual([
      "Student ID",
      "SR no",
      "Student name",
      "Father phone",
      "Date of birth",
      "Transport route",
    ]);
    expect(table.rows).toHaveLength(2);
  });

  it("pre-fills current values, so an untouched download applies nothing", async () => {
    const file = await buildTemplateFile();
    const table = await readBulkUpdateSheet(file);

    const preview = buildBulkUpdatePreview({ table, fields, snapshot, lookups });

    expect(preview.changeCount).toBe(0);
    expect(preview.errorRowCount).toBe(0);
    expect(preview.unchangedRowCount).toBe(2);
  });

  it("carries edits through the sheet and back into a change set", async () => {
    const workbook = await buildBulkUpdateTemplateWorkbook({
      students: snapshot,
      fields,
      labels: {
        classLabelById: lookups.classLabelById,
        routeLabelById: lookups.routeLabelById,
      },
      classLabels: ["Class 1 - A"],
    });

    const sheet = workbook.Sheets[BULK_UPDATE_SHEET_NAME]!;
    // Row 2 = first student. D = Father phone, E = Date of birth, F = Route.
    XLSX.utils.sheet_add_aoa(sheet, [["9876543210"]], { origin: "D2" });
    XLSX.utils.sheet_add_aoa(sheet, [["Tonk Road"]], { origin: "F2" });
    // Row 3 = second student: give them a date of birth, day-first.
    XLSX.utils.sheet_add_aoa(sheet, [["05-09-2016"]], { origin: "E3" });

    const table = await readBulkUpdateSheet(toFile(await workbookToBuffer(workbook)));
    const preview = buildBulkUpdatePreview({ table, fields, snapshot, lookups });

    expect(preview.errorRowCount).toBe(0);
    expect(preview.changedStudentCount).toBe(2);

    const first = preview.applicableRows.find((row) => row.admissionNo === "SVP-001");
    expect(first?.changes.map((c) => [c.fieldKey, c.toValue])).toEqual([
      ["fatherPhone", "9876543210"],
      ["route", "route-2"],
    ]);

    const second = preview.applicableRows.find((row) => row.admissionNo === "SVP-002");
    expect(second?.changes.map((c) => [c.fieldKey, c.toValue])).toEqual([
      ["dateOfBirth", "2016-09-05"],
    ]);

    // Only the route move is fee-affecting.
    expect(preview.feeImpactStudentIds).toEqual([snapshot[0]!.studentId]);
  });

  it("clears a value only when CLEAR is typed", async () => {
    const workbook = await buildBulkUpdateTemplateWorkbook({
      students: snapshot,
      fields,
      labels: {
        classLabelById: lookups.classLabelById,
        routeLabelById: lookups.routeLabelById,
      },
      classLabels: ["Class 1 - A"],
    });

    const sheet = workbook.Sheets[BULK_UPDATE_SHEET_NAME]!;
    // F = Transport route for the first student.
    XLSX.utils.sheet_add_aoa(sheet, [["CLEAR"]], { origin: "F2" });

    const table = await readBulkUpdateSheet(toFile(await workbookToBuffer(workbook)));
    const preview = buildBulkUpdatePreview({ table, fields, snapshot, lookups });

    const first = preview.applicableRows.find((row) => row.admissionNo === "SVP-001");
    expect(first?.changes).toEqual([
      expect.objectContaining({ fieldKey: "route", toValue: null, toLabel: "—" }),
    ]);
  });

  it("still matches rows after the Student ID column is deleted", async () => {
    const workbook = await buildBulkUpdateTemplateWorkbook({
      students: snapshot,
      fields,
      labels: {
        classLabelById: lookups.classLabelById,
        routeLabelById: lookups.routeLabelById,
      },
      classLabels: ["Class 1 - A"],
    });

    const sheet = workbook.Sheets[BULK_UPDATE_SHEET_NAME]!;
    XLSX.utils.sheet_add_aoa(sheet, [["9876500000"]], { origin: "D3" });
    const rebuilt = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
    // Drop column A entirely, the way a user might.
    const trimmed = rebuilt.map((row) => row.slice(1));
    const nextBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      nextBook,
      XLSX.utils.aoa_to_sheet(trimmed),
      BULK_UPDATE_SHEET_NAME,
    );

    const table = await readBulkUpdateSheet(toFile(await workbookToBuffer(nextBook)));
    const preview = buildBulkUpdatePreview({ table, fields, snapshot, lookups });

    expect(preview.errorRowCount).toBe(0);
    expect(preview.applicableRows[0]?.studentId).toBe(snapshot[1]!.studentId);
  });

  it("rejects an empty file rather than treating it as zero changes", async () => {
    await expect(readBulkUpdateSheet(toFile(Buffer.alloc(0)))).rejects.toThrow(/empty/i);
  });
});
