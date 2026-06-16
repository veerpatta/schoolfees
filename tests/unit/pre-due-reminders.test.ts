import { describe, expect, it } from "vitest";

import { buildPreDueReminderList } from "@/lib/defaulters/pre-due";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

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
    classLabel: "Class 8",
    studentStatusLabel: "Old",
    transportRouteId: null,
    transportRouteLabel: "No Transport",
    totalDue: 24000,
    totalPaid: 12000,
    totalPending: 12000,
    overdueAmount: 0,
    lateFee: 0,
    discountApplied: 0,
    lateFeeWaived: 0,
    overdueInstallments: 0,
    openInstallments: 2,
    nextDueAmount: 6000,
    oldestDueDate: "2026-07-20",
    nextDueDate: "2026-07-20",
    lastPaymentDate: null,
    followUpStatus: "pending",
    daysOverdue: 0,
    defaulterScore: 12000,
    heat: 20,
    rank: 1,
    paymentBehavior: "new",
    promiseStatus: null,
    noCall: false,
    familyGroupId: null,
    familyVisibleSiblingCount: 0,
    prevYearDuesAmount: 0,
    ...overrides,
  };
}

describe("buildPreDueReminderList", () => {
  const today = new Date("2026-07-15T12:00:00+05:30");

  it("returns pending rows due within the reminder window ordered by due date and amount", () => {
    const list = buildPreDueReminderList({
      rows: [
        row("later", { nextDueDate: "2026-07-26", nextDueAmount: 9000 }),
        row("soon-large", { nextDueDate: "2026-07-18", nextDueAmount: 11000 }),
        row("soon-small", { nextDueDate: "2026-07-18", nextDueAmount: 3000 }),
        row("overdue", { nextDueDate: "2026-07-10", nextDueAmount: 6000, followUpStatus: "overdue", daysOverdue: 5 }),
        row("no-call", { nextDueDate: "2026-07-17", nextDueAmount: 6000, noCall: true }),
      ],
      today,
      windowDays: 7,
    });

    expect(list.entries.map((entry) => entry.row.studentId)).toEqual([
      "soon-large",
      "soon-small",
    ]);
    expect(list.metrics.totalRows).toBe(2);
    expect(list.metrics.totalAmount).toBe(14000);
  });

  it("groups due today, this week, and next week reminders", () => {
    const list = buildPreDueReminderList({
      rows: [
        row("today", { nextDueDate: "2026-07-15", nextDueAmount: 5000 }),
        row("week", { nextDueDate: "2026-07-19", nextDueAmount: 6000 }),
        row("next-week", { nextDueDate: "2026-07-25", nextDueAmount: 7000 }),
      ],
      today,
      windowDays: 14,
    });

    expect(list.metrics.dueTodayRows).toBe(1);
    expect(list.metrics.next7DaysRows).toBe(2);
    expect(list.metrics.next14DaysRows).toBe(3);
    expect(list.entries.map((entry) => entry.daysUntilDue)).toEqual([0, 4, 10]);
  });
});
