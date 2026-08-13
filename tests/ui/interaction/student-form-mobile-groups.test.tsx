import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_STUDENT_INFO_FORM_INPUT } from "@/lib/students/info-fields";
import { INITIAL_STUDENT_FORM_ACTION_STATE } from "@/lib/students/types";
import type { StudentFormActionState } from "@/lib/students/types";

/**
 * The phone group switcher, and the one way it can lose money.
 *
 * The form carries ~50 controls, unusable in a single phone scroll, and
 * disclosure is banned here — see student-form-nothing-collapsed.test.tsx and
 * the Rs 14,000 transport charge that sat behind a closed `<details>`. So the
 * groups became tabs. Tabs bring their own failure: a panel that *unmounts*
 * takes its inputs out of the DOM, those fields stop appearing in FormData, and
 * `updateStudentAction` reads their absence as "the form never offered this" —
 * which is precisely the path that restores, and therefore silently discards,
 * an edit the user actually made.
 *
 * A source grep can see the class name. Only a render can prove the inputs are
 * still there after the tab changes, which is the property that matters.
 */
const { StudentForm } = await import("@/components/students/student-form");

const CLASS_OPTIONS = [{ id: "class-5", label: "Class 5", sessionLabel: "TEST-2026-27" }];
const ROUTE_OPTIONS = [
  { id: "route-real", label: "Bhilwara Road", routeCode: "BR1", isActive: true },
];

const EMPTY_VALUES = {
  ...EMPTY_STUDENT_INFO_FORM_INPUT,
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

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StudentForm
        mode="edit"
        canEditFinance
        initialValues={EMPTY_VALUES}
        classOptions={CLASS_OPTIONS}
        routeOptions={ROUTE_OPTIONS}
        sessionLabel="TEST-2026-27"
        action={action}
      />
    </NextIntlClientProvider>,
  );
}

/** Names drawn from every group, so a dropped panel shows up as a gap. */
const FIELDS_ACROSS_EVERY_GROUP = [
  "fullName", // Student
  "motherPhone", // Parents
  "aadhaarNo", // Info
  "district", // Info
  "tuitionOverride", // Fees
  "status", // Status
];

function postedFieldNames(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) throw new Error("no form rendered");
  return new Set([...new FormData(form).keys()]);
}

describe("student form phone group switcher", () => {
  it("keeps every group's inputs in the DOM before any tab is touched", () => {
    const { container } = renderForm();
    const posted = postedFieldNames(container);

    for (const name of FIELDS_ACROSS_EVERY_GROUP) {
      expect(posted.has(name), `${name} is not in FormData`).toBe(true);
    }
  });

  it("still posts every field after switching to another group", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    // Move to Info, then to Status — two hops, so a panel that only survives
    // the first switch is caught too.
    await user.click(screen.getByRole("tab", { name: "Info" }));
    await user.click(screen.getByRole("tab", { name: "Status" }));

    const posted = postedFieldNames(container);

    for (const name of FIELDS_ACROSS_EVERY_GROUP) {
      expect(
        posted.has(name),
        `${name} vanished from FormData after switching groups — the panel is being unmounted, not hidden`,
      ).toBe(true);
    }
  });

  it("carries an edit made in a group the user has since navigated away from", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    await user.click(screen.getByRole("tab", { name: "Info" }));
    await user.type(screen.getByLabelText("District"), "Bhilwara");

    // Leave the group the edit was made in. The value has to survive.
    await user.click(screen.getByRole("tab", { name: "Student" }));

    const form = container.querySelector("form")!;
    expect(new FormData(form).get("district")).toBe("Bhilwara");
  });

  it("offers one tab per group, with Fees dropped when finance is not editable", () => {
    const { unmount } = renderForm();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim()),
    ).toEqual(["Student", "Parents", "Info", "Fees", "Status"]);

    unmount();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StudentForm
          mode="edit"
          canEditFinance={false}
          initialValues={EMPTY_VALUES}
          classOptions={CLASS_OPTIONS}
          routeOptions={ROUTE_OPTIONS}
          sessionLabel="TEST-2026-27"
          action={action}
        />
      </NextIntlClientProvider>,
    );

    // A teacher has no fee section to switch to, so offering the tab would be
    // a dead end rather than a permission message.
    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim()),
    ).not.toContain("Fees");
  });
});
