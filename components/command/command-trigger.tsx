"use client";

/**
 * Small "⌘K" pill rendered in the topbar to advertise the palette.
 *
 * Clicking it dispatches a synthetic keydown — we keep palette ownership
 * entirely inside CommandPalette and use the existing global shortcut
 * pipeline as the single trigger path. No new state to keep in sync.
 */

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

type CommandTriggerProps = {
  className?: string;
};

function fireOpen() {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    code: "KeyK",
    ctrlKey: true,
    metaKey: true,
    bubbles: true,
  });
  document.dispatchEvent(event);
}

export function CommandTrigger({ className }: CommandTriggerProps) {
  return (
    <button
      type="button"
      onClick={fireOpen}
      title="Open command palette"
      aria-label="Open command palette (Ctrl/Cmd + K)"
      className={cn(
        "hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-ring md:inline-flex",
        className,
      )}
    >
      <Search className="size-3.5" aria-hidden="true" />
      <span>Find student, receipt, action…</span>
      <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
        ⌘K
      </kbd>
    </button>
  );
}
