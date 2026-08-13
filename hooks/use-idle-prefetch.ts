"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Warm a few routes once the browser is idle, instead of while the page the
 * staffer is actually looking at is still loading.
 *
 * Every page in this app is `force-dynamic`, so a prefetch is not a cheap
 * static fetch — it is a server render with its own auth check, `users` lookup,
 * fee-policy read and shell pulse. Firing three or four of them from a `useEffect`
 * on mount put that work in direct competition with the visible page, against
 * the same database, at the exact moment the visible page was waiting on it.
 *
 * Two changes make the same warm cache much cheaper:
 *
 * - **Wait for idle.** Nothing is prefetched until the browser says it has
 *   spare time, with a timeout so it still happens on a busy machine.
 * - **Stagger.** Warming N routes at once is N simultaneous server renders.
 *   Spacing them keeps the burst off the database.
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

    return () => {
      cancelled = true;
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
