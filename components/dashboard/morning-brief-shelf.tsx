import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Three-column shelf wrapper for the morning-brief action cards.
 *
 * Renders 1 / 2 / 3 across responsively. Pages compose this with their own
 * <ActionCard>s — the shelf only handles layout so the action cards stay
 * fully data-driven.
 */
export function MorningBriefShelf({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
