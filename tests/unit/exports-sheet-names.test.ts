import { describe, expect, it } from "vitest";

import { safeSheetName } from "@/modules/exports/data/responses";

/**
 * Excel refuses to open a workbook whose tab names break any of these rules, so
 * every failure here is a file the office cannot open at all — not a cosmetic
 * one. Nothing in this repo handled them until 22 transport-route names became
 * 22 sheets.
 */
describe("safeSheetName", () => {
  it("truncates to Excel's 31-character limit", () => {
    const name = safeSheetName("A very long transport route name that keeps going", new Set());

    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("strips the characters Excel bans in a tab name", () => {
    const name = safeSheetName("Rs. 5,001 - 10,000 [band]: */?\\", new Set());

    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });

  it("never returns an empty name", () => {
    expect(safeSheetName("///", new Set())).toBe("Sheet");
    expect(safeSheetName("", new Set())).toBe("Sheet");
  });

  it("de-duplicates, case-insensitively, and stays inside the limit doing it", () => {
    const used = new Set<string>();
    const first = safeSheetName("Route A", used);
    const second = safeSheetName("route a", used);
    const third = safeSheetName("Route A", used);

    expect(first).toBe("Route A");
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("keeps a de-duplicated long name within 31 characters", () => {
    const used = new Set<string>();
    const long = "Bhilwara Chittorgarh Road Stop 12";
    safeSheetName(long, used);
    const second = safeSheetName(long, used);

    expect(second.length).toBeLessThanOrEqual(31);
    expect(second).toMatch(/\(2\)$/);
  });
});
