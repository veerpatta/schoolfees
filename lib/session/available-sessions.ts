import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";

export type AvailableSessionRow = {
  id: string;
  session_label: string;
  status: string;
  is_current: boolean;
};

/**
 * The session the office falls back to when the active session cannot be read.
 *
 * Named, not indexed. This used to be `REQUIRED_OFFICE_SESSION_LABELS[1]`, so
 * removing an entry from the front of that list would have silently made the
 * TEST session the production fallback.
 */
export const FALLBACK_OFFICE_SESSION_LABEL = "2026-27";

/**
 * Sessions the switcher always offers, even if the database read times out.
 *
 * A label listed here that has no `academic_sessions` row is synthesized below
 * as a phantom entry — it appears in the switcher, and selecting it shows an
 * empty workspace with no classes, fee settings or students, which reads as
 * data loss rather than as a session that was never set up.
 *
 * `2025-26` was listed here and never existed. Last year's unpaid tuition lives
 * on 2026-27 students as carry-forward rows (see `lib/prev-year-dues/`), not as
 * its own session, so the label only ever produced an empty screen and a failing
 * `scripts/verify-required-sessions.mjs`. Do not add a label here until the
 * session actually exists.
 */
export const REQUIRED_OFFICE_SESSION_LABELS = [
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
