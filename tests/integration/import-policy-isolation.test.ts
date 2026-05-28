import { describe, expect, it } from "vitest";

import {
  buildAutoColumnMapping,
  getStudentImportColumnMapping,
  studentImportFieldDefinitions,
} from "@/lib/import/mapping";

describe("import isolation from Conventional Discount fields (audit 1.2)", () => {
  it("does not list conventional policy fields in the import field definitions", () => {
    const keys = new Set(studentImportFieldDefinitions.map((field) => field.key));
    expect(keys.has("conventionalPolicy1")).toBe(false);
    expect(keys.has("conventionalPolicy2")).toBe(false);
    expect(keys.has("conventionalFamilyGroup")).toBe(false);
    expect(keys.has("conventionalPolicyNotes")).toBe(false);
  });

  it("auto-mapper ignores headers like 'Policy 1' / 'Family Group' / 'Policy Notes'", () => {
    const mapping = buildAutoColumnMapping([
      "Student Name",
      "Class",
      "SR No",
      "Policy 1",
      "Discount Policy 2",
      "Family Group",
      "Policy Notes",
      "Sibling Group",
    ]);

    expect(mapping.conventionalPolicy1).toBeUndefined();
    expect(mapping.conventionalPolicy2).toBeUndefined();
    expect(mapping.conventionalFamilyGroup).toBeUndefined();
    expect(mapping.conventionalPolicyNotes).toBeUndefined();

    expect(mapping.fullName).toBe("Student Name");
    expect(mapping.classLabel).toBe("Class");
  });

  it("manual mapping submission cannot force conventional discount keys either", () => {
    const formData = new FormData();
    formData.set("mapping:fullName", "Student Name");
    formData.set("mapping:classLabel", "Class");
    formData.set("mapping:conventionalPolicy1", "Policy 1");
    formData.set("mapping:conventionalFamilyGroup", "Family Group");
    formData.set("mapping:conventionalPolicyNotes", "Policy Notes");

    const mapping = getStudentImportColumnMapping(formData);

    expect(mapping.conventionalPolicy1).toBeUndefined();
    expect(mapping.conventionalFamilyGroup).toBeUndefined();
    expect(mapping.conventionalPolicyNotes).toBeUndefined();
    expect(mapping.fullName).toBe("Student Name");
    expect(mapping.classLabel).toBe("Class");
  });
});
