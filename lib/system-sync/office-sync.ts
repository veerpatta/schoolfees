export type OfficeSyncStatus = "synced" | "needs_review" | "saved_but_sync_failed";

export type OfficeSyncOutcome = {
  status: OfficeSyncStatus;
  sessionLabel: string;
  affectedStudentIds: string[];
  message: string;
  reviewHref: string | null;
};

export type DuesSyncResultLike = {
  sessionLabel: string;
  affectedStudentIds: readonly string[];
  readyForPaymentCount: number;
  duesNeedAttentionCount: number;
  reasonSummary: string | null;
};

function uniqueStudentIds(studentIds: readonly string[]) {
  return [...new Set(studentIds.filter(Boolean))];
}

function sessionHealthHref(sessionLabel: string) {
  return `/protected/admin-tools/session-health?session=${encodeURIComponent(sessionLabel)}`;
}

export function buildSyncedOfficeSyncOutcome(payload: {
  sessionLabel: string;
  affectedStudentIds: readonly string[];
}): OfficeSyncOutcome {
  return {
    status: "synced",
    sessionLabel: payload.sessionLabel,
    affectedStudentIds: uniqueStudentIds(payload.affectedStudentIds),
    message: "Saved and synced automatically.",
    reviewHref: null,
  };
}

export function buildFailedOfficeSyncOutcome(payload: {
  sessionLabel: string;
  affectedStudentIds: readonly string[];
  error: unknown;
}): OfficeSyncOutcome {
  return {
    status: "saved_but_sync_failed",
    sessionLabel: payload.sessionLabel,
    affectedStudentIds: uniqueStudentIds(payload.affectedStudentIds),
    message: "Saved, but automatic sync could not finish. Open Session Health if totals look outdated.",
    reviewHref: sessionHealthHref(payload.sessionLabel),
  };
}

export function buildOfficeSyncOutcomeFromDuesResult(
  result: DuesSyncResultLike,
): OfficeSyncOutcome {
  const affectedStudentIds = uniqueStudentIds(result.affectedStudentIds);

  if (result.duesNeedAttentionCount === 0) {
    return buildSyncedOfficeSyncOutcome({
      sessionLabel: result.sessionLabel,
      affectedStudentIds,
    });
  }

  const reason = result.reasonSummary ?? "Open Session Health before collecting fees.";

  return {
    status: "needs_review",
    sessionLabel: result.sessionLabel,
    affectedStudentIds,
    message: `Saved, but fee setup needs review: ${reason}`,
    reviewHref: sessionHealthHref(result.sessionLabel),
  };
}
