"use client";

/**
 * Keyboard shortcuts sheet — opens on "?" or via the palette action.
 *
 * Listens for two events:
 *   - native `keydown` for "?" while not typing
 *   - custom `vpps:open-shortcuts` so the palette can request it
 */

import { useEffect, useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import { groupShortcuts } from "@/lib/command/shortcuts";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function KeyboardShortcutsSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "?" && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    const onCustom = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("vpps:open-shortcuts", onCustom);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("vpps:open-shortcuts", onCustom);
    };
  }, []);

  const groups = groupShortcuts();

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      side="right"
      title="Keyboard shortcuts"
      description="Move faster — these work anywhere in the workspace."
    >
      <div className="space-y-5">
        {groups.map((bucket) => (
          <section key={bucket.group}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {bucket.group}
            </h4>
            <dl className="space-y-1.5">
              {bucket.items.map((item) => (
                <div key={item.combo} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <dt className="text-sm text-foreground">{item.description}</dt>
                  <dd>
                    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                      {item.combo}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
