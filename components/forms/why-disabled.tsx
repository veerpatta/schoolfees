"use client";

/**
 * "Why is this disabled?" affordance for gated primary actions.
 *
 * Drop this next to a disabled button and pass the list of reasons. Hover
 * or focus surfaces a small popover that lists exactly why the action
 * won't fire — saving staff a guessing game.
 */

import { type ReactNode, useState } from "react";
import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type WhyDisabledProps = {
  reasons: readonly string[];
  /** Optional title above the reasons. */
  title?: string;
  className?: string;
  /** Trigger element override (defaults to a help circle). */
  children?: ReactNode;
};

export function WhyDisabled({
  reasons,
  title = "Why can't I do this?",
  className,
  children,
}: WhyDisabledProps) {
  const [open, setOpen] = useState(false);

  if (reasons.length === 0) return null;

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="Why is this disabled?"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-ring"
      >
        {children ?? (
          <>
            <HelpCircle className="size-3.5" aria-hidden="true" />
            Why?
          </>
        )}
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-md border border-border bg-card p-3 text-xs leading-5 text-foreground shadow-lg anim-fade-in"
        >
          <p className="mb-1.5 font-semibold">{title}</p>
          <ul className="space-y-1">
            {reasons.map((reason, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span className="mt-0.5 size-1 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span className="text-muted-foreground">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
