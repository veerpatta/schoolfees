"use client";

/**
 * Tiny dismissable banner the first time a workspace user lands somewhere
 * we want to teach. Stored in localStorage under `vpps.hints.<key>` so a
 * dismissal sticks per browser.
 */

import { type ReactNode, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

type FirstRunHintProps = {
  /** Unique storage key, e.g. "cmdk" → vpps.hints.cmdk. */
  hintKey: string;
  children: ReactNode;
  className?: string;
};

const KEY_PREFIX = "vpps.hints.";

function isDismissed(hintKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY_PREFIX + hintKey) === "1";
  } catch {
    return true;
  }
}

function dismiss(hintKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + hintKey, "1");
  } catch {
    // best-effort
  }
}

export function FirstRunHint({ hintKey, children, className }: FirstRunHintProps) {
  // SSR-safe default: assume dismissed; reveal after hydration if it isn't.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDismissed(hintKey)) setShow(true);
  }, [hintKey]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground anim-fade-in",
        className,
      )}
      role="status"
    >
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-6">{children}</p>
      <button
        type="button"
        onClick={() => {
          dismiss(hintKey);
          setShow(false);
        }}
        aria-label="Dismiss tip"
        className="grid size-7 shrink-0 place-items-center rounded-md text-accent-soft-foreground hover:bg-accent/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
