import Link from "next/link";

import { DASHBOARD_VIEWS, type DashboardView } from "@/lib/dashboard/analytics";
import { cn } from "@/lib/utils";

/**
 * Five boards instead of one fourteen-section scroll.
 *
 * Plain links driven by `?view=`, not a client tab component. The dashboard is
 * server-rendered and sits under a hard gzip ceiling, so a stateful switcher
 * would cost bundle for something the URL already models better -- and this way
 * a board is linkable, back works, and it survives with JavaScript off.
 *
 * On phones it scrolls horizontally rather than wrapping to two rows: a
 * wrapping switcher pushes the first tile below the fold on a 390px screen.
 */
export function ViewSwitcher({
  current,
  sessionLabel,
  labels,
  counts,
}: {
  current: DashboardView;
  sessionLabel: string;
  labels: Record<DashboardView, string>;
  counts?: Partial<Record<DashboardView, string>>;
}) {
  return (
    <nav
      aria-label="Dashboard views"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden"
    >
      <ul className="flex w-max min-w-full gap-1 rounded-lg bg-surface-2 p-1 sm:w-auto">
        {DASHBOARD_VIEWS.map((view) => {
          const active = view === current;
          return (
            <li key={view} className="flex-1">
              <Link
                href={`/protected/dashboard?session=${encodeURIComponent(sessionLabel)}&view=${view}`}
                // The route is force-dynamic, so Next only prefetches the
                // loading shell by default and every board click paid a cold
                // server render. prefetch warms the whole RSC payload instead;
                // the boards read a session-tagged cache, so warming four of
                // them costs one query rather than four.
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[view]}
                {counts?.[view] ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular",
                      active ? "bg-surface-2 text-muted-foreground" : "bg-surface-3 text-muted-foreground",
                    )}
                  >
                    {counts[view]}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
