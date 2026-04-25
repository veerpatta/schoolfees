import "server-only";

import {
  getSystemSyncHealth as getLegacySystemSyncHealth,
  getRawActiveSessionStudentCount as getLegacyRawActiveSessionStudentCount,
  getRawClassStudentSummary as getLegacyRawClassStudentSummary,
  revalidateFinanceSurfaces,
  syncAfterFeeSetupChange,
  syncAfterStudentBulkImport as syncAfterStudentBulkImportLegacy,
  syncAfterStudentChange as syncAfterStudentChangeLegacy,
  syncSessionFinancials,
  syncStudentFinancials,
  type FinancialSyncResult,
  type SystemSyncHealth,
} from "@/lib/system-sync/financial-sync";
import { revalidateCoreFinancePaths } from "@/lib/system-sync/finance-revalidation";

export { revalidateCoreFinancePaths };
export { revalidateFinanceSurfaces, syncSessionFinancials, syncStudentFinancials };
export type { FinancialSyncResult, SystemSyncHealth };

export async function syncStudentDues(studentIds: readonly string[]) {
  return syncStudentFinancials({
    studentIds,
    reason: "Student dues sync",
  });
}

export async function syncSessionDues(sessionLabel: string) {
  return syncSessionFinancials({
    sessionLabel,
    reason: "Session dues sync",
  });
}

export async function syncAfterStudentChange(studentId: string) {
  return syncAfterStudentChangeLegacy({ studentId });
}

export async function syncAfterBulkStudentImport(studentIds: readonly string[]) {
  return syncAfterStudentBulkImportLegacy({ studentIds });
}

export async function syncAfterStudentBulkImport(payload: { studentIds: readonly string[] }) {
  return syncAfterStudentBulkImportLegacy(payload);
}

export async function syncAfterFeeSetupPublish(sessionLabel: string) {
  return syncSessionFinancials({
    sessionLabel,
    reason: "Fee Setup published",
  });
}

export async function syncAfterFeeSetupChangeForSession(sessionLabel: string) {
  return syncAfterFeeSetupChange({ sessionLabel });
}

export async function repairMissingDues(sessionLabel: string) {
  return syncSessionFinancials({
    sessionLabel,
    reason: "Repair missing dues",
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
