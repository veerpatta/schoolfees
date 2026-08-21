import { describe, expect, it } from "vitest";

import { ADD_TEMPLATE_HEADERS, UPDATE_TEMPLATE_HEADERS } from "@/modules/imports/domain/templates";
import { buildAutoColumnMapping, studentImportFieldDefinitions } from "@/modules/imports/domain/mapping";
import { BULK_UPDATE_FIELDS, getBulkUpdateField } from "@/modules/students/domain/bulk-update/fields";
import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";

/**
 * The information fields now cross three spreadsheet surfaces — the Student
 * Master export, the import template, and the bulk-update sheet — and the only
 * thing joining them is the column header string.
 *
 * That makes the header load-bearing in a way a label never was. An export that
 * writes "Aadhaar no" and an importer that only recognises "Aadhaar number"
 * looks like a working round trip right up until the re-upload silently drops
 * the column, which reads to the office as "the app lost my data".
 *
 * So: one catalogue, and these assert the three surfaces actually read it.
 */
describe("student information round trip", () => {
  it("gives every field a non-empty, unique header", () => {
    const headers = STUDENT_INFO_FIELDS.map((field) => field.header);

    for (const header of headers) {
      expect(header.trim()).not.toBe("");
    }

    expect(new Set(headers).size).toBe(headers.length);
  });

  it("puts every field in both import templates", () => {
    for (const field of STUDENT_INFO_FIELDS) {
      expect(ADD_TEMPLATE_HEADERS, `${field.name} missing from Add template`).toContain(
        field.header,
      );
      expect(
        UPDATE_TEMPLATE_HEADERS,
        `${field.name} missing from Update template`,
      ).toContain(field.header);
    }
  });

  it("keeps the template dropdown columns where the validations expect them", () => {
    // buildStudentTemplateValidations pins class/route/New-Old/policy to fixed
    // column numbers. The information columns are appended, so these indexes
    // must not move — a shifted dropdown attaches to the wrong column silently.
    expect(ADD_TEMPLATE_HEADERS[1]).toBe("Class");
    expect(ADD_TEMPLATE_HEADERS[5]).toBe("Route");
    expect(ADD_TEMPLATE_HEADERS[6]).toBe("New/Old");
    expect(UPDATE_TEMPLATE_HEADERS[3]).toBe("Class");
    expect(UPDATE_TEMPLATE_HEADERS[6]).toBe("Route");
    expect(UPDATE_TEMPLATE_HEADERS[7]).toBe("New/Old");
  });

  it("auto-maps a re-uploaded template back onto its own fields", () => {
    // The exact round trip the office does: download, edit, upload.
    const mapping = buildAutoColumnMapping([...UPDATE_TEMPLATE_HEADERS]);

    for (const field of STUDENT_INFO_FIELDS) {
      expect(mapping[field.name], `${field.name} did not auto-map`).toBe(field.header);
    }
  });

  it("auto-maps the spellings a real register uses", () => {
    const mapping = buildAutoColumnMapping([
      "Aadhar No",
      "PIN Code",
      "Blood Grp",
      "Emergency Contact",
    ]);

    expect(mapping.aadhaarNo).toBe("Aadhar No");
    expect(mapping.pincode).toBe("PIN Code");
    expect(mapping.bloodGroup).toBe("Blood Grp");
    expect(mapping.emergencyContactName).toBe("Emergency Contact");
  });

  it("declares every field as an importable, optional column", () => {
    for (const field of STUDENT_INFO_FIELDS) {
      const definition = studentImportFieldDefinitions.find(
        (item) => item.key === field.name,
      );

      expect(definition, `${field.name} is not importable`).toBeTruthy();
      // None of them may ever become required: a school half-way through
      // filling its register must still be able to upload.
      expect(definition?.required).toBe(false);
    }
  });

  it("offers every field in bulk update, with no fee impact", () => {
    for (const field of STUDENT_INFO_FIELDS) {
      const bulkField = getBulkUpdateField(field.name);

      expect(bulkField, `${field.name} is not bulk-editable`).toBeTruthy();
      expect(bulkField?.header).toBe(field.header);
      expect(bulkField?.column).toBe(field.column);
      // Correcting an Aadhaar must never regenerate dues.
      expect(bulkField?.affectsFees).toBe(false);
      // Every information field is optional, so every one can be cleared.
      expect(bulkField?.clearable).toBe(true);
    }
  });

  it("keeps bulk-update headers unique across the whole catalogue", () => {
    // An uploaded sheet is matched on the header, so a collision between an
    // information column and an existing one would write to the wrong column.
    const headers = BULK_UPDATE_FIELDS.map((field) => field.header);

    expect(new Set(headers).size).toBe(headers.length);
  });
});
