import { describe, expect, it } from "vitest";

import { buildOfficeWorkflowReadiness } from "@/lib/office/readiness";

describe("office workflow readiness", () => {
  it("blocks student entry until classes exist", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 0,
        hasFeeDefaults: false,
        hasStudents: false,
        ledgerReady: false,
        collectionDeskReady: false,
        setupReadyForCompletion: false,
      },
      "admin",
    );

    expect(readiness.addStudent.isReady).toBe(false);
    expect(readiness.addStudent.actionHref).toBe("/protected/setup#classes");
  });

  it("tells accountants to wait on admin setup instead of offering admin actions", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 0,
        hasFeeDefaults: false,
        hasStudents: false,
        ledgerReady: false,
        collectionDeskReady: false,
        setupReadyForCompletion: false,
      },
      "accountant",
    );

    expect(readiness.importStudents.isReady).toBe(false);
    expect(readiness.importStudents.actionLabel).toBeNull();
    expect(readiness.importStudents.detail).toContain("waiting on admin setup");
  });

  it("marks payment posting ready only when the collection desk is ready", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 12,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: true,
        collectionDeskReady: true,
        setupReadyForCompletion: true,
      },
      "admin",
    );

    expect(readiness.postPayments.isReady).toBe(true);
    expect(readiness.recalculateLedgers.isReady).toBe(true);
  });
});
