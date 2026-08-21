"use client";

import { cn } from "@/platform/utils";

/**
 * The filter chip, extracted so Students and Transactions cannot drift apart
 * again — they each had their own copy of this token string.
 *
 * The count is the point of the component. A chip that reads "Old balance 56"
 * turns the filter bar into something you can act on: you can see a segment is
 * worth opening, or that it is empty, without tapping it first.
 */

export type SegmentChipProps = {
  label: string;
  /** Omit or pass null while counts are still loading. */
  count?: number | null;
  active?: boolean;
  onClick?: () => void;
  /**
   * Dim a chip whose count is zero. Still clickable — a segment that is empty
   * today is information, and hiding it would make the bar shift under the
   * user's finger as data changes.
   */
  dimWhenEmpty?: boolean;
  className?: string;
  title?: string;
};

export function SegmentChip({
  label,
  count,
  active = false,
  onClick,
  dimWhenEmpty = true,
  className,
  title,
}: SegmentChipProps) {
  const isEmpty = dimWhenEmpty && count === 0 && !active;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4",
        "text-[12.5px] font-bold transition-colors",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-card text-foreground hover:border-border-strong",
        isEmpty && "opacity-45",
        className,
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "tabular-nums text-[11px] font-extrabold",
            active ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
