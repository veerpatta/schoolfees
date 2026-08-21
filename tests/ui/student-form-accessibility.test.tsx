import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_STUDENT_INFO_FORM_INPUT } from "@/modules/students/domain/info-fields";
import type { StudentFormActionState } from "@/modules/students/domain/types";

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "src/messages", "en.json"), "utf-8"),
);

const useActionState = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof React>("react");

  return {
    ...actual,
    useActionState: (...args: unknown[]) => useActionState(...args),
  };
});

const initialValues = {
  ...EMPTY_STUDENT_INFO_FORM_INPUT,
  fullName: "",
  classId: "",
  admissionNo: "",
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
  discountAmount: "",
  lateFeeWaiverAmount: "",
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
  photoPath: "",
};

describe("student form accessibility", () => {
  beforeEach(() => {
    useActionState.mockReset();
  });

  it("connects server field errors to controls and an error summary", async () => {
    const state: StudentFormActionState = {
      status: "error",
      message: "Review the highlighted student details.",
      studentId: null,
      fieldErrors: {
        fullName: "Student name is required.",
        classId: "Class is required.",
      },
      submittedValues: initialValues,
    };
    useActionState.mockReturnValue([state, vi.fn(), false]);

    const { StudentForm } = await import("@/modules/students/ui/student-form");
    const html = renderToStaticMarkup(
      // The student information fieldset reads its labels from the `Students`
      // namespace, so the form now needs the intl context.
      <NextIntlClientProvider locale="en" messages={messages}>
        <StudentForm
          mode="add"
          classOptions={[{ id: "class-1", label: "Class 1", sessionLabel: "TEST-2026-27" }]}
          routeOptions={[]}
          sessionLabel="TEST-2026-27"
          initialValues={initialValues}
          action={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Please review 2 fields before saving.");
    expect(html).toContain('id="fullName-error"');
    expect(html).toContain('id="classId-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="fullName-error"');
    expect(html).toContain('aria-describedby="classId-error"');
  });
});
