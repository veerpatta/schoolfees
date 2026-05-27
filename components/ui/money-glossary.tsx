"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import {
  MONEY_GLOSSARY,
  MONEY_GLOSSARY_ORDER,
  type MoneyTermKey,
} from "@/lib/money/glossary";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Scroll this term into view when the modal opens. */
  anchor?: MoneyTermKey;
};

/**
 * The single, app-wide money glossary. One modal, every term, anchored.
 *
 * Triggered from any `<MoneyWithDefinition>` or from a top-level page header
 * "ⓘ Money labels" link. Once a parent or staff reads a definition here, the
 * same definition applies everywhere else in the app.
 */
export function MoneyGlossarySheet({ open, onClose, anchor }: Props) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (!anchor) return;
    // Defer until the sheet has mounted its content.
    const id = window.setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-glossary-term="${anchor}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(id);
  }, [open, anchor]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MONEY_GLOSSARY_ORDER;
    return MONEY_GLOSSARY_ORDER.filter((key) => {
      const term = MONEY_GLOSSARY[key];
      return (
        term.label.toLowerCase().includes(q) ||
        term.summary.toLowerCase().includes(q) ||
        term.detail.toLowerCase().includes(q)
      );
    });
  }, [query]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Money labels"
      description="Every number on every screen is defined here. Same word, same meaning."
      side="bottom"
      size="full"
    >
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search labels (e.g. discount, late fee, credit)…"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <div ref={containerRef} className="space-y-3 overflow-y-auto pb-6">
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-4 text-center text-sm text-muted-foreground">
              No labels match.
            </p>
          ) : (
            filtered.map((key) => {
              const term = MONEY_GLOSSARY[key];
              const isAnchored = key === anchor;
              return (
                <article
                  key={key}
                  data-glossary-term={key}
                  tabIndex={-1}
                  className={cn(
                    "rounded-lg border bg-card p-3 outline-none transition-colors",
                    isAnchored ? "border-accent ring-1 ring-accent" : "border-border",
                  )}
                >
                  <header className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{term.label}</h3>
                    {term.source ? (
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {term.source}
                      </code>
                    ) : null}
                  </header>
                  <p className="mt-1 text-sm text-foreground">{term.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{term.detail}</p>
                </article>
              );
            })
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Tiny header link — drop into a page-level toolbar.
 */
export function MoneyGlossaryLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
          className,
        )}
      >
        <span aria-hidden="true">ⓘ</span>
        <span>Money labels</span>
      </button>
      <MoneyGlossarySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
