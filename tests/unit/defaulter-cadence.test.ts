import { describe, expect, it } from "vitest";

import {
  deriveCadence,
  snoozeIso,
  tallyCadence,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import { composeDefaulterDraft, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/defaulters/whatsapp-template";

const TODAY = new Date(Date.UTC(2026, 4, 24)); // 2026-05-24

describe("deriveCadence", () => {
  it("returns call_today when never contacted", () => {
    const row: DefaulterContactSummary = { snoozeUntil: null, lastContactedAt: null };
    expect(deriveCadence(row, TODAY)).toBe("call_today");
  });

  it("returns call_today when snoozeUntil is today or earlier", () => {
    expect(deriveCadence({ snoozeUntil: "2026-05-24", lastContactedAt: null }, TODAY)).toBe(
      "call_today",
    );
    expect(deriveCadence({ snoozeUntil: "2026-05-23", lastContactedAt: null }, TODAY)).toBe(
      "call_today",
    );
    expect(deriveCadence({ snoozeUntil: "2025-12-01", lastContactedAt: null }, TODAY)).toBe(
      "call_today",
    );
  });

  it("returns this_week when snooze is within 7 days", () => {
    expect(deriveCadence({ snoozeUntil: "2026-05-25", lastContactedAt: null }, TODAY)).toBe(
      "this_week",
    );
    expect(deriveCadence({ snoozeUntil: "2026-05-31", lastContactedAt: null }, TODAY)).toBe(
      "this_week",
    );
  });

  it("returns snoozed when snooze is beyond 7 days", () => {
    expect(deriveCadence({ snoozeUntil: "2026-06-01", lastContactedAt: null }, TODAY)).toBe(
      "snoozed",
    );
    expect(deriveCadence({ snoozeUntil: "2026-12-31", lastContactedAt: null }, TODAY)).toBe(
      "snoozed",
    );
  });

  it("handles malformed snoozeUntil gracefully (treats as never snoozed)", () => {
    expect(deriveCadence({ snoozeUntil: "not-a-date", lastContactedAt: null }, TODAY)).toBe(
      "call_today",
    );
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
  it("buckets a mixed roster correctly", () => {
    const rows: DefaulterContactSummary[] = [
      { snoozeUntil: null, lastContactedAt: null },
      { snoozeUntil: "2026-05-26", lastContactedAt: null },
      { snoozeUntil: "2026-07-01", lastContactedAt: null },
      { snoozeUntil: "2026-05-30", lastContactedAt: null },
      { snoozeUntil: "2025-01-01", lastContactedAt: null }, // past → call_today
    ];
    const counts = tallyCadence(rows, TODAY);
    expect(counts.call_today).toBe(2);
    expect(counts.this_week).toBe(2);
    expect(counts.snoozed).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    expect(tallyCadence([], TODAY)).toEqual({
      call_today: 0,
      this_week: 0,
      snoozed: 0,
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
    // Amount renders in INR formatting.
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
