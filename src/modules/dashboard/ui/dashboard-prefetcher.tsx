"use client";

import { useMemo } from "react";

import { useIdlePrefetch } from "@/ui/hooks/use-idle-prefetch";
import { appendSessionParam } from "@/platform/navigation/session-href";

type DashboardPrefetcherProps = {
  sessionLabel: string;
  canPostPayments: boolean;
};

/**
 * Warms the two screens the office reaches for after the dashboard.
 *
 * This used to fire both prefetches from a mount effect. Both targets are
 * `force-dynamic`, so that was two extra server renders (each as far as its
 * loading.tsx -- a default prefetch never fetches page data) competing with the
 * dashboard's own — which is the heaviest read in the app — for the same
 * database connection, at the moment the dashboard was waiting on it. The
 * destinations are still warmed; they just wait for the browser to be idle now.
 */
export function DashboardPrefetcher({
  sessionLabel,
  canPostPayments,
}: DashboardPrefetcherProps) {
  const hrefs = useMemo(
    () =>
      [canPostPayments ? "/protected/payments" : null, "/protected/defaulters"]
        .filter((href): href is string => Boolean(href))
        .map((href) => appendSessionParam(href, sessionLabel)),
    [canPostPayments, sessionLabel],
  );

  useIdlePrefetch(hrefs);

  return null;
}
