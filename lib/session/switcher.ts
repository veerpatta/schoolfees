import "server-only";

import {
  mergeRequiredOfficeSessions,
  REQUIRED_OFFICE_SESSION_LABELS,
  type AvailableSessionRow,
} from "@/lib/session/available-sessions";
import { getActiveSessionLabel } from "@/lib/session/active";
import { createClient } from "@/lib/supabase/server";

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

  const fallbackActiveSessionLabel = REQUIRED_OFFICE_SESSION_LABELS[1];
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
