import { useCallback, useSyncExternalStore } from "react";

/** Stable identity so React never treats the server snapshot as changing. */
function getServerSnapshot() {
  return false;
}

/**
 * Whether the viewport currently matches `query`.
 *
 * Hydration-safe by construction. The previous implementation seeded
 * `useState` with `window.matchMedia(query).matches`, which IS defined during
 * hydration — so the first client render returned the real viewport answer
 * while the server HTML had been built from `false`. Anything gated on the
 * result (the Students bulk-select checkboxes, the Payment Desk phone branch)
 * then hydrated against markup that did not contain it. That is what Sentry
 * reported as a hydration error on the Students list for desktop staff.
 *
 * `useSyncExternalStore` fixes it at the source: React uses `getServerSnapshot`
 * for the hydration render, so client and server agree, then switches to the
 * live snapshot and re-renders once hydration has committed. The server cannot
 * know the viewport, so its snapshot is always `false` — a media query only
 * ever turns something on after mount, which is what the markup already shows.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);

      return () => {
        mediaQueryList.removeEventListener("change", onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
