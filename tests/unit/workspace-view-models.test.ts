import { describe, expect, it } from "vitest";

import {
  buildDefaulterCallProgress,
  getRecoveryQueuePosition,
  getSelectedRecoveryEntry,
} from "@/lib/defaulters/workspace";
import type { RecoveryDeskEntry } from "@/lib/defaulters/recovery";
import {
  filterStudentWorkspaceRows,
  getRecentlyViewedStudents,
} from "@/lib/students/list-view-model";
import type { StudentListItem } from "@/lib/students/types";

const students = [
  {
    id: "student-1",
    fullName: "Asha Sharma",
    admissionNo: "SR-1",
    classLabel: "Class 1",
    fatherPhone: "9000000001",
    motherPhone: null,
    outstandingAmount: 2000,
    financialLoading: false,
  },
  {
    id: "student-2",
    fullName: "Bina Singh",
    admissionNo: "SR-2",
    classLabel: "Class 2",
    fatherPhone: null,
    motherPhone: "9000000002",
    outstandingAmount: 0,
    financialLoading: false,
  },
] as StudentListItem[];

const queue = [
  {
    row: { studentId: "student-1", fullName: "Asha Sharma" },
    summary: null,
    cadence: {},
    priorityScore: 100,
    reasons: [],
  },
  {
    row: { studentId: "student-2", fullName: "Bina Singh" },
    summary: null,
    cadence: {},
    priorityScore: 80,
    reasons: [],
  },
] as unknown as RecoveryDeskEntry[];

describe("shared Students and Defaulters view models", () => {
  it("uses one student query and dues filter for desktop rows and mobile cards", () => {
    expect(
      filterStudentWorkspaceRows({
        students,
        query: "900000000",
        onlyWithDues: true,
      }).map((student) => student.id),
    ).toEqual(["student-1"]);
  });

  it("orders recent students from the same last-viewed contract", () => {
    expect(
      getRecentlyViewedStudents({
        students,
        lastViewedByUser: {
          "student-1": "2026-07-27T08:00:00.000Z",
          "student-2": "2026-07-27T09:00:00.000Z",
        },
      }).map((student) => student.id),
    ).toEqual(["student-2", "student-1"]);
  });

  it("keeps desktop queue selection and mobile call progress on one queue", () => {
    expect(getSelectedRecoveryEntry(queue, "student-2")?.row.studentId).toBe("student-2");
    expect(getRecoveryQueuePosition(queue, "student-2")).toBe(1);

    expect(
      buildDefaulterCallProgress({
        queue,
        summaries: {
          "student-1": {
            snoozeUntil: "2026-07-30",
            lastContactedAt: "2026-07-27T08:00:00.000Z",
            lastOutcome: "promised_pay",
          },
        },
        loggedOrder: ["student-1"],
        now: new Date("2026-07-27T10:00:00.000+05:30"),
      }),
    ).toMatchObject({
      logged: 1,
      promises: 1,
      total: 2,
    });
  });
});
