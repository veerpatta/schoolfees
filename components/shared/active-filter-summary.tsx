"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "What am I actually looking at?" — one removable pill per applied filter.
 *
 * Once filters live in three places (a select grid, a chip row, and a sheet) the
 * only way to keep the answer visible is to restate it in one line. Each pill
 * removes exactly its own filter; "Clear all" removes the lot.
 */

export type ActiveFilterPill = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function ActiveFilterSummary({
  pills,
  onClearAll,
  clearAllLabel,
  removeAriaLabel,
  className,
}: {
  pills: readonly ActiveFilterPill[];
  onClearAll: () => void;
  clearAllLabel: string;
  /** Given the pill label, returns the button's accessible name. */
  removeAriaLabel: (label: string) => string;
  className?: string;
}) {
  if (pills.length === 0) return null;

  return (
    <div
      data-active-filter-summary
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {pills.map((pill) => (
        <span
          key={pill.key}
          className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/30 py-1 pl-3 pr-1 text-[11.5px] font-bold text-foreground"
        >
          {pill.label}
          <button
            type="button"
            onClick={pill.onRemove}
            aria-label={removeAriaLabel(pill.label)}
            className="focus-ring grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="focus-ring inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-accent/40 px-3 text-[11.5px] font-bold text-accent hover:border-accent hover:bg-accent-soft/20"
      >
        <X className="size-3" aria-hidden="true" />
        {clearAllLabel}
      </button>
    </div>
  );
}
