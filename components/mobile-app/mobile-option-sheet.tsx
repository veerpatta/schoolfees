"use client";

import type { ReactNode } from "react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The design's bottom option sheet (template §BOTTOM SHEET): grabber, title,
 * a stack of large tick rows, and an ink "Done" button pinned underneath.
 *
 * This is a *presentation* over `components/ui/sheet.tsx`, deliberately not a
 * second implementation — that component already owns the focus trap, the
 * Android back-button integration, the reference-counted scroll lock, the
 * swipe-to-dismiss threshold and the safe-area footer slot. Re-doing any of
 * those here is how they drift apart.
 */

export type MobileOption = {
  id: string;
  label: ReactNode;
  /** Muted second line. */
  sub?: ReactNode;
  selected?: boolean;
  onSelect: () => void;
};

export function MobileOptionSheet({
  open,
  onClose,
  title,
  options,
  doneLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  options: MobileOption[];
  doneLabel: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="focus-ring grid h-[50px] w-full place-items-center rounded-[15px] bg-nav text-sm font-extrabold text-nav-foreground"
        >
          {doneLabel}
        </button>
      }
    >
      <p className="pb-1 pt-2 text-[15.5px] font-extrabold text-foreground">{title}</p>
      <div
        role="radiogroup"
        aria-label={typeof title === "string" ? title : undefined}
        className="mt-3 flex flex-col gap-2"
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={Boolean(option.selected)}
            onClick={option.onSelect}
            className={cn(
              "focus-ring flex items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-3 text-left",
              option.selected
                ? "border-accent bg-accent-soft"
                : "border-border bg-card",
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "mobile-row-title block",
                  option.selected ? "text-accent-soft-foreground" : "text-foreground",
                )}
              >
                {option.label}
              </span>
              {option.sub ? (
                <span className="mobile-row-meta block text-muted-foreground">
                  {option.sub}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 text-[15px]",
                option.selected ? "text-accent" : "text-subtle-foreground",
              )}
            >
              {option.selected ? "✓" : "○"}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
