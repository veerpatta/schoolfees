import "server-only";

import {
  alignAcademicCurrentSessionWithFeeSetup as alignAcademicCurrentSessionWithFeeSetupLegacy,
  getSystemSyncHealth as getLegacySystemSyncHealth,
  getRawActiveSessionStudentCount as getLegacyRawActiveSessionStudentCount,
  getRawClassStudentSummary as getLegacyRawClassStudentSummary,
  generateMissingSessionDues,
  autoReconcileSessionIfSafe,
  hasPreparedDues,
  revalidateFinanceSurfaces,
  summarizeDuesPreparationIssues,
  syncAfterFeeSetupChange,
  syncAfterStudentBulkImport as syncAfterStudentBulkImportLegacy,
  syncAfterStudentChange as syncAfterStudentChangeLegacy,
  syncSessionFinancials,
  syncStudentFinancials,
  toAutomaticDuesPreparationResult,
  type AutomaticDuesPreparationResult,
  type FinancialSyncResult,
  type SystemSyncHealth,
} from "@/lib/system-sync/financial-sync";
import {
  revalidateAfterPaymentPosting,
  revalidateCoreFinancePaths,
  revalidateSessionFinance,
} from "@/lib/system-sync/finance-revalidation";

export { revalidateAfterPaymentPosting, revalidateCoreFinancePaths, revalidateSessionFinance };
export {
  hasPreparedDues,
  revalidateFinanceSurfaces,
  summarizeDuesPreparationIssues,
  syncSessionFinancials,
  autoReconcileSessionIfSafe,
  syncStudentFinancials,
};
export type { FinancialSyncResult, SystemSyncHealth };
export type { AutomaticDuesPreparationResult };
export { getLiveDataHealth } from "@/lib/system-sync/live-data-health";
export type { LiveDataHealth } from "@/lib/system-sync/live-data-health";

export async function prepareDuesForStudentsAutomatically(payload: {
  studentIds: readonly string[];
  sessionLabel?: string;
  reason?: string;
  useSystemClient?: boolean;
}) {
  const result = await syncStudentFinancials({
    studentIds: payload.studentIds,
    sessionLabel: payload.sessionLabel,
    reason: payload.reason ?? "Automatic dues preparation",
    useSystemClient: payload.useSystemClient ?? true,
  });

  return toAutomaticDuesPreparationResult(payload.studentIds, result);
}

export async function syncAfterStudentChange(studentId: string) {
  return syncAfterStudentChangeLegacy({ studentId });
}

export async function syncAfterStudentBulkImport(payload: { studentIds: readonly string[] }) {
  return syncAfterStudentBulkImportLegacy(payload);
}

export async function syncAfterFeeSetupChangeForSession(sessionLabel: string) {
  return syncAfterFeeSetupChange({ sessionLabel });
}

export async function repairMissingDues(sessionLabel: string) {
  return generateMissingSessionDues({
    sessionLabel,
    reason: "Repair missing dues",
    useSystemClient: true,
  });
}

export async function getSystemSyncHealth(sessionLabel?: string) {
  return getLegacySystemSyncHealth(sessionLabel);
}

export async function getRawActiveSessionStudentCount(sessionLabel: string) {
  return getLegacyRawActiveSessionStudentCount(sessionLabel);
}

export async function getRawClassStudentSummary(sessionLabel: string) {
  return getLegacyRawClassStudentSummary(sessionLabel);
}

export async function alignWorkingSessionWithFeeSetup() {
  return alignAcademicCurrentSessionWithFeeSetupLegacy();
}
