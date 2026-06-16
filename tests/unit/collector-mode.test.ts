import { describe, expect, it } from "vitest";

import { buildCollectorSession } from "@/lib/defaulters/collector";
import type { RecoveryDeskEntry } from "@/lib/defaulters/recovery";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

function entry(studentId: string): RecoveryDeskEntry {
  return {
    row: {
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
      totalDue: 20000,
      totalPaid: 5000,
      totalPending: 15000,
      overdueAmount: 6000,
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
      daysOverdue: 20,
      defaulterScore: 17000,
      heat: 60,
      rank: 1,
      paymentBehavior: "new",
      promiseStatus: null,
      noCall: false,
      familyGroupId: null,
      familyVisibleSiblingCount: 0,
      prevYearDuesAmount: 0,
    } satisfies DefaulterSummaryRow,
    summary: null,
    cadence: "now",
    priorityScore: 100,
    reasons: ["Overdue balance"],
  };
}

describe("buildCollectorSession", () => {
  it("starts at the first ranked entry when no current student is selected", () => {
    const session = buildCollectorSession([entry("a"), entry("b")]);

    expect(session.current?.row.studentId).toBe("a");
    expect(session.position).toBe(1);
    expect(session.total).toBe(2);
    expect(session.nextStudentId).toBe("b");
  });

  it("keeps the current student when it is still in the queue", () => {
    const session = buildCollectorSession([entry("a"), entry("b"), entry("c")], "b");

    expect(session.current?.row.studentId).toBe("b");
    expect(session.position).toBe(2);
    expect(session.previousStudentId).toBe("a");
    expect(session.nextStudentId).toBe("c");
  });
});
