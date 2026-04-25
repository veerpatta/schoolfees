import type { StudentStatus } from "@/lib/db/types";

type NullableFeeNumber = number | null;

export type DuesSyncStudentSnapshot = {
  status: StudentStatus;
  classId: string;
  transportRouteId: string | null;
  studentTypeOverride: "new" | "existing" | null;
  tuitionOverride: NullableFeeNumber;
  transportOverride: NullableFeeNumber;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: NullableFeeNumber;
};

const DUES_SYNC_STATUSES = new Set<StudentStatus>(["active", "inactive", "left", "graduated"]);

export function isDuesSyncRelevantStatus(status: StudentStatus) {
  return DUES_SYNC_STATUSES.has(status);
}

function normalizeNullableText(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeNullableNumber(value: NullableFeeNumber) {
  return value ?? null;
}

export function shouldSyncStudentDuesForChange(
  previous: DuesSyncStudentSnapshot | null,
  next: DuesSyncStudentSnapshot,
) {
  if (!previous) {
    return isDuesSyncRelevantStatus(next.status);
  }

  return (
    previous.status !== next.status ||
    previous.classId !== next.classId ||
    previous.transportRouteId !== next.transportRouteId ||
    previous.studentTypeOverride !== next.studentTypeOverride ||
    normalizeNullableNumber(previous.tuitionOverride) !== normalizeNullableNumber(next.tuitionOverride) ||
    normalizeNullableNumber(previous.transportOverride) !== normalizeNullableNumber(next.transportOverride) ||
    previous.discountAmount !== next.discountAmount ||
    previous.lateFeeWaiverAmount !== next.lateFeeWaiverAmount ||
    normalizeNullableText(previous.otherAdjustmentHead) !== normalizeNullableText(next.otherAdjustmentHead) ||
    normalizeNullableNumber(previous.otherAdjustmentAmount) !== normalizeNullableNumber(next.otherAdjustmentAmount)
  );
}
