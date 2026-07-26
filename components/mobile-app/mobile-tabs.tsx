"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Underline tabs (template §STUDENT DETAIL, §MASTER DATA): equal-width, a
 * 2.5px accent rule under the active one, nothing else. No pill, no card —
 * on a 390px screen the rule is the only affordance that survives four tabs.
 */

export type MobileTab = {
  id: string;
  label: ReactNode;
};

export function MobileTabs({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className,
}: {
  tabs: MobileTab[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-1", className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "focus-ring flex-1 border-b-[2.5px] px-1 py-2.5 text-center text-[12.5px] font-extrabold",
              active
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
