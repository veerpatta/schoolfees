/**
 * Integration tests for the triage cadence logic used by the Defaulters page.
 *
 * Tests deriveCadence, tallyCadence, snoozeIso, and heatScore against the
 * boundary conditions that the UI relies on to populate the
 * Now / Soon / Later / Done buckets.
 */

import { describe, expect, it } from "vitest";

import {
  deriveCadence,
  tallyCadence,
  snoozeIso,
  heatScore,
  heatLevel,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import { buildRecoveryDesk } from "@/lib/defaulters/recovery";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

const TODAY_ISO = "2026-05-24";
const TODAY = new Date("2026-05-24T12:00:00Z");

function s(
  snoozeUntil: string | null,
  lastContactedAt: string | null = null,
  extras: Partial<DefaulterContactSummary> = {},
): DefaulterContactSummary {
  return { snoozeUntil, lastContactedAt, ...extras };
}

describe("deriveCadence", () => {
  it("returns now when never contacted and no snooze", () => {
    expect(deriveCadence(s(null), TODAY)).toBe("now");
  });

  it("returns now when snooze date is in the past", () => {
    expect(deriveCadence(s("2026-05-01"), TODAY)).toBe("now");
  });

  it("returns soon when promised today and outcome is promised_pay", () => {
    expect(
      deriveCadence(
        s(TODAY_ISO, "2026-05-20T10:00:00Z", { lastOutcome: "promised_pay" }),
        TODAY,
      ),
    ).toBe("soon");
  });

  it("returns later when snooze date is in the future and no promise", () => {
    expect(deriveCadence(s("2026-05-26"), TODAY)).toBe("later");
  });

  it("returns done when contacted within last 6 hours with non-promise outcome", () => {
    const twoHoursAgo = new Date(TODAY.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(
      deriveCadence(s(null, twoHoursAgo, { lastOutcome: "reached" }), TODAY),
    ).toBe("done");
  });

  it("returns soon when last attempt was no-answer in the last 24h", () => {
    const tenHoursAgo = new Date(TODAY.getTime() - 10 * 60 * 60 * 1000).toISOString();
    expect(
      deriveCadence(s(null, tenHoursAgo, { lastOutcome: "no_answer" }), TODAY),
    ).toBe("soon");
  });

  it("returns now when last no-answer is >24h ago", () => {
    const twoDaysAgo = new Date(TODAY.getTime() - 48 * 60 * 60 * 1000).toISOString();
    expect(
      deriveCadence(s(null, twoDaysAgo, { lastOutcome: "no_answer" }), TODAY),
    ).toBe("now");
  });

  it("returns now when snooze is an unparseable string", () => {
    expect(deriveCadence(s("not-a-date"), TODAY)).toBe("now");
  });
});

describe("tallyCadence", () => {
  it("returns zero counts for an empty array", () => {
    const counts = tallyCadence([], TODAY);
    expect(counts.now).toBe(0);
    expect(counts.soon).toBe(0);
    expect(counts.later).toBe(0);
    expect(counts.done).toBe(0);
  });

  it("counts each cadence correctly across a mixed set", () => {
    const twoHoursAgo = new Date(TODAY.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(TODAY.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const rows: DefaulterContactSummary[] = [
      s(null),                                            // now
      s("2026-05-01"),                                    // now (snooze past, no recent attempt)
      s(null, twoDaysAgo, { lastOutcome: "no_answer" }),  // now
      s(TODAY_ISO, twoDaysAgo, { lastOutcome: "promised_pay" }), // soon
      s("2026-06-01"),                                    // later
      s(null, twoHoursAgo, { lastOutcome: "reached" }),   // done
    ];
    const counts = tallyCadence(rows, TODAY);
    expect(counts.now).toBe(3);
    expect(counts.soon).toBe(1);
    expect(counts.later).toBe(1);
    expect(counts.done).toBe(1);
  });
});

describe("snoozeIso", () => {
  it("adds the correct number of days to today", () => {
    expect(snoozeIso(7, TODAY)).toBe("2026-05-31");
  });

  it("adds 2 days correctly", () => {
    expect(snoozeIso(2, TODAY)).toBe("2026-05-26");
  });

  it("adds 30 days correctly (crosses month boundary)", () => {
    expect(snoozeIso(30, TODAY)).toBe("2026-06-23");
  });

  it("adds 1 day correctly", () => {
    expect(snoozeIso(1, TODAY)).toBe("2026-05-25");
  });
});

describe("heatScore", () => {
  it("returns a non-negative number for typical inputs", () => {
    const score = heatScore({
      totalPending: 5000,
      daysOverdue: 10,
      contact: null,
      today: TODAY,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores a promised-today-and-unpaid student higher than a quiet one", () => {
    const promised = heatScore({
      totalPending: 5000,
      daysOverdue: 5,
      today: TODAY,
      contact: s(TODAY_ISO, "2026-05-20T10:00:00Z", { lastOutcome: "promised_pay" }),
    });
    const quiet = heatScore({
      totalPending: 5000,
      daysOverdue: 5,
      contact: null,
      today: TODAY,
    });
    expect(promised).toBeGreaterThan(quiet);
  });

  it("cools a student with 5 consecutive no-answers", () => {
    const withStreak = heatScore({
      totalPending: 5000,
      daysOverdue: 10,
      today: TODAY,
      contact: s(null, "2026-05-22T10:00:00Z", {
        lastOutcome: "no_answer",
        noAnswerStreak: 5,
      }),
    });
    const fresh = heatScore({
      totalPending: 5000,
      daysOverdue: 10,
      contact: null,
      today: TODAY,
    });
    expect(withStreak).toBeLessThan(fresh);
  });

  it("cools a student contacted within the last 6 hours", () => {
    const oneHourAgo = new Date(TODAY.getTime() - 60 * 60 * 1000).toISOString();
    const justCalled = heatScore({
      totalPending: 5000,
      daysOverdue: 10,
      today: TODAY,
      contact: s(null, oneHourAgo, { lastOutcome: "no_answer" }),
    });
    const stale = heatScore({
      totalPending: 5000,
      daysOverdue: 10,
      contact: null,
      today: TODAY,
    });
    expect(justCalled).toBeLessThan(stale);
  });

  it("caps at 100 for extreme inputs", () => {
    expect(
      heatScore({
        totalPending: 5_000_000,
        daysOverdue: 999,
        today: TODAY,
        contact: s(TODAY_ISO, "2026-05-20T10:00:00Z", { lastOutcome: "promised_pay" }),
      }),
    ).toBeLessThanOrEqual(100);
  });
});

describe("heatLevel", () => {
  it("buckets correctly", () => {
    expect(heatLevel(0)).toBe("cold");
    expect(heatLevel(24)).toBe("cold");
    expect(heatLevel(25)).toBe("warm");
    expect(heatLevel(49)).toBe("warm");
    expect(heatLevel(50)).toBe("hot");
    expect(heatLevel(74)).toBe("hot");
    expect(heatLevel(75)).toBe("blazing");
    expect(heatLevel(100)).toBe("blazing");
  });
});

describe("call queue recovery desk", () => {
  function row(
    studentId: string,
    totalPending: number,
    extras: Partial<DefaulterSummaryRow> = {},
  ) {
    return {
      studentId,
      classId: "class-1",
      admissionNo: `SR-${studentId}`,
      fullName: `Student ${studentId}`,
      fatherName: "Parent",
      fatherPhone: "9000000000",
      motherPhone: null,
      classLabel: "Class 1",
      studentStatusLabel: "Old",
      transportRouteId: null,
      transportRouteLabel: "-",
      totalDue: 50000,
      totalPaid: 50000 - totalPending,
      totalPending,
      overdueAmount: totalPending,
      lateFee: 0,
      discountApplied: 0,
      lateFeeWaived: 0,
      overdueInstallments: 1,
      openInstallments: 1,
      nextDueAmount: null,
      oldestDueDate: "2026-04-20",
      nextDueDate: null,
      lastPaymentDate: null,
      followUpStatus: "overdue",
      daysOverdue: 30,
      defaulterScore: totalPending,
      heat: 50,
      rank: 1,
      paymentBehavior: "new",
      promiseStatus: null,
      noCall: false,
      ...extras,
    } satisfies DefaulterSummaryRow;
  }

  it("uses nextBestRows as the priority call queue", () => {
    const desk = buildRecoveryDesk({
      today: TODAY,
      contactSummaries: {
        due: s(TODAY_ISO, "2026-05-20T10:00:00Z", { lastOutcome: "promised_pay" }),
      },
      rows: [
        row("quiet", 20000, { heat: 40 }),
        row("due", 5000, { heat: 30, promiseStatus: "pending" }),
      ],
    });

    expect(desk.nextBestRows[0].row.studentId).toBe("due");
    expect(desk.nextBestRows[0].reasons).toContain("Promise due");
  });

  it("keeps no-call students out of the active call queue", () => {
    const desk = buildRecoveryDesk({
      today: TODAY,
      contactSummaries: {},
      rows: [
        row("call", 10000),
        row("skip", 100000, { noCall: true, heat: 100 }),
      ],
    });

    expect(desk.nextBestRows.map((entry) => entry.row.studentId)).toEqual(["call"]);
    expect(desk.metrics.noCallRows).toBe(1);
  });
});
