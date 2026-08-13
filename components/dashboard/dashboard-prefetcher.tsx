"use client";

import { useMemo } from "react";

import { useIdlePrefetch } from "@/hooks/use-idle-prefetch";
import { appendSessionParam } from "@/lib/navigation/session-href";

type DashboardPrefetcherProps = {
  sessionLabel: string;
  canPostPayments: boolean;
};

/**
 * Warms the two screens the office reaches for after the dashboard.
 *
 * This used to fire both prefetches from a mount effect. Both targets are
 * `force-dynamic`, so that was two extra full server renders competing with the
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
