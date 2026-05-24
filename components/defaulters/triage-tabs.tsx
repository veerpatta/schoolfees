"use client";

import Link from "next/link";

import type { CadenceCounts, Cadence } from "@/lib/defaulters/cadence";
import { cn } from "@/lib/utils";

type Props = {
  counts: CadenceCounts;
  /** The currently active cadence tab — "all" if no cadence param is set. */
  activeCadence: string;
  /** Base search params to preserve (classId, transportRouteId, etc.) when building hrefs. */
  baseParams: Record<string, string>;
};

const TABS: { value: Cadence | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "call_today", label: "Call today" },
  { value: "this_week", label: "This week" },
  { value: "snoozed", label: "Snoozed" },
];

function buildTabHref(
  tab: string,
  baseParams: Record<string, string>,
): string {
  const params = new URLSearchParams(baseParams);
  if (tab === "all") {
    params.delete("cadence");
  } else {
    params.set("cadence", tab);
  }
  params.delete("page");
  const qs = params.toString();
  return `/protected/defaulters${qs ? `?${qs}` : ""}`;
}

export function TriageTabs({ counts, activeCadence, baseParams }: Props) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1 no-scrollbar"
      role="tablist"
      aria-label="Follow-up cadence"
    >
      {TABS.map((tab) => {
        const count =
          tab.value === "all" ? total : (counts[tab.value as Cadence] ?? 0);
        const isActive =
          activeCadence === tab.value ||
          (tab.value === "all" && activeCadence === "all");

        return (
          <Link
            key={tab.value}
            href={buildTabHref(tab.value, baseParams)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
