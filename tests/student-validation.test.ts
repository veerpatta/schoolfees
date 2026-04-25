import { describe, expect, it } from "vitest";

import { validateStudentInput } from "@/lib/students/validation";

const classIds = new Set(["class-1"]);
const routeIds = new Set(["route-1"]);

function baseInput(overrides: Record<string, string> = {}) {
  return {
    fullName: "Asha Sharma",
    classId: "class-1",
    admissionNo: "SR001",
    dateOfBirth: "",
    fatherName: "",
    motherName: "",
    fatherPhone: "",
    motherPhone: "",
    address: "",
    transportRouteId: "",
    status: "active",
    studentTypeOverride: "existing",
    tuitionOverride: "",
    transportOverride: "",
    discountAmount: "0",
    lateFeeWaiverAmount: "0",
    otherAdjustmentHead: "",
    otherAdjustmentAmount: "",
    feeProfileReason: "",
    feeProfileNotes: "",
    conventionalPolicyIds: [],
    conventionalDiscountReason: "",
    conventionalDiscountNotes: "",
    conventionalDiscountFamilyGroup: "",
    conventionalDiscountManualOverrideReason: "",
    notes: "",
    ...overrides,
  };
}

describe("student validation", () => {
  it("requires student name, SR no, class, record status, and new/existing profile by default", () => {
    const result = validateStudentInput(baseInput(), { classIds, routeIds });

    expect(result.ok).toBe(true);
  });

  it("allows blank SR no when the create workflow will generate a temporary SR no", () => {
    const result = validateStudentInput(baseInput({ admissionNo: "" }), {
      classIds,
      routeIds,
      allowBlankAdmissionNo: true,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        admissionNo: "",
      },
    });
  });

  it("reports the three main missing entry fields clearly", () => {
    const result = validateStudentInput(
      baseInput({
        fullName: "",
        classId: "",
        admissionNo: "",
      }),
      { classIds, routeIds },
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.fieldErrors.fullName).toBe("Student name is required.");
      expect(result.fieldErrors.classId).toBe("Class is required.");
      expect(result.fieldErrors.admissionNo).toBe("SR no is required.");
    }
  });

  it("allows signed other adjustment amounts when a head is supplied", () => {
    const result = validateStudentInput(
      baseInput({
        otherAdjustmentHead: "Workbook correction",
        otherAdjustmentAmount: "-500",
      }),
      { classIds, routeIds },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        otherAdjustmentHead: "Workbook correction",
        otherAdjustmentAmount: -500,
      },
    });
  });

  it("rejects a class outside the active Fee Setup session set", () => {
    const result = validateStudentInput(baseInput({ classId: "class-test" }), {
      classIds,
      routeIds,
      sessionLabel: "2026-27",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.fieldErrors.classId).toBe("Please choose an active class for 2026-27.");
    }
  });
});
