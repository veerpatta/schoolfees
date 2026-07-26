import { describe, expect, it } from "vitest";

import { applyKeypadPress } from "@/components/mobile-app/money-keypad";

/**
 * The phone-app money keypad shares the amount field with the native numeric
 * input. Both write through `sanitizeDecimalInput`, so a value typed on one
 * must survive a press on the other unchanged in magnitude.
 *
 * The regression this guards: an earlier draft extracted digits only, which
 * turned a typed "7500.5" into "75005" on the next press — a silent 100×
 * on a live payment field.
 */
describe("money keypad", () => {
  it("appends digits without dropping an existing decimal part", () => {
    expect(applyKeypadPress("7500.5", "0")).toBe("7500.50");
    expect(applyKeypadPress("7500", "0")).toBe("75000");
  });

  it("never multiplies an amount that already has paise", () => {
    const before = Number("7500.5");
    const after = Number(applyKeypadPress("7500.5", "0"));

    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThan(before * 10);
  });

  it("deletes one character at a time, decimal point included", () => {
    expect(applyKeypadPress("7500.50", "del")).toBe("7500.5");
    expect(applyKeypadPress("7500.5", "del")).toBe("7500.");
    expect(applyKeypadPress("7", "del")).toBe("");
    expect(applyKeypadPress("", "del")).toBe("");
  });

  it("treats 000 as a multiplier, never as a standalone zero amount", () => {
    expect(applyKeypadPress("", "000")).toBeNull();
    expect(applyKeypadPress("7", "000")).toBe("7000");
    expect(applyKeypadPress("7.5", "000")).toBe("7.50");
  });

  it("refuses presses that would exceed the field length", () => {
    expect(applyKeypadPress("123456789", "1")).toBeNull();
    expect(applyKeypadPress("1234", "1", 4)).toBeNull();
  });

  it("keeps paise capped at two places, matching the text input", () => {
    expect(applyKeypadPress("7500.12", "3")).toBe("7500.12");
  });
});
