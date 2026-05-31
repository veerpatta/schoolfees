/**
 * Sticky summary row — pin a totals bar to the bottom of a list page so
 * "totals you care about" stay visible as the table scrolls.
 *
 * Caller composes children freely. We just provide consistent styling,
 * sticky behavior, and density-aware padding.
 *
 * No "use client": this is a purely presentational component (props -> JSX,
 * no hooks/state/handlers). Dropping the directive lets the defaulters server
 * page render it server-side (out of that route's client bundle) while it still
 * composes fine inside its client-component callers.
 */

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type SummaryRowProps = {
  children: ReactNode;
  /** Optional secondary message (small, muted). */
  hint?: ReactNode;
  /** Off-sticky variant for cases where the table scrolls inside its own panel. */
  sticky?: boolean;
  className?: string;
};

export function SummaryRow({ children, hint, sticky = true, className }: SummaryRowProps) {
  return (
    <div
      className={cn(
        "z-10 flex flex-col items-stretch gap-1 border-t border-border bg-surface px-3 py-2 text-sm shadow-sm sm:flex-row sm:items-center sm:gap-4 density-cell",
        sticky && "sticky bottom-0",
        className,
      )}
      role="status"
    >
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-foreground">
        {children}
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground sm:ml-auto">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Convenience cell pair — label above, value below. Use inside <SummaryRow>.
 */
export function SummaryCell({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground tabular">{value}</span>
    </div>
  );
}
