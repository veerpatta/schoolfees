"use client";

/**
 * Trust badge — a small chip you stand next to any money number to advertise:
 *   - the data freshness ("as of 10:42 AM")
 *   - the source of the calculation
 *   - a way to drill into the audit trail
 *
 * Office staff trust software that shows its work. This primitive lets us
 * apply that pattern consistently across the dashboard, defaulter rows,
 * student profile, payment drawer, and transactions footer.
 */

import { type ReactNode, useEffect, useState } from "react";
import { ChevronRight, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type TrustBadgeProps = {
  /** Short label, e.g. "Workbook v1", "Live", "Daily snapshot". */
  source?: string;
  /** ISO timestamp the number was computed at. */
  computedAt?: string | Date | null;
  /** Optional onClick — opens a richer "show the calc" surface. */
  onExplain?: () => void;
  /** Optional href to the audit trail. Rendered as a "View audit" chevron. */
  auditHref?: string;
  className?: string;
  children?: ReactNode;
};

function formatRelative(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  if (Number.isNaN(date.getTime())) return "just now";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function TrustBadge({
  source = "Live",
  computedAt,
  onExplain,
  auditHref,
  className,
  children,
}: TrustBadgeProps) {
  const [mounted, setMounted] = useState(false);

  // Hydration-safe — "5m ago" depends on the wall clock and would mismatch
  // between server and client. Render an empty time slot until mount.
  useEffect(() => setMounted(true), []);

  const interactive = Boolean(onExplain || auditHref);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        interactive && "cursor-pointer hover:bg-surface hover:text-foreground",
        className,
      )}
      onClick={onExplain}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onExplain?.();
        }
      }}
      title={
        computedAt
          ? `Source: ${source}. Computed ${mounted ? formatRelative(computedAt) : ""}.`
          : `Source: ${source}.`
      }
    >
      <Info className="size-3" aria-hidden="true" />
      <span>{children ?? source}</span>
      {computedAt && mounted ? (
        <span className="tabular text-[10px] opacity-80">· {formatRelative(computedAt)}</span>
      ) : null}
      {auditHref ? (
        <a
          href={auditHref}
          onClick={(event) => event.stopPropagation()}
          className="ml-0.5 inline-flex items-center gap-0.5 rounded text-muted-foreground hover:text-foreground"
          title="Open audit trail"
        >
          <ChevronRight className="size-3" />
        </a>
      ) : null}
    </span>
  );
}
