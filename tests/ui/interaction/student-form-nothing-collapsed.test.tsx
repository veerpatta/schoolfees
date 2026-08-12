import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { INITIAL_STUDENT_FORM_ACTION_STATE } from "@/lib/students/types";
import type { StudentFormActionState } from "@/lib/students/types";

/**
 * The edit form put 19 of its 27 controls behind three closed `<details>`, one
 * of which held the money. Two consequences, both real:
 *
 *  - a student was charged Rs 14,000 for transport the route picker said they
 *    did not have, because the amount was one click away and nobody clicked;
 *  - the error summary's `#fieldName` anchors could scroll into a hidden panel,
 *    so "please review 2 fields before saving" pointed at nothing.
 *
 * Everything is visible now. Pinned structurally, so a future "let's tidy this
 * up by collapsing the long bits" has to argue with a failing test.
 */
const { StudentForm } = await import("@/components/students/student-form");

const CLASS_OPTIONS = [{ id: "class-5", label: "Class 5", sessionLabel: "TEST-2026-27" }];
const ROUTE_OPTIONS = [
  { id: "route-real", label: "Bhilwara Road", routeCode: "BR1", isActive: true },
];

const EMPTY_VALUES = {
  fullName: "TEST Student",
  classId: "class-5",
  admissionNo: "TEST-001",
  dateOfBirth: "",
  fatherName: "",
  motherName: "",
  fatherPhone: "",
  motherPhone: "",
  address: "",
  transportRouteId: "",
  status: "active",
  studentTypeOverride: "",
  tuitionOverride: "",
  transportOverride: "",
  discountAmount: "",
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

const action = vi.fn(
  async (): Promise<StudentFormActionState> => INITIAL_STUDENT_FORM_ACTION_STATE,
);

function renderForm(overrides: Partial<typeof EMPTY_VALUES> = {}) {
  return render(
    <StudentForm
      mode="edit"
      canEditFinance
      initialValues={{ ...EMPTY_VALUES, ...overrides }}
      classOptions={CLASS_OPTIONS}
      routeOptions={ROUTE_OPTIONS}
      sessionLabel="TEST-2026-27"
      action={action}
    />,
  );
}

describe("student edit form has nothing collapsed", () => {
  it("renders no disclosure panels at all", () => {
    const { container } = renderForm();

    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(container.querySelectorAll("summary")).toHaveLength(0);
  });

  it("shows every field group at once, money included", () => {
    renderForm();

    // One field from each group that used to sit behind a closed disclosure.
    expect(screen.getByLabelText("Mother phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Transport override")).toBeInTheDocument();
    expect(screen.getByLabelText("Tuition override")).toBeInTheDocument();
    expect(screen.getByLabelText("Record status")).toBeInTheDocument();
  });

  it("counts the exceptions in the section header, not on a closed summary", () => {
    const { container } = renderForm({ transportOverride: "14000" });

    expect(container.textContent).toContain("1 set");
  });
});
