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

  it("keeps read-only staff on a wait state for payment posting blockers", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 4,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: false,
        collectionDeskReady: false,
        setupReadyForCompletion: false,
      },
      "read_only_staff",
    );

    expect(readiness.postPayments.isReady).toBe(false);
    expect(readiness.postPayments.actionLabel).toBeNull();
    expect(readiness.postPayments.detail).toContain("waiting on admin setup");
  });

  it("points recalculation blockers to Fee Setup once students exist but defaults are missing", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 6,
        hasFeeDefaults: false,
        hasStudents: true,
        ledgerReady: false,
        collectionDeskReady: false,
        setupReadyForCompletion: false,
      },
      "admin",
    );

    expect(readiness.recalculateLedgers.isReady).toBe(false);
    expect(readiness.recalculateLedgers.actionHref).toBe("/protected/fee-setup");
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
