import type { RecoveryDeskEntry } from "@/lib/defaulters/recovery";

export type CollectorSession = {
  current: RecoveryDeskEntry | null;
  position: number;
  total: number;
  previousStudentId: string | null;
  nextStudentId: string | null;
};

export function buildCollectorSession(
  entries: RecoveryDeskEntry[],
  currentStudentId?: string | null,
): CollectorSession {
  const total = entries.length;

  if (total === 0) {
    return {
      current: null,
      position: 0,
      total: 0,
      previousStudentId: null,
      nextStudentId: null,
    };
  }

  const requestedIndex = currentStudentId
    ? entries.findIndex((entry) => entry.row.studentId === currentStudentId)
    : -1;
  const index = requestedIndex >= 0 ? requestedIndex : 0;

  return {
    current: entries[index] ?? null,
    position: index + 1,
    total,
    previousStudentId: index > 0 ? entries[index - 1]?.row.studentId ?? null : null,
    nextStudentId: index < total - 1 ? entries[index + 1]?.row.studentId ?? null : null,
  };
}
