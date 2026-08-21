import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentInfoGroupInputs } from "@/modules/students/ui/student-info-inputs";
import { HOUSE_OPTIONS } from "@/modules/students/domain/info-fields";
import messages from "@/messages/en.json";

/**
 * A stored value the option list does not contain must survive being looked at.
 *
 * A native <select> handed a defaultValue it has no <option> for selects the
 * FIRST option instead — here the blank "not recorded" — so opening a student
 * and pressing Save silently erased the field. This is not hypothetical: 22
 * students on the live roll carry a category of "GENERAL" or "SBC", and neither
 * is in CATEGORY_OPTIONS.
 */
function renderGroup(group: "identity" | "school", values: Record<string, string>) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StudentInfoGroupInputs group={group} values={values} />
    </NextIntlClientProvider>,
  );
}

describe("student info selects", () => {
  it("keeps a category the option list does not know about", () => {
    renderGroup("identity", { category: "SBC" });

    const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: "SBC" })).toBeInTheDocument();
    // The point of the option existing at all: the field still holds its value.
    expect(select.value).toBe("SBC");
  });

  it("does not offer a duplicate option when the value IS in the list", () => {
    renderGroup("identity", { category: "OBC" });

    const select = screen.getByLabelText(/category/i) as HTMLSelectElement;
    expect(within(select).getAllByRole("option", { name: "OBC" })).toHaveLength(1);
    expect(select.value).toBe("OBC");
  });

  it("offers the school's four houses, untranslated", () => {
    renderGroup("school", { house: "Rana Kumbha" });

    const select = screen.getByLabelText(/house/i) as HTMLSelectElement;
    for (const house of HOUSE_OPTIONS) {
      expect(within(select).getByRole("option", { name: house })).toBeInTheDocument();
    }
    expect(select.value).toBe("Rana Kumbha");
  });

  it("keeps a house the list does not know about", () => {
    // The three TEST- students carry Blue / Gandhi / Tagore from older fixtures.
    renderGroup("school", { house: "Tagore" });

    const select = screen.getByLabelText(/house/i) as HTMLSelectElement;
    expect(select.value).toBe("Tagore");
  });
});
