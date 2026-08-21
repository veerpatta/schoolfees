import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysInMonth,
  formatCalendarMonth,
  isoToParts,
  monthGrid,
  partsToIso,
  todayPartsIst,
  weekdayHeadings,
} from "@/platform/helpers/date";

/**
 * The phone date picker's month grid.
 *
 * These are integer-only helpers on purpose: a grid built from `Date` objects
 * and rendered in IST slips by a day whenever the runtime's zone is behind
 * UTC. The office is in IST, the server is not, and the failure only appears
 * near midnight — which is exactly when the day's collection is reconciled.
 */

describe("calendar grid", () => {
  it("counts days per month, leap years included", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("clamps the day when stepping into a shorter month", () => {
    // 31 Jan → Feb must land on the 28th, not spill into March.
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths({ year: 2026, month: 1, day: 15 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 15,
    });
    expect(addMonths({ year: 2026, month: 12, day: 15 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 15,
    });
    expect(addMonths({ year: 2026, month: 3, day: 10 }, -14)).toEqual({
      year: 2025,
      month: 1,
      day: 10,
    });
  });

  it("pads the grid to whole weeks with gaps, not neighbouring days", () => {
    // 1 Jul 2026 is a Wednesday, so three leading blanks.
    const cells = monthGrid(2026, 7);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toEqual({ year: 2026, month: 7, day: 1 });

    const days = cells.filter(Boolean);
    expect(days).toHaveLength(31);
    // No cell may belong to another month — a tappable "30 Jun" inside July's
    // grid would post a receipt filter for the wrong day.
    expect(days.every((cell) => cell?.month === 7)).toBe(true);
  });

  it("starts every month grid on Sunday", () => {
    for (const month of [1, 2, 6, 9, 12]) {
      const cells = monthGrid(2026, month);
      const firstDay = cells.findIndex(Boolean);
      const weekday = new Date(Date.UTC(2026, month - 1, 1)).getUTCDay();
      expect(firstDay).toBe(weekday);
    }
  });

  it("round-trips ISO strings without timezone drift", () => {
    const iso = "2026-07-26";
    expect(partsToIso(isoToParts(iso))).toBe(iso);
    expect(partsToIso({ year: 2026, month: 1, day: 5 })).toBe("2026-01-05");
  });

  it("labels the month from parts, not from a zoned Date", () => {
    expect(formatCalendarMonth(2026, 7)).toBe("July 2026");
    // The 1st and the last day of a month must produce the same label even
    // though a naive Date would render them in different zones.
    expect(formatCalendarMonth(2026, 1)).toBe("January 2026");
    expect(formatCalendarMonth(2026, 12)).toBe("December 2026");
  });

  it("derives seven weekday headings starting Sunday", () => {
    const headings = weekdayHeadings();
    expect(headings).toHaveLength(7);
    expect(headings[0]).toMatch(/^Sun/);
    expect(new Set(headings).size).toBe(7);
  });

  it("reads today in IST, not in the runtime's zone", () => {
    // 2026-07-26T20:30:00Z is already the 27th in IST (+05:30).
    expect(todayPartsIst(new Date("2026-07-26T20:30:00Z"))).toEqual({
      year: 2026,
      month: 7,
      day: 27,
    });
  });

  it("steps days across month and year ends", () => {
    expect(addDays({ year: 2026, month: 7, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 8,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
    expect(addDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it("agrees with the picker on what 'today' and 'yesterday' mean", () => {
    // The Transactions day chips used `new Date().toISOString().slice(0,10)`,
    // which is UTC: between 00:00 and 05:30 IST that resolves to YESTERDAY,
    // so "Today" filtered the wrong day during a late-night reconciliation.
    // Both surfaces now derive from the same IST parts.
    const lateNightIst = new Date("2026-07-26T19:00:00Z"); // 00:30 IST, 27 Jul
    const today = todayPartsIst(lateNightIst);

    expect(partsToIso(today)).toBe("2026-07-27");
    expect(partsToIso(addDays(today, -1))).toBe("2026-07-26");
    // What the old code would have produced, kept explicit so the regression
    // is recognisable if anyone reintroduces it.
    expect(lateNightIst.toISOString().slice(0, 10)).toBe("2026-07-26");
  });
});
