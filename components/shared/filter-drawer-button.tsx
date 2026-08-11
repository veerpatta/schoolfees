"use client";

import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Filters ③" — the toolbar trigger for a module's filter drawer.
 *
 * Students and Transactions each rendered all 24 segment chips inline, in four
 * labelled families, permanently expanded. That cost ~250px on Students and
 * ~270px on Transactions, so on a 900px laptop the office saw filter controls
 * where the data should be. The chips were not the problem — the counts on them
 * are genuinely useful — but they are a *choosing* surface, and choosing is
 * occasional while reading the list is constant.
 *
 * So the chips moved into the drawer each module already had for its phone
 * layout, and this button carries their state: the badge says how many filters
 * are on without opening anything, and `ActiveFilterSummary` restates each one
 * as a removable pill beneath the toolbar. Nothing is hidden; it just stopped
 * occupying a third of the screen.
 *
 * Deliberately a trigger only, not a trigger plus its own <Sheet>. Both modules
 * already own a filter sheet with module-specific content (route chips, status,
 * academic year, Apply/Reset) that the phone button opens, and those sheets are
 * covered by tests. Pointing this button at the same open-state gives one
 * drawer per module rather than a second, near-duplicate one.
 */

export type FilterDrawerButtonProps = {
  onClick: () => void;
  /** Whether the drawer this button controls is currently open. */
  expanded: boolean;
  /** Number of filters applied inside the drawer; renders as a badge when > 0. */
  activeCount: number;
  label: string;
  className?: string;
};

export function FilterDrawerButton({
  onClick,
  expanded,
  activeCount,
  label,
  className,
}: FilterDrawerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(
        "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3",
        "text-sm font-medium transition-colors",
        activeCount > 0
          ? "border-accent bg-accent-soft text-accent-soft-foreground"
          : "border-border bg-surface-2 text-foreground hover:border-border-strong",
        className,
      )}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden="true" />
      {label}
      {activeCount > 0 ? (
        <span className="grid size-4 place-items-center rounded-full bg-accent text-[10px] font-bold tabular-nums text-accent-foreground">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}
