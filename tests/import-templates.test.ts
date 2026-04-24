import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildAddStudentsTemplateWorkbook,
  buildUpdateStudentsTemplateWorkbook,
  workbookToXlsxBuffer,
} from "@/lib/import/templates";

function readSheet(workbook: XLSX.WorkBook, sheetName: string) {
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
  });
}

describe("student import templates", () => {
  it("uses real class and route labels in the add template examples", () => {
    const workbook = buildAddStudentsTemplateWorkbook(
      [{ label: "Class 1" }],
      [{ label: "Main Route (MR)" }],
    );
    const roundTrip = XLSX.read(workbookToXlsxBuffer(workbook), { type: "buffer" });
    const examples = readSheet(roundTrip, "Examples").flat();

    expect(examples).toContain("Class 1");
    expect(examples).toContain("Main Route (MR)");
    expect(examples).not.toContain("TEST CLASS 1");
  });

  it("exports existing student identity columns for update mode", () => {
    const workbook = buildUpdateStudentsTemplateWorkbook([
      {
        studentId: "student-1",
        admissionNo: "SR001",
        fullName: "Asha Sharma",
        classLabel: "Class 1",
        fatherName: "Father",
        fatherPhone: "9999999999",
        transportRouteLabel: "Main Route",
        studentTypeLabel: "Existing",
        tuitionOverride: null,
        transportOverride: null,
        discountAmount: 0,
        lateFeeWaiverAmount: 0,
        otherAdjustmentHead: null,
        otherAdjustmentAmount: null,
        notes: null,
      },
    ]);
    const rows = readSheet(workbook, "Update Students Here");

    expect(rows[0]).toEqual(
      expect.arrayContaining(["Student ID", "SR no", "Student name", "Class"]),
    );
    expect(rows[1]).toEqual(expect.arrayContaining(["student-1", "SR001", "Asha Sharma"]));
  });
});
