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
        missingBlockingItemKeys: [],
      },
      "admin",
    );

    expect(readiness.addStudent.isReady).toBe(false);
    expect(readiness.addStudent.actionHref).toBe("/protected/master-data");
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
        missingBlockingItemKeys: [],
      },
      "accountant",
    );

    expect(readiness.importStudents.isReady).toBe(false);
    expect(readiness.importStudents.actionLabel).toBeNull();
    expect(readiness.importStudents.detail).toContain("waiting on admin setup");
  });

  it("allows payment posting when dues recalculation is still catching up", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 4,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: false,
        collectionDeskReady: true,
        setupReadyForCompletion: true,
        missingBlockingItemKeys: ["ledgers_generated"],
      },
      "view_only",
    );

    expect(readiness.postPayments.isReady).toBe(true);
    expect(readiness.postPayments.actionLabel).toBeNull();
    expect(readiness.postPayments.actionHref).toBeNull();
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
        missingBlockingItemKeys: ["fee_defaults_configured"],
      },
      "admin",
    );

    expect(readiness.recalculateLedgers.isReady).toBe(false);
    expect(readiness.recalculateLedgers.actionHref).toBe("/protected/fee-setup");
  });

  it("does not block payment posting only because ledger generation is pending", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 12,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: false,
        collectionDeskReady: true,
        setupReadyForCompletion: true,
        missingBlockingItemKeys: ["ledgers_generated"],
      },
      "admin",
    );

    expect(readiness.postPayments.isReady).toBe(true);
    expect(readiness.postPayments.actionHref).toBeNull();
  });

  it("marks payment posting ready when setup completion note has not been saved yet", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 12,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: true,
        collectionDeskReady: true,
        setupReadyForCompletion: true,
        missingBlockingItemKeys: [],
      },
      "admin",
    );

    expect(readiness.postPayments.isReady).toBe(true);
    expect(readiness.postPayments.actionHref).toBeNull();
    expect(readiness.postPayments.actionLabel).toBeNull();
  });

  it("points missing class defaults to fee setup", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 12,
        hasFeeDefaults: false,
        hasStudents: true,
        ledgerReady: false,
        collectionDeskReady: false,
        setupReadyForCompletion: false,
        missingBlockingItemKeys: ["fee_defaults_configured", "ledgers_generated"],
      },
      "admin",
    );

    expect(readiness.postPayments.isReady).toBe(false);
    expect(readiness.postPayments.actionHref).toBe("/protected/fee-setup");
  });

  it("marks payment posting ready when operational and completion checks are complete", () => {
    const readiness = buildOfficeWorkflowReadiness(
      {
        classCount: 12,
        hasFeeDefaults: true,
        hasStudents: true,
        ledgerReady: true,
        collectionDeskReady: true,
        setupReadyForCompletion: true,
        missingBlockingItemKeys: [],
      },
      "admin",
    );

    expect(readiness.postPayments.isReady).toBe(true);
    expect(readiness.recalculateLedgers.isReady).toBe(true);
  });
});
