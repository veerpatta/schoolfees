import { describe, expect, it } from "vitest";

import {
  buildFailedOfficeSyncOutcome,
  buildOfficeSyncOutcomeFromDuesResult,
  buildSyncedOfficeSyncOutcome,
} from "@/lib/system-sync/office-sync";

describe("office sync outcome", () => {
  it("summarizes a clean automatic dues sync for office actions", () => {
    const outcome = buildOfficeSyncOutcomeFromDuesResult({
      sessionLabel: "2026-27",
      affectedStudentIds: ["student-1", "student-1"],
      readyForPaymentCount: 1,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
    });

    expect(outcome).toEqual({
      status: "synced",
      sessionLabel: "2026-27",
      affectedStudentIds: ["student-1"],
      message: "Saved and synced automatically.",
      reviewHref: null,
    });
  });

  it("turns incomplete dues sync into a review outcome", () => {
    const outcome = buildOfficeSyncOutcomeFromDuesResult({
      sessionLabel: "2026-27",
      affectedStudentIds: ["student-1"],
      readyForPaymentCount: 0,
      duesNeedAttentionCount: 1,
      reasonSummary: "Class 1 does not have a fee amount.",
    });

    expect(outcome.status).toBe("needs_review");
    expect(outcome.message).toBe("Saved, but fee setup needs review: Class 1 does not have a fee amount.");
    expect(outcome.reviewHref).toBe("/protected/admin-tools/session-health?session=2026-27");
  });

  it("builds explicit success and failure outcomes for non-dues writes", () => {
    expect(
      buildSyncedOfficeSyncOutcome({
        sessionLabel: "TEST-2026-27",
        affectedStudentIds: [],
      }),
    ).toMatchObject({
      status: "synced",
      message: "Saved and synced automatically.",
    });

    expect(
      buildFailedOfficeSyncOutcome({
        sessionLabel: "TEST-2026-27",
        affectedStudentIds: ["student-1"],
        error: new Error("database unavailable"),
      }),
    ).toMatchObject({
      status: "saved_but_sync_failed",
      message: "Saved, but automatic sync could not finish. Open Session Health if totals look outdated.",
      reviewHref: "/protected/admin-tools/session-health?session=TEST-2026-27",
    });
  });
});
