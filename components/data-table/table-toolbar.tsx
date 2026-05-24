"use client";

/**
 * Generic toolbar for list pages — search input + filter chips + density toggle +
 * an actions slot. Owns nothing; the page wires everything.
 *
 * Designed to slot above any existing table on Students, Transactions,
 * Defaulters, Exports — without forcing a TanStack rewrite. Density-aware
 * via the global density context (Phase 0).
 */

import { type ReactNode, useId } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { DensityToggle } from "@/components/ui/density-toggle";

type TableToolbarProps = {
  /** Search input value (controlled). */
  search: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder?: string;
  /** Filter chip row — caller renders <Badge>s or button-like chips. */
  filters?: ReactNode;
  /** Right-aligned action slot (e.g. "Export", "Add student"). */
  actions?: ReactNode;
  /** Hide density toggle on pages where density doesn't help (rare). */
  showDensity?: boolean;
  className?: string;
};

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  actions,
  showDensity = true,
  className,
}: TableToolbarProps) {
  const inputId = useId();
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-1 flex flex-col gap-2 border-b border-border bg-background/80 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        Search
      </label>
      <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2.5 density-input focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {filters ? (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {showDensity ? <DensityToggle /> : null}
        {actions}
      </div>
    </div>
  );
}
