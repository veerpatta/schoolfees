import { describe, expect, it } from "vitest";

import {
  deriveCadence,
  snoozeIso,
  tallyCadence,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import { composeDefaulterDraft, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/defaulters/whatsapp-template";

const TODAY = new Date(Date.UTC(2026, 4, 24, 12, 0)); // 2026-05-24 noon UTC

describe("deriveCadence", () => {
  it("returns now when never contacted and no snooze", () => {
    const row: DefaulterContactSummary = { snoozeUntil: null, lastContactedAt: null };
    expect(deriveCadence(row, TODAY)).toBe("now");
  });

  it("returns now when snoozeUntil is in the past", () => {
    expect(
      deriveCadence({ snoozeUntil: "2026-05-23", lastContactedAt: null }, TODAY),
    ).toBe("now");
    expect(
      deriveCadence({ snoozeUntil: "2025-12-01", lastContactedAt: null }, TODAY),
    ).toBe("now");
  });

  it("returns later when snoozed to a future date (no promise)", () => {
    expect(
      deriveCadence({ snoozeUntil: "2026-05-25", lastContactedAt: null }, TODAY),
    ).toBe("later");
    expect(
      deriveCadence({ snoozeUntil: "2026-12-31", lastContactedAt: null }, TODAY),
    ).toBe("later");
  });

  it("returns soon for promised-today (outcome=promised_pay)", () => {
    expect(
      deriveCadence(
        {
          snoozeUntil: "2026-05-24",
          lastContactedAt: "2026-05-20T10:00:00Z",
          lastOutcome: "promised_pay",
        },
        TODAY,
      ),
    ).toBe("soon");
  });

  it("returns done when contacted within the last 6 hours (non-promise)", () => {
    const twoHoursAgo = new Date(TODAY.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(
      deriveCadence(
        { snoozeUntil: null, lastContactedAt: twoHoursAgo, lastOutcome: "reached" },
        TODAY,
      ),
    ).toBe("done");
  });

  it("handles malformed snoozeUntil gracefully", () => {
    expect(
      deriveCadence({ snoozeUntil: "not-a-date", lastContactedAt: null }, TODAY),
    ).toBe("now");
  });
});

describe("snoozeIso", () => {
  it("rolls forward by N days from today", () => {
    expect(snoozeIso(2, TODAY)).toBe("2026-05-26");
    expect(snoozeIso(7, TODAY)).toBe("2026-05-31");
    expect(snoozeIso(30, TODAY)).toBe("2026-06-23");
  });

  it("handles month boundaries correctly", () => {
    const eom = new Date(Date.UTC(2026, 4, 30)); // 2026-05-30
    expect(snoozeIso(3, eom)).toBe("2026-06-02");
  });
});

describe("tallyCadence", () => {
  it("buckets a mixed roster correctly across new buckets", () => {
    const twoHoursAgo = new Date(TODAY.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const rows: DefaulterContactSummary[] = [
      { snoozeUntil: null, lastContactedAt: null }, // now
      { snoozeUntil: "2026-05-26", lastContactedAt: null }, // later
      { snoozeUntil: "2025-01-01", lastContactedAt: null }, // now (snooze past)
      {
        snoozeUntil: "2026-05-24",
        lastContactedAt: "2026-05-20T10:00:00Z",
        lastOutcome: "promised_pay",
      }, // soon
      { snoozeUntil: null, lastContactedAt: twoHoursAgo, lastOutcome: "reached" }, // done
    ];
    const counts = tallyCadence(rows, TODAY);
    expect(counts.now).toBe(2);
    expect(counts.soon).toBe(1);
    expect(counts.later).toBe(1);
    expect(counts.done).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    expect(tallyCadence([], TODAY)).toEqual({
      now: 0,
      soon: 0,
      later: 0,
      done: 0,
    });
  });
});

describe("composeDefaulterDraft", () => {
  it("substitutes every placeholder", () => {
    const text = composeDefaulterDraft({
      studentName: "Ramesh Kumar",
      className: "Class 10 B",
      outstandingAmount: 12500,
      dueLabel: "Q1 due 20-04-2026",
      schoolName: "Shri Veer Patta Senior Secondary School",
    });
    expect(text).toContain("Ramesh Kumar");
    expect(text).toContain("Class 10 B");
    expect(text).toContain("Q1 due 20-04-2026");
    expect(text).toContain("Shri Veer Patta Senior Secondary School");
    expect(text).toContain("₹");
  });

  it("never leaves unresolved placeholders in the canonical template", () => {
    const text = composeDefaulterDraft({
      studentName: "X",
      className: "Y",
      outstandingAmount: 1,
      dueLabel: "Z",
      schoolName: "S",
    });
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("accepts a custom template override", () => {
    const text = composeDefaulterDraft({
      studentName: "A",
      className: "10",
      outstandingAmount: 100,
      dueLabel: "Q1",
      schoolName: "VPPS",
      template: "Hi {studentName}, you owe {amount} for {className}.",
    });
    expect(text).toBe("Hi A, you owe ₹100 for 10.");
  });
});

describe("DEFAULT_WHATSAPP_TEMPLATE", () => {
  it("uses placeholders the substituter knows about", () => {
    const placeholders = DEFAULT_WHATSAPP_TEMPLATE.match(/\{[a-zA-Z]+\}/g) ?? [];
    const known = new Set([
      "{studentName}",
      "{className}",
      "{amount}",
      "{dueLabel}",
      "{schoolName}",
    ]);
    for (const placeholder of placeholders) {
      expect(known.has(placeholder)).toBe(true);
    }
  });
});
