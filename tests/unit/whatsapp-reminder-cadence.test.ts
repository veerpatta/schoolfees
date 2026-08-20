import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  addDays,
  cadenceGapDays,
  cadenceLabel,
  CADENCE_VALUES,
  DEFAULT_CADENCE,
  REMINDER_CADENCES,
} from "@/lib/whatsapp/reminder-cadence";

/**
 * The cadence decides how often a real parent is messaged about money. Getting
 * the gap wrong either nags a family every day or silently stops reminding them
 * at all, and both look like "it works" from the screen.
 */

describe("reminder cadences", () => {
  it("defaults to every run, so doing nothing changes nothing", () => {
    expect(DEFAULT_CADENCE).toBe("every_run");
    expect(cadenceGapDays("every_run")).toBe(0);
  });

  it("orders the gaps from most to least frequent", () => {
    const gaps = REMINDER_CADENCES.map((entry) => entry.gapDays);
    const sorted = [...gaps].sort((a, b) => a - b);
    expect(gaps).toEqual(sorted);
  });

  it.each([
    ["weekly", 7],
    ["fortnightly", 14],
    ["monthly", 30],
  ] as const)("%s waits %i days", (cadence, days) => {
    expect(cadenceGapDays(cadence)).toBe(days);
  });

  it("never comes back on its own", () => {
    expect(cadenceGapDays("never")).toBe(Number.POSITIVE_INFINITY);
  });

  it("labels every cadence for the picker", () => {
    for (const value of CADENCE_VALUES) {
      expect(cadenceLabel(value as never)).toBeTruthy();
      expect(cadenceLabel(value as never)).not.toBe(value);
    }
  });

  it("matches the values the database check constraint accepts", () => {
    // A value the UI offers but Postgres rejects is a save that fails at the
    // last moment, on a screen where the office is mid-run.
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260820210000_whatsapp_reminder_cadence.sql"),
      "utf8",
    );
    const check = /whatsapp_cadence in \(([^)]+)\)/.exec(migration);
    expect(check).not.toBeNull();

    const allowed = check![1]
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""))
      .sort();

    expect(allowed).toEqual([...CADENCE_VALUES].sort());
  });
});

describe("addDays", () => {
  it("advances a plain date", () => {
    expect(addDays("2026-08-20", 7)).toBe("2026-08-27");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-08-25", 7)).toBe("2026-09-01");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("is stable under a monthly gap", () => {
    expect(addDays("2026-01-31", 30)).toBe("2026-03-02");
  });

  it("does not slide a day", () => {
    // Computed in UTC on purpose: with local-time arithmetic a server west of
    // the school would land the snooze on the wrong date.
    for (let day = 1; day <= 28; day += 1) {
      const date = `2026-06-${String(day).padStart(2, "0")}`;
      expect(addDays(date, 0)).toBe(date);
    }
  });
});
