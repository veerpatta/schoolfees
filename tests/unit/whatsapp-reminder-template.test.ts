import { describe, expect, it } from "vitest";

import { toWhatsappDestination } from "@/lib/whatsapp/phone";
import {
  buildReminderParams,
  renderReminderPreview,
  FEE_REMINDER_DEADLINE_LABEL,
  FEE_REMINDER_PARAM_ORDER,
  FEE_REMINDER_TEMPLATE_DEADLINE,
} from "@/lib/whatsapp/reminder-template";

/**
 * The two things here that cost real money when they break: the slot count and
 * order the Meta-approved template expects, and which digits become a phone
 * number a stranger might answer.
 */

const VALUES = {
  parentName: "Ramesh Kumar",
  studentName: "Anjali Kumar",
  studentClass: "Class 8",
  dueAmount: 14750,
};

describe("buildReminderParams", () => {
  it("fills exactly four slots, in the order the template documents", () => {
    // AiSensy rejects five with "Template params does not match the campaign",
    // which is how the count was established in the first place.
    const params = buildReminderParams(VALUES);

    expect(params).toHaveLength(4);
    expect(FEE_REMINDER_PARAM_ORDER).toHaveLength(4);
    expect(params).toEqual([
      VALUES.parentName,
      VALUES.studentName,
      VALUES.studentClass,
      "14,750",
    ]);
  });

  it("keeps the documented order and the built order in step", () => {
    // The constant is the human-readable record of the slot order. If someone
    // reorders the return without reordering it, this is what notices.
    const params = buildReminderParams(VALUES);
    const byDocumentedOrder = FEE_REMINDER_PARAM_ORDER.map((key) =>
      key === "dueAmount" ? "14,750" : VALUES[key],
    );

    expect(params).toEqual(byDocumentedOrder);
  });

  it("sends the amount as bare grouped digits, because the template supplies the unit", () => {
    // The approved body already reads "देय राशि: रु. {{4}}". A glyph here would
    // arrive doubled.
    const [, , , amount] = buildReminderParams({ ...VALUES, dueAmount: 134750 });

    expect(amount).toBe("1,34,750");
    expect(amount).not.toContain("₹");
    expect(amount).not.toContain("रु");
  });
});

describe("renderReminderPreview", () => {
  it("quotes exactly what the params carry", () => {
    const preview = renderReminderPreview({ ...VALUES, sessionLabel: "2026-27" });
    const [parentName, studentName, studentClass, amount] = buildReminderParams(VALUES);

    expect(preview).toContain(parentName);
    expect(preview).toContain(studentName);
    expect(preview).toContain(studentClass);
    expect(preview).toContain(amount);
    expect(preview).toContain("2026-27");
  });

  it("prints the same deadline the send guard enforces", () => {
    // The preview used to hardcode this date independently, so moving the guard
    // would have left the preview promising the old one.
    const preview = renderReminderPreview({ ...VALUES, sessionLabel: "2026-27" });

    expect(preview).toContain(FEE_REMINDER_DEADLINE_LABEL);
    expect(FEE_REMINDER_TEMPLATE_DEADLINE).toBe("2026-08-25");
    expect(FEE_REMINDER_DEADLINE_LABEL).toContain("2026");
  });
});

describe("toWhatsappDestination", () => {
  it.each([
    ["9352205884", "+919352205884"],
    ["09352205884", "+919352205884"],
    ["919352205884", "+919352205884"],
    ["+91 93522 05884", "+919352205884"],
    ["7976199548", "+917976199548"],
  ])("normalises %s", (input, expected) => {
    expect(toWhatsappDestination(input)).toBe(expected);
  });

  it.each<{ input: string | null; reason: string }>([
    { input: "", reason: "empty" },
    { input: null, reason: "null" },
    { input: "12345", reason: "too short" },
    { input: "5352205884", reason: "landline-style leading digit" },
    { input: "93522058840", reason: "eleven digits, no leading zero" },
    { input: "not a number", reason: "letters" },
  ])("refuses $reason", ({ input }) => {
    // Returning null is load-bearing: a message to a wrong number is a stranger
    // receiving a child's name and the family's fee balance.
    expect(toWhatsappDestination(input)).toBeNull();
  });
});
