"use client";

/**
 * Selection toolbar that slides up from the bottom of the viewport when at
 * least one row is selected. Renders fixed positioning + a count + caller-
 * supplied action buttons. Pair with any selection state the page already
 * owns; we don't manage selection here.
 */

import { type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectionBarProps = {
  count: number;
  /** Subject noun, e.g. "students", "receipts", "defaulters". */
  noun: string;
  onClear: () => void;
  actions?: ReactNode;
  className?: string;
};

export function SelectionBar({ count, noun, onClear, actions, className }: SelectionBarProps) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="Selection actions"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-bottom-nav-offset,0px)+0.5rem)] z-40 flex justify-center px-2 sm:bottom-4 print:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-w-3xl items-center gap-3 rounded-full border border-border bg-card px-3 py-1.5 shadow-lg anim-slide-up">
        <button
          type="button"
          onClick={onClear}
          className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="size-3.5" />
        </button>
        <p className="text-sm font-medium text-foreground tabular">
          {count} {noun}
        </p>
        {actions ? <div className="ml-1 flex items-center gap-1.5">{actions}</div> : null}
      </div>
    </div>
  );
}
