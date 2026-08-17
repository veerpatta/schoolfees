"use client";

/**
 * The phone's way into the command palette.
 *
 * CommandHost is mounted for every role in the protected layout, but both of
 * its triggers were desktop-only in practice: the topbar pill is
 * `hidden md:inline-flex` inside a topbar that is itself `hidden md:flex`, and
 * the other path is Ctrl/Cmd+K — which a phone does not have. Cross-module
 * search (students, receipts, actions, navigation) therefore existed on every
 * phone and was reachable from none.
 *
 * Same single trigger path as the desktop pill: dispatch the synthetic
 * shortcut keydown and let CommandPalette own everything else. No second
 * palette, no new state to keep in sync.
 */

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

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

export function MobileCommandTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={fireOpen}
      aria-label="Search students, receipts and actions"
      className={cn(
        // The Home header's control vocabulary: a size-9 circle, like the
        // avatar it sits beside. md:hidden — the topbar pill takes over there.
        "focus-ring grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground md:hidden",
        className,
      )}
    >
      <Search className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
