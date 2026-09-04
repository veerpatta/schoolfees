"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type OfficeSyncListenerProps = {
  sessionLabel: string;
};

/** Collapse a burst of postings into one refresh. */
const REFRESH_DEBOUNCE_MS = 1500;
/** How often a refresh held back by an open sheet or a focused field re-checks. */
const DEFER_RETRY_MS = 2000;
/** Long enough for the next field to take focus before the check re-runs. */
const FOCUS_SETTLE_MS = 250;
/**
 * The longest a refresh is held back for. After this it goes ahead whatever
 * the cashier is doing: the number on screen must not fall further behind the
 * office than the server-side ceiling the dashboard already tolerates.
 */
const DEFER_MAX_MS = 30_000;

/**
 * Whether the staffer is in the middle of something a re-render would
 * disturb: a sheet is open, or the keyboard is up in a field.
 *
 * The sheet primitive marks `<html data-sheet-open>` while any sheet holds
 * the scroll lock. Reading the attribute rather than importing the primitive
 * keeps sheet.tsx out of the shell chunk of routes that never open one.
 */
function isInteracting() {
  return (
    document.documentElement.hasAttribute("data-sheet-open") ||
    Boolean(document.activeElement?.matches("input,textarea,select,[contenteditable]"))
  );
}

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
 *
 * **Refreshes wait for the cashier's hands to be free.** A refresh re-renders
 * the whole page, including an open payment sheet and whatever is being typed
 * into it. While a sheet is open or a field has focus the refresh is held back
 * and re-checked every couple of seconds, for at most DEFER_MAX_MS, and then
 * runs when the sheet closes or the field blurs -- whichever comes first.
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
    let deferredSince: number | null = null;

    const refreshNow = () => {
      if (cancelled) {
        return;
      }

      const waitedTooLong =
        deferredSince !== null && Date.now() - deferredSince >= DEFER_MAX_MS;
      if (!waitedTooLong && isInteracting()) {
        deferredSince ??= Date.now();
        clearTimeout(timer);
        timer = setTimeout(refreshNow, DEFER_RETRY_MS);
        return;
      }

      deferredSince = null;
      missedWhileHidden = false;
      router.refresh();
    };

    // A field losing focus (the keyboard going down, a sheet closing) is the
    // earliest moment a held-back refresh can run without getting in the way.
    // The short wait lets focus settle first: moving between two fields fires
    // focusout while activeElement is briefly the body.
    const onFocusOut = () => {
      if (deferredSince !== null) {
        clearTimeout(timer);
        timer = setTimeout(refreshNow, FOCUS_SETTLE_MS);
      }
    };
    document.addEventListener("focusout", onFocusOut);

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

    void import("@/platform/supabase/client")
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
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      teardown?.();
    };
  }, [router, sessionLabel]);

  return null;
}
