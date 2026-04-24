import { describe, expect, it } from "vitest";

import { executeStudentImportDryRun } from "@/lib/import/dryRun";
import { studentImportFieldDefinitions } from "@/lib/import/mapping";

const classes = [
  {
    id: "class-1",
    label: "Class 1",
    aliases: ["class1", "class 1"],
  },
];

const routes = [
  {
    id: "route-1",
    label: "Route A (A)",
    aliases: ["routea", "a", "route a"],
  },
];

const mapping = {
  fullName: "Student Name",
  classLabel: "Class",
  admissionNo: "SR No",
  fatherName: "Father Name",
  customTuitionFeeAmount: "Tuition Override",
  otherAdjustmentHead: "Other Head",
  otherAdjustmentAmount: "Other Amount",
};

describe("student import dry-run", () => {
  it("keeps UAT-relevant fee-profile fields in the import mapping", () => {
    const keys = new Set(studentImportFieldDefinitions.map((field) => field.key));

    expect(keys.has("fullName")).toBe(true);
    expect(keys.has("classLabel")).toBe(true);
    expect(keys.has("admissionNo")).toBe(true);
    expect(keys.has("transportRouteLabel")).toBe(true);
    expect(keys.has("studentTypeOverride")).toBe(true);
    expect(keys.has("customTuitionFeeAmount")).toBe(true);
    expect(keys.has("customTransportFeeAmount")).toBe(true);
    expect(keys.has("discountAmount")).toBe(true);
    expect(keys.has("lateFeeWaiverAmount")).toBe(true);
    expect(keys.has("otherAdjustmentHead")).toBe(true);
    expect(keys.has("otherAdjustmentAmount")).toBe(true);
    expect(keys.has("feeProfileReason")).toBe(true);
    expect(keys.has("notes")).toBe(true);
  });

  it("marks existing SR rows as update rows instead of duplicates", () => {
    const result = executeStudentImportDryRun({
      rows: [
        {
          id: "row-1",
          rowIndex: 2,
          rawPayload: {
            "Student Name": "Asha Sharma",
            Class: "Class 1",
            "SR No": "SR001",
            "Father Name": null,
            "Tuition Override": null,
            "Other Head": null,
            "Other Amount": null,
          },
        },
      ],
      mapping,
      classes,
      routes,
      existingStudents: [
        {
          id: "student-1",
          admissionNo: "SR001",
          fullName: "Asha Sharma",
          classId: "class-1",
          dateOfBirth: null,
        },
      ],
      activeFeeSettingClassIds: new Set(["class-1"]),
    });

    expect(result.rows[0]).toMatchObject({
      status: "valid",
      operation: "update",
      targetStudentId: "student-1",
      duplicateStudentId: "student-1",
      normalizedPayload: {
        fatherName: null,
      },
    });
  });

  it("keeps a second same-file SR row reviewable as a duplicate", () => {
    const result = executeStudentImportDryRun({
      rows: [
        {
          id: "row-1",
          rowIndex: 2,
          rawPayload: {
            "Student Name": "Asha Sharma",
            Class: "Class 1",
            "SR No": "SR010",
          },
        },
        {
          id: "row-2",
          rowIndex: 3,
          rawPayload: {
            "Student Name": "Asha Sharma",
            Class: "Class 1",
            "SR No": "SR010",
          },
        },
      ],
      mapping,
      classes,
      routes,
      existingStudents: [],
      activeFeeSettingClassIds: new Set(["class-1"]),
    });

    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("duplicate");
  });

  it("accepts signed other adjustment amounts", () => {
    const result = executeStudentImportDryRun({
      rows: [
        {
          id: "row-1",
          rowIndex: 2,
          rawPayload: {
            "Student Name": "Asha Sharma",
            Class: "Class 1",
            "SR No": "SR020",
            "Other Head": "Workbook correction",
            "Other Amount": -300,
          },
        },
      ],
      mapping,
      classes,
      routes,
      existingStudents: [],
      activeFeeSettingClassIds: new Set(["class-1"]),
    });

    expect(result.rows[0]).toMatchObject({
      status: "valid",
      normalizedPayload: {
        overrides: {
          otherAdjustmentHead: "Workbook correction",
          otherAdjustmentAmount: -300,
        },
      },
    });
  });
});
