import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";

export type AvailableSessionRow = {
  id: string;
  session_label: string;
  status: string;
  is_current: boolean;
};

export const REQUIRED_OFFICE_SESSION_LABELS = [
  "2025-26",
  "2026-27",
  "TEST-2026-27",
] as const;

export function mergeRequiredOfficeSessions(
  rows: Omit<AvailableSessionRow, "is_current">[],
  activeSessionLabel: string,
): AvailableSessionRow[] {
  const normalizedActiveSession = activeSessionLabel.trim().toLowerCase();
  const byLabel = new Map<string, AvailableSessionRow>();

  rows.forEach((row) => {
    const sessionLabel = row.session_label.trim();

    if (!sessionLabel) {
      return;
    }

    byLabel.set(sessionLabel.toLowerCase(), {
      ...row,
      session_label: sessionLabel,
      is_current: sessionLabel.toLowerCase() === normalizedActiveSession,
    });
  });

  REQUIRED_OFFICE_SESSION_LABELS.forEach((sessionLabel) => {
    const key = sessionLabel.toLowerCase();

    if (byLabel.has(key)) {
      return;
    }

    byLabel.set(key, {
      id: `required:${sessionLabel}`,
      session_label: sessionLabel,
      status: "active",
      is_current: key === normalizedActiveSession,
    });
  });

  return Array.from(byLabel.values())
    .filter((row) => {
      try {
        parseAcademicSessionLabel(row.session_label);
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
      if (left.is_current !== right.is_current) {
        return Number(right.is_current) - Number(left.is_current);
      }

      return right.session_label.localeCompare(left.session_label);
    });
}
