"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Warm a few routes once the browser is idle, instead of while the page the
 * staffer is actually looking at is still loading.
 *
 * What a prefetch costs here: every page in this app is `force-dynamic`, and
 * Next's default prefetch (`router.prefetch`, or a Link without `prefetch`)
 * renders a dynamic route only as far as its `loading.tsx` -- the route tree
 * and the skeleton, never the page data. It still passes the auth proxy and
 * occupies a server render, so firing several from a mount effect competed
 * with the visible page at the exact moment it was waiting on the database.
 *
 * Two changes make the same warm cache much cheaper:
 *
 * - **Wait for idle.** Nothing is prefetched until the browser says it has
 *   spare time, with a timeout so it still happens on a busy machine.
 * - **Stagger.** Warming N routes at once is N simultaneous server renders.
 *   Spacing them keeps the burst off the database.
 *
 * A prefetched entry expires after `staleTimes.dynamic` (next.config.ts), and
 * nothing re-warms it on its own. A phone that comes back from the pocket or
 * from another app is well past that window, so the routes are warmed again
 * when the tab becomes visible.
 */
const STAGGER_MS = 400;
const IDLE_TIMEOUT_MS = 4000;
const FALLBACK_DELAY_MS = 1200;

export function useIdlePrefetch(hrefs: readonly string[], enabled = true) {
  const router = useRouter();
  // Effects key off a string so a fresh array literal on every render does not
  // re-warm the same routes.
  const key = hrefs.join("|");

  useEffect(() => {
    if (!enabled || key.length === 0) {
      return;
    }

    const targets = key.split("|");
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    let idleHandle: number | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const warm = () => {
      if (cancelled) {
        return;
      }

      targets.forEach((href, index) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              router.prefetch(href);
            }
          }, index * STAGGER_MS),
        );
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(warm, { timeout: IDLE_TIMEOUT_MS });
    } else {
      fallbackTimer = setTimeout(warm, FALLBACK_DELAY_MS);
    }

    let wasHidden = document.hidden;
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        return;
      }
      if (wasHidden) {
        wasHidden = false;
        warm();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      timers.forEach(clearTimeout);
      if (fallbackTimer !== undefined) {
        clearTimeout(fallbackTimer);
      }
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [enabled, key, router]);
}
