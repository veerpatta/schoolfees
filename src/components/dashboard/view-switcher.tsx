import Link from "next/link";

import { DASHBOARD_VIEWS, type DashboardView } from "@/lib/dashboard/analytics";
import { cn } from "@/platform/utils";

/**
 * The boards, instead of one fourteen-section scroll.
 *
 * Plain links driven by `?view=`, not a client tab component. The dashboard is
 * server-rendered and sits under a hard gzip ceiling, so a stateful switcher
 * would cost bundle for something the URL already models better -- and this way
 * a board is linkable, back works, and it survives with JavaScript off.
 *
 * On phones this is a WRAPPING GRID, not a horizontal scroller. It used to be
 * `-mx-4 overflow-x-auto` over a `w-max` row, which put five labels on a strip
 * about 130px wider than a 390px screen: the last board sat off the edge with
 * nothing indicating it was there, and nothing scrolled the active pill back
 * into view when you did reach it. The original note here said a wrapping
 * switcher "pushes the first tile below the fold" -- that was written when the
 * pills were full-height buttons in a single flex row. As a two-row grid of
 * compact pills it costs about 34px, and it stops the sixth board from making
 * the strip worse still.
 */
export function ViewSwitcher({
  current,
  sessionLabel,
  labels,
}: {
  current: DashboardView;
  sessionLabel: string;
  labels: Record<DashboardView, string>;
}) {
  return (
    <nav aria-label="Dashboard views" className="print:hidden">
      {/*
        Grid below sm so every board is on screen at once; the original single
        row from sm up, where it has always fitted.
      */}
      <ul className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 sm:flex sm:w-auto">
        {DASHBOARD_VIEWS.map((view) => {
          const active = view === current;
          return (
            <li key={view} className="sm:flex-1">
              <Link
                href={`/protected/dashboard?session=${encodeURIComponent(sessionLabel)}&view=${view}`}
                // The route is force-dynamic, so Next only prefetches the
                // loading shell by default and every board click paid a cold
                // server render. prefetch warms the whole RSC payload instead;
                // the boards read a session-tagged cache, so warming them
                // costs one query rather than one each.
                prefetch
                // Link scrolls to top by default, which threw the page upward
                // on every board click -- the switcher and the board under it
                // are both below the money band, so the one thing you are
                // looking at is the one thing that moved. These are tabs, not
                // page navigations; the reader stays where they were.
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center rounded-md px-2 py-2 text-center text-[13px] font-medium leading-tight transition-colors sm:whitespace-nowrap sm:px-3 sm:text-sm",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[view]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
