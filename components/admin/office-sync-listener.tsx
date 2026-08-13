"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type OfficeSyncListenerProps = {
  sessionLabel: string;
};

/** Collapse a burst of postings into one refresh. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Re-renders the current page when someone else in the office changes money.
 *
 * Two things here are deliberate, and both are about cost.
 *
 * **The Supabase client is imported inside the effect.** A static import pulled
 * `@supabase/supabase-js` — realtime and all — into the eager chunk of every
 * protected route: 60.8 KB gzip on the dashboard, the Payment Desk, Exports and
 * Admin Tools, for one listener that renders nothing. Loading it after mount
 * moves it to its own chunk and off the critical path.
 *
 * **Refreshes are debounced, and skipped while the tab is hidden.** Every page
 * in this app is `force-dynamic`, so `router.refresh()` is a complete server
 * render — auth, policy, shell pulse and page data. Previously every INSERT on
 * `office_sync_events` triggered one in every open tab, so a busy collection
 * hour had the office's idle tabs re-rendering continuously against the same
 * database the visible page was waiting on. A hidden tab now records that it is
 * stale and catches up once, when someone looks at it.
 */
export function OfficeSyncListener({ sessionLabel }: OfficeSyncListenerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!sessionLabel) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missedWhileHidden = false;
    let teardown: (() => void) | undefined;

    const refreshNow = () => {
      missedWhileHidden = false;
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      if (document.hidden) {
        missedWhileHidden = true;
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(refreshNow, REFRESH_DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (!document.hidden && missedWhileHidden) {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    void import("@/lib/supabase/client")
      .then(({ createClient }) => {
        if (cancelled) {
          return;
        }

        const supabase = createClient();
        const channel = supabase
          .channel(`office-sync:${sessionLabel}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "office_sync_events",
              filter: `session_label=eq.${sessionLabel}`,
            },
            scheduleRefresh,
          )
          .subscribe();

        teardown = () => {
          void supabase.removeChannel(channel);
        };
      })
      .catch(() => {
        // No realtime channel means the page simply does not auto-refresh.
        // Every screen still has its own reload path; this is a convenience.
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      teardown?.();
    };
  }, [router, sessionLabel]);

  return null;
}
