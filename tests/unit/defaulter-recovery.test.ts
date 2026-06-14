import { describe, expect, it } from "vitest";

import {
  buildRecoveryDesk,
  type RecoveryDeskInput,
} from "@/lib/defaulters/recovery";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

const TODAY = new Date("2026-05-24T12:00:00Z");

function row(
  studentId: string,
  overrides: Partial<DefaulterSummaryRow> = {},
): DefaulterSummaryRow {
  return {
    studentId,
    classId: "class-1",
    admissionNo: `SR-${studentId}`,
    fullName: `Student ${studentId}`,
    fatherName: `Father ${studentId}`,
    fatherPhone: "9999999999",
    motherPhone: null,
    classLabel: "Class 10",
    studentStatusLabel: "Old",
    transportRouteId: null,
    transportRouteLabel: "No Transport",
    totalDue: 30000,
    totalPaid: 0,
    totalPending: 12000,
    overdueAmount: 9000,
    lateFee: 0,
    discountApplied: 0,
    lateFeeWaived: 0,
    overdueInstallments: 1,
    openInstallments: 2,
    nextDueAmount: 6000,
    oldestDueDate: "2026-04-20",
    nextDueDate: "2026-04-20",
    lastPaymentDate: null,
    followUpStatus: "overdue",
    daysOverdue: 34,
    defaulterScore: 15000,
    heat: 40,
    rank: 1,
    paymentBehavior: "new",
    promiseStatus: null,
    noCall: false,
    familyGroupId: null,
    familyVisibleSiblingCount: 0,
    ...overrides,
  };
}

function summary(
  overrides: Partial<DefaulterContactSummary> = {},
): DefaulterContactSummary {
  return {
    snoozeUntil: null,
    lastContactedAt: null,
    ...overrides,
  };
}

function build(input: RecoveryDeskInput) {
  return buildRecoveryDesk({ ...input, today: TODAY });
}

describe("buildRecoveryDesk", () => {
  it("separates the daily recovery queues and excludes no-call rows from active work", () => {
    const rows = [
      row("broken", { promiseStatus: "broken", heat: 90, totalPending: 32000 }),
      row("due", { promiseStatus: "pending", heat: 65 }),
      row("silent", { paymentBehavior: "non_responsive", heat: 55 }),
      row("family", { familyGroupId: "family-1", familyVisibleSiblingCount: 1, totalPending: 22000 }),
      row("no-call", { noCall: true, heat: 100, totalPending: 90000 }),
    ];

    const desk = build({
      rows,
      contactSummaries: {
        broken: summary({
          lastOutcome: "promised_pay",
          snoozeUntil: "2026-05-20",
          lastContactedAt: "2026-05-18T10:00:00Z",
        }),
        due: summary({
          lastOutcome: "promised_pay",
          snoozeUntil: "2026-05-24",
          lastContactedAt: "2026-05-20T10:00:00Z",
        }),
        silent: summary({
          lastOutcome: "no_answer",
          lastContactedAt: "2026-05-22T10:00:00Z",
          noAnswerStreak: 4,
        }),
        family: summary(),
        "no-call": summary(),
      },
    });

    expect(desk.metrics.activeRecoveryRows).toBe(4);
    expect(desk.metrics.noCallRows).toBe(1);
    expect(desk.metrics.promiseDueRows).toBe(2);
    expect(desk.metrics.brokenPromiseRows).toBe(1);
    expect(desk.metrics.notRespondingRows).toBe(1);
    expect(desk.lanes.brokenPromise.rows.map((entry) => entry.row.studentId)).toEqual(["broken"]);
    expect(desk.lanes.promiseDue.rows.map((entry) => entry.row.studentId)).toEqual([
      "broken",
      "due",
    ]);
    expect(desk.lanes.notResponding.rows.map((entry) => entry.row.studentId)).toEqual([
      "silent",
    ]);
    expect(desk.lanes.familyExposure.rows.map((entry) => entry.row.studentId)).toEqual([
      "family",
    ]);
    expect(desk.nextBestRows.map((entry) => entry.row.studentId)).not.toContain("no-call");
  });

  it("prioritizes broken promises above raw amount when building the next-best list", () => {
    const desk = build({
      rows: [
        row("big-quiet", { totalPending: 90000, heat: 50 }),
        row("broken-smaller", { totalPending: 9000, heat: 40, promiseStatus: "broken" }),
      ],
      contactSummaries: {
        "big-quiet": summary(),
        "broken-smaller": summary({
          lastOutcome: "promised_pay",
          snoozeUntil: "2026-05-20",
          lastContactedAt: "2026-05-18T10:00:00Z",
        }),
      },
    });

    expect(desk.nextBestRows[0].row.studentId).toBe("broken-smaller");
    expect(desk.nextBestRows[0].reasons).toContain("Broken promise");
  });

  it("summarizes aging buckets by student count and pending amount", () => {
    const desk = build({
      rows: [
        row("fresh", { daysOverdue: 8, totalPending: 3000 }),
        row("month", { daysOverdue: 45, totalPending: 5000 }),
        row("quarter", { daysOverdue: 75, totalPending: 7000 }),
        row("old", { daysOverdue: 110, totalPending: 11000 }),
        row("trusted", { daysOverdue: 120, totalPending: 13000, noCall: true }),
      ],
      contactSummaries: {},
    });

    expect(desk.metrics.agingBuckets).toEqual({
      currentTo30: { rows: 1, pendingAmount: 3000 },
      days31To60: { rows: 1, pendingAmount: 5000 },
      days61To90: { rows: 1, pendingAmount: 7000 },
      days91Plus: { rows: 1, pendingAmount: 11000 },
    });
  });

  it("reports recovery rate from paid amount against due amount for active recovery rows", () => {
    const desk = build({
      rows: [
        row("a", { totalDue: 10000, totalPaid: 4000, totalPending: 6000 }),
        row("b", { totalDue: 20000, totalPaid: 5000, totalPending: 15000 }),
        row("trusted", { totalDue: 50000, totalPaid: 0, totalPending: 50000, noCall: true }),
      ],
      contactSummaries: {},
    });

    expect(desk.metrics.recoveryRate).toBe(30);
  });

  it("raises priority when family promise history is unreliable", () => {
    const desk = build({
      rows: [
        row("same-dues-reliable", {
          heat: 40,
          totalPending: 10000,
          promiseKeptRate: 80,
          promiseKeptCount: 4,
          promiseBrokenCount: 1,
        }),
        row("same-dues-unreliable", {
          heat: 40,
          totalPending: 10000,
          promiseKeptRate: 20,
          promiseKeptCount: 1,
          promiseBrokenCount: 4,
        }),
      ],
      contactSummaries: {},
    });

    expect(desk.nextBestRows[0].row.studentId).toBe("same-dues-unreliable");
    expect(desk.nextBestRows[0].reasons).toContain("Low promise reliability");
  });

  it("reports overall promise kept rate from rows with promise history", () => {
    const desk = build({
      rows: [
        row("one", { promiseKeptCount: 3, promiseBrokenCount: 1 }),
        row("two", { promiseKeptCount: 1, promiseBrokenCount: 3 }),
        row("none"),
      ],
      contactSummaries: {},
    });

    expect(desk.metrics.promiseKeptRate).toBe(50);
  });
});
