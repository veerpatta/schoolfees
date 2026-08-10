import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { INITIAL_STUDENT_FORM_ACTION_STATE } from "@/lib/students/types";
import type { StudentFormActionState } from "@/lib/students/types";

/**
 * The edit form, for the students the route picker was lying about.
 *
 * Three active students have no transport route and a custom transport amount
 * on their fee override. The picker showed "No transport" — accurate about the
 * route, wrong about the money — and the amount that was actually charging them
 * sat inside a `<details>` panel that renders collapsed. ₹29,500 a year, two
 * clicks away, with nothing on screen suggesting it was there.
 *
 * Rendered assertions rather than source greps: whether a `<details>` is open
 * and what a live-updating line says are not things a string match can see.
 */

const { StudentForm } = await import("@/components/students/student-form");

const CLASS_OPTIONS = [
  { id: "class-5", label: "Class 5", sessionLabel: "TEST-2026-27" },
];

const ROUTE_OPTIONS = [
  { id: "route-real", label: "Bhilwara Road", routeCode: "BR1", isActive: true },
  // The placeholder row that exists in production and is still selectable.
  { id: "route-sentinel", label: "No Transport", routeCode: null, isActive: true },
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
      initialValues={{ ...EMPTY_VALUES, ...overrides }}
      classOptions={CLASS_OPTIONS}
      routeOptions={ROUTE_OPTIONS}
      sessionLabel="TEST-2026-27"
      action={action}
    />,
  );
}

function effectiveLine() {
  return document.querySelector("[data-transport-effective]")?.textContent ?? "";
}

describe("student edit form — transport", () => {
  it("shows the custom amount next to the route picker, not just inside Fee exceptions", () => {
    renderForm({ transportRouteId: "", transportOverride: "14000" });

    // The reported bug: the picker says No transport and nothing contradicts it.
    expect(effectiveLine()).toContain("Custom transport (₹14,000)");
    expect(effectiveLine()).toContain("Fee exceptions");
  });

  it("opens Fee exceptions when the student has one, so the amount is on screen", () => {
    const { container } = renderForm({ transportOverride: "14000" });

    const panels = Array.from(container.querySelectorAll("details"));
    const feeExceptions = panels.find((panel) =>
      panel.querySelector("summary")?.textContent?.includes("Fee exceptions"),
    );

    expect(feeExceptions, "Fee exceptions panel is not rendered").toBeTruthy();
    expect(feeExceptions).toHaveProperty("open", true);
    expect(feeExceptions?.querySelector("summary")?.textContent).toContain("1 set");
  });

  it("leaves Fee exceptions closed when the student has none", () => {
    const { container } = renderForm();

    const feeExceptions = Array.from(container.querySelectorAll("details")).find((panel) =>
      panel.querySelector("summary")?.textContent?.includes("Fee exceptions"),
    );

    expect(feeExceptions).toHaveProperty("open", false);
    expect(effectiveLine()).toContain("No transport");
  });

  it("updates the effective charge as the override is typed", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(effectiveLine()).toContain("No transport");

    await user.type(screen.getByLabelText("Transport override"), "2500");

    expect(effectiveLine()).toContain("Custom transport (₹2,500)");
  });

  it("prefers a real route over the override in the label", async () => {
    const user = userEvent.setup();
    renderForm({ transportOverride: "14000" });

    await user.selectOptions(screen.getByLabelText("Transport route"), "route-real");

    // A real route names itself; the amount belongs to the fee columns, not the
    // route label. See buildTransportRouteLabel.
    expect(effectiveLine()).toContain("Bhilwara Road (BR1)");
    expect(effectiveLine()).not.toContain("Custom transport");
  });

  it("treats the 'No Transport' placeholder route as no route at all", async () => {
    const user = userEvent.setup();
    renderForm({ transportOverride: "13000" });

    await user.selectOptions(screen.getByLabelText("Transport route"), "route-sentinel");

    // Selecting the placeholder must not make the override invisible — that is
    // the second way the original bug happened.
    expect(effectiveLine()).toContain("Custom transport (₹13,000)");
  });

  it("labels the placeholder route so nobody picks it thinking it is a route", () => {
    renderForm();

    const option = screen.getByRole("option", { name: /No Transport — placeholder/ });
    expect(option).toBeTruthy();
  });

  it("keeps the override in the submitted form data", () => {
    const { container } = renderForm({ transportOverride: "14000" });

    const input = container.querySelector<HTMLInputElement>('input[name="transportOverride"]');
    expect(input?.value).toBe("14000");
  });
});
