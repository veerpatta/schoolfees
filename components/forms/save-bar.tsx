"use client";

/**
 * SaveBar — sticky-bottom bar that slides up when a long form goes dirty.
 *
 * Pair with any form: pass `dirty`, `saving`, `unsavedCount`, and handlers.
 * Slides up via the existing `anim-slide-up` keyframe so it joins the rest
 * of the motion vocabulary; respects `prefers-reduced-motion` via the
 * same global rule.
 */

import { type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type SaveBarProps = {
  dirty: boolean;
  saving?: boolean;
  /** Optional explicit count surfaced to the user (e.g. "3 unsaved fields"). */
  unsavedCount?: number;
  onSave: () => void;
  onDiscard?: () => void;
  /** Optional helper text shown left of the buttons. */
  helper?: ReactNode;
  className?: string;
};

export function SaveBar({
  dirty,
  saving = false,
  unsavedCount,
  onSave,
  onDiscard,
  helper,
  className,
}: SaveBarProps) {
  if (!dirty && !saving) return null;
  return (
    <div
      role="region"
      aria-label="Save changes"
      className={cn(
        "sticky bottom-0 z-40 mt-4 flex flex-col gap-2 border-t border-border bg-card px-3 py-2 shadow-md anim-slide-up sm:flex-row sm:items-center sm:justify-between sm:gap-4 print:hidden",
        className,
      )}
      style={{ animationDuration: "180ms" }}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4 text-warning" aria-hidden="true" />
        <span>
          {unsavedCount !== undefined
            ? `${unsavedCount} unsaved ${unsavedCount === 1 ? "change" : "changes"}`
            : "Unsaved changes"}
        </span>
        {helper ? <span className="text-xs">{helper}</span> : null}
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        {onDiscard ? (
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Discard
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
