import "server-only";

import {
  FALLBACK_OFFICE_SESSION_LABEL,
  mergeRequiredOfficeSessions,
  type AvailableSessionRow,
} from "@/platform/session/available-sessions";
import { getActiveSessionLabel } from "@/platform/session/active";
import { createClient } from "@/platform/supabase/server";

export type SessionSwitcherData = {
  activeSessionLabel: string;
  availableSessions: AvailableSessionRow[];
};

const SESSION_SWITCHER_TIMEOUT_MS = 1200;
const SESSION_SWITCHER_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedSessionSwitcherData:
  | {
      expiresAt: number;
      data: SessionSwitcherData;
    }
  | null = null;

/**
 * Drop the in-process switcher cache.
 *
 * The cache holds `activeSessionLabel` and the per-row `is_current` flags for
 * five minutes, in module scope — so it survives every request that instance
 * serves. Changing the active session revalidates the `app-settings` Next tag,
 * but that does nothing to this, and for up to five minutes afterwards the
 * switcher would keep showing the OLD session as live to everyone on that
 * instance. `setActiveSession` calls this so the two invalidations stay in step.
 */
export function clearSessionSwitcherCache() {
  cachedSessionSwitcherData = null;
}

function timeoutAfter<T>(fallback: T, timeoutMs = SESSION_SWITCHER_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(fallback), timeoutMs);
  });
}

export async function getSessionSwitcherData(): Promise<SessionSwitcherData> {
  const now = Date.now();

  if (cachedSessionSwitcherData && cachedSessionSwitcherData.expiresAt > now) {
    return cachedSessionSwitcherData.data;
  }

  const fallbackActiveSessionLabel = FALLBACK_OFFICE_SESSION_LABEL;
  const activeSessionLabel = await Promise.race([
    getActiveSessionLabel().catch(() => fallbackActiveSessionLabel),
    timeoutAfter(fallbackActiveSessionLabel),
  ]);

  let rows: Omit<AvailableSessionRow, "is_current">[] = [];

  try {
    const supabase = await createClient();
    const response = await Promise.race([
      supabase
        .from("academic_sessions")
        .select("id, session_label, status")
        .order("session_label", { ascending: false }),
      timeoutAfter(null),
    ] as const);

    if (response?.error) {
      rows = [];
    } else {
      rows = (response?.data ?? []) as Omit<AvailableSessionRow, "is_current">[];
    }
  } catch {
    rows = [];
  }

  const data =
    rows.length === 0
      ? {
          activeSessionLabel,
          availableSessions: mergeRequiredOfficeSessions([], activeSessionLabel),
        }
      : {
          activeSessionLabel,
          availableSessions: mergeRequiredOfficeSessions(rows, activeSessionLabel),
        };

  cachedSessionSwitcherData = {
    expiresAt: now + SESSION_SWITCHER_CACHE_TTL_MS,
    data,
  };

  return data;
}
