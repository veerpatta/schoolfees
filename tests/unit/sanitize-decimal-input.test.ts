import { describe, expect, it } from "vitest";

import { sanitizeDecimalInput } from "@/lib/payments/payment-desk-client-helpers";

/**
 * Every character typed into the mobile amount field passes through here.
 *
 * This suite replaces `tests/unit/money-keypad.test.ts`, deleted with the
 * on-screen keypad it covered. The regression that test existed for is not
 * about the keypad at all — it is about a live payment amount silently
 * changing magnitude. An earlier draft extracted digits only, so "7500.5"
 * became "75005" on the next keystroke: a 100x error on a receipt. With the
 * keypad gone this function is the ONLY thing standing between a typed figure
 * and the posted amount, so the cases move here rather than disappearing.
 */
describe("sanitizeDecimalInput", () => {
  it("keeps the decimal point instead of collapsing rupees and paise", () => {
    expect(sanitizeDecimalInput("7500.50")).toBe("7500.50");
    expect(sanitizeDecimalInput("7500.5")).toBe("7500.5");
    expect(sanitizeDecimalInput("7500")).toBe("7500");
  });

  it("never changes the magnitude of a typed amount", () => {
    for (const typed of ["7500.5", "7500.50", "0.99", "123456.78", "7500"]) {
      const sanitized = Number(sanitizeDecimalInput(typed));
      expect(sanitized).toBeCloseTo(Number(typed), 2);
    }
  });

  it("caps paise at two places, matching what the receipt can print", () => {
    expect(sanitizeDecimalInput("7500.123")).toBe("7500.12");
    expect(sanitizeDecimalInput("7500.129")).toBe("7500.12");
  });

  it("survives a second decimal point without shifting the first", () => {
    // Reachable by pasting, or by a keyboard that repeats the separator.
    expect(sanitizeDecimalInput("75.00.5")).toBe("75.00");
    expect(sanitizeDecimalInput("7..5")).toBe("7.5");
  });

  it("strips anything that is not a digit or a point", () => {
    expect(sanitizeDecimalInput("₹7,500")).toBe("7500");
    expect(sanitizeDecimalInput("7500 rs")).toBe("7500");
    expect(sanitizeDecimalInput("-7500")).toBe("7500");
    expect(sanitizeDecimalInput("1e5")).toBe("15");
  });

  it("lets a trailing point stand while the clerk is still typing", () => {
    // Rejecting it here would make the point un-typeable on the phone.
    expect(sanitizeDecimalInput("7500.")).toBe("7500.");
    expect(sanitizeDecimalInput("")).toBe("");
    expect(sanitizeDecimalInput(".")).toBe(".");
  });
});
