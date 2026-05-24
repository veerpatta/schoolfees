/**
 * Integration tests for the triage cadence logic used by the Defaulters page.
 *
 * Tests deriveCadence and tallyCadence against the date boundaries that the
 * UI relies on to populate the Call today / This week / Snoozed tabs.
 */

import { describe, expect, it } from "vitest";

import {
  deriveCadence,
  tallyCadence,
  snoozeIso,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";

const TODAY_ISO = "2026-05-24";
const TODAY = new Date("2026-05-24T00:00:00Z");

function s(snoozeUntil: string | null, lastContactedAt: string | null = null): DefaulterContactSummary {
  return { snoozeUntil, lastContactedAt };
}

describe("deriveCadence", () => {
  it("returns call_today when never contacted (null snooze)", () => {
    expect(deriveCadence(s(null), TODAY)).toBe("call_today");
  });

  it("returns call_today when snooze date is today", () => {
    expect(deriveCadence(s(TODAY_ISO), TODAY)).toBe("call_today");
  });

  it("returns call_today when snooze date is in the past", () => {
    expect(deriveCadence(s("2026-05-01"), TODAY)).toBe("call_today");
  });

  it("returns this_week when snooze date is tomorrow", () => {
    const tomorrow = "2026-05-25";
    expect(deriveCadence(s(tomorrow), TODAY)).toBe("this_week");
  });

  it("returns this_week when snooze date is exactly 7 days out", () => {
    const sevenDaysOut = "2026-05-31";
    expect(deriveCadence(s(sevenDaysOut), TODAY)).toBe("this_week");
  });

  it("returns snoozed when snooze date is 8 days out", () => {
    const eightDaysOut = "2026-06-01";
    expect(deriveCadence(s(eightDaysOut), TODAY)).toBe("snoozed");
  });

  it("returns snoozed for a date 30 days out", () => {
    const thirtyDaysOut = "2026-06-23";
    expect(deriveCadence(s(thirtyDaysOut), TODAY)).toBe("snoozed");
  });

  it("returns call_today when snooze is an unparseable string", () => {
    expect(deriveCadence(s("not-a-date"), TODAY)).toBe("call_today");
  });
});

describe("tallyCadence", () => {
  it("returns zero counts for an empty array", () => {
    const counts = tallyCadence([], TODAY);
    expect(counts.call_today).toBe(0);
    expect(counts.this_week).toBe(0);
    expect(counts.snoozed).toBe(0);
  });

  it("counts each cadence correctly across a mixed set", () => {
    const rows: DefaulterContactSummary[] = [
      s(null),               // call_today
      s("2026-05-01"),       // call_today (past)
      s("2026-05-25"),       // this_week
      s("2026-05-31"),       // this_week (7 days out)
      s("2026-06-01"),       // snoozed (8 days out)
      s("2026-07-01"),       // snoozed
    ];
    const counts = tallyCadence(rows, TODAY);
    expect(counts.call_today).toBe(2);
    expect(counts.this_week).toBe(2);
    expect(counts.snoozed).toBe(2);
  });
});

describe("snoozeIso", () => {
  it("adds the correct number of days to today", () => {
    const result = snoozeIso(7, TODAY);
    expect(result).toBe("2026-05-31");
  });

  it("adds 2 days correctly", () => {
    const result = snoozeIso(2, TODAY);
    expect(result).toBe("2026-05-26");
  });

  it("adds 30 days correctly (crosses month boundary)", () => {
    const result = snoozeIso(30, TODAY);
    expect(result).toBe("2026-06-23");
  });

  it("adds 1 day correctly", () => {
    const result = snoozeIso(1, TODAY);
    expect(result).toBe("2026-05-25");
  });
});
