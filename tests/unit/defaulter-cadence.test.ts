import { describe, expect, it } from "vitest";

import {
  deriveCadence,
  snoozeIso,
  tallyCadence,
  type DefaulterContactSummary,
  heatScore,
  SEEN_BUT_NOT_PAID_WEIGHT,
} from "@/modules/defaulters/domain/cadence";
import {
  appendPaymentBlockIfMissing,
  composeDefaulterDraft,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@/modules/defaulters/domain/whatsapp-template";

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
  it("includes a UPI pay link when provided", () => {
    const text = composeDefaulterDraft({
      studentName: "A",
      className: "10",
      outstandingAmount: 8000,
      dueLabel: "Q1",
      schoolName: "VPPS",
      paymentLink: "upi://pay?pa=school@bank&am=8000",
      paymentReference: "Fee ADM1234",
    });

    expect(text).toContain("upi://pay?pa=school@bank&am=8000");
    expect(text).toContain("Fee ADM1234");
    expect(text).toContain("Payment Desk");
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
      "{paymentBlock}",
    ]);
    for (const placeholder of placeholders) {
      expect(known.has(placeholder)).toBe(true);
    }
  });
});

describe("appendPaymentBlockIfMissing", () => {
  it("adds UPI details when a saved template did not include them", () => {
    const text = appendPaymentBlockIfMissing("Reminder body", {
      paymentLink: "upi://pay?pa=school@bank&am=500",
      paymentReference: "Fee ADM1",
    });

    expect(text).toContain("Reminder body");
    expect(text).toContain("upi://pay?pa=school@bank&am=500");
    expect(text).toContain("Fee ADM1");
    expect(text).toContain("Payment Desk");
  });

  it("does not duplicate UPI details when the template already rendered the link", () => {
    const text = appendPaymentBlockIfMissing("Pay upi://pay?pa=school@bank&am=500", {
      paymentLink: "upi://pay?pa=school@bank&am=500",
      paymentReference: "Fee ADM1",
    });

    expect(text.match(/upi:\/\/pay/g)).toHaveLength(1);
  });
});

describe("a broadcast does not empty the call list", () => {
  /**
   * The six-hour rule exists so a collector does not ring the same parent twice
   * in an afternoon. It is a fact about a PERSON having just spoken to them.
   *
   * `sendRemindersAction` logs every messaged family to `defaulter_contacts`, so
   * before `bulk` existed a 171-family morning run put all of them in `done` and
   * the callers lost their worklist on exactly the days the office was pushing
   * hardest.
   */
  const justNow = new Date("2026-09-03T10:00:00Z");
  const anHourAgo = "2026-09-03T09:00:00Z";

  it("keeps a family in Now after a bulk reminder an hour ago", () => {
    expect(
      deriveCadence(
        {
          snoozeUntil: null,
          lastContactedAt: anHourAgo,
          // Nobody has spoken to them; they were only broadcast to.
          lastPersonalContactedAt: null,
          lastOutcome: "other",
        },
        justNow,
      ),
    ).toBe("now");
  });

  it("still cools a family off after a real call an hour ago", () => {
    expect(
      deriveCadence(
        {
          snoozeUntil: null,
          lastContactedAt: anHourAgo,
          lastPersonalContactedAt: anHourAgo,
          lastOutcome: "reached",
        },
        justNow,
      ),
    ).toBe("done");
  });

  it("uses the older personal call, not the newer broadcast", () => {
    // A collector rang at 09:00 and the broadcast went at 09:30. The call is
    // what matters, and it is still inside the cool-off.
    expect(
      deriveCadence(
        {
          snoozeUntil: null,
          lastContactedAt: "2026-09-03T09:30:00Z",
          lastPersonalContactedAt: anHourAgo,
          lastOutcome: "other",
        },
        justNow,
      ),
    ).toBe("done");
  });

  it("falls back to lastContactedAt when the field is absent", () => {
    // A caller that predates the distinction must keep the old behaviour rather
    // than silently losing the cool-off altogether.
    expect(
      deriveCadence(
        { snoozeUntil: null, lastContactedAt: anHourAgo, lastOutcome: "reached" },
        justNow,
      ),
    ).toBe("done");
  });

  it("does not let a broadcast override a promise", () => {
    // A family who promised to pay today stays in Soon whatever else happened.
    expect(
      deriveCadence(
        {
          snoozeUntil: "2026-09-03",
          lastContactedAt: anHourAgo,
          lastPersonalContactedAt: null,
          lastOutcome: "promised_pay",
        },
        justNow,
      ),
    ).toBe("soon");
  });
});

describe("seen and ignored ranks higher", () => {
  /**
   * The strongest signal this system produces. A family who never saw the
   * message has an excuse; a family who read it days ago and still has not paid
   * has made a decision.
   */
  const base = {
    totalPending: 9000,
    daysOverdue: 10,
    contact: null,
    today: new Date("2026-09-03T10:00:00Z"),
  };

  it("adds nothing until delivery data has been imported", () => {
    // Absent, not zero. The score must not quietly change meaning on the day
    // the office starts uploading campaign reports.
    const withoutContact = heatScore(base);
    const withContact = heatScore({
      ...base,
      contact: { snoozeUntil: null, lastContactedAt: null, readAndUnpaidDays: null },
    });
    expect(withContact).toBe(withoutContact);
  });

  it("ranks a family who read it above an identical family who did not", () => {
    const unread = heatScore({
      ...base,
      contact: { snoozeUntil: null, lastContactedAt: null },
    });
    const read = heatScore({
      ...base,
      contact: { snoozeUntil: null, lastContactedAt: null, readAndUnpaidDays: 7 },
    });
    expect(read).toBeGreaterThan(unread);
    expect(read - unread).toBe(SEEN_BUT_NOT_PAID_WEIGHT);
  });

  it("grows with the days since the read, and caps", () => {
    const scores = [0, 2, 7, 30].map((days) =>
      heatScore({
        ...base,
        contact: { snoozeUntil: null, lastContactedAt: null, readAndUnpaidDays: days },
      }),
    );
    // Non-decreasing, and the last two are equal because the boost is capped.
    expect(scores[0]).toBeLessThanOrEqual(scores[1]!);
    expect(scores[1]).toBeLessThan(scores[2]!);
    expect(scores[3]).toBe(scores[2]);
  });

  it("stays smaller than the money and age weights it sits beside", () => {
    // It is evidence about intent, not about how much is owed. A read reminder
    // must not outrank a much larger debt.
    expect(SEEN_BUT_NOT_PAID_WEIGHT).toBeLessThan(25);
  });
});
