"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Flame, Snowflake } from "lucide-react";

import type { CadenceCounts, Cadence } from "@/lib/defaulters/cadence";
import { cn } from "@/lib/utils";

type Props = {
  counts: CadenceCounts;
  /** The currently active cadence tab — "all" if no cadence param is set. */
  activeCadence: string;
  /** Base search params to preserve (classId, transportRouteId, etc.) when building hrefs. */
  baseParams: Record<string, string>;
};

const TABS: { value: Cadence | "all"; i18nKey: string; Icon: typeof Flame }[] = [
  { value: "now", i18nKey: "triageTabNow", Icon: Flame },
  { value: "soon", i18nKey: "triageTabSoon", Icon: Clock },
  { value: "later", i18nKey: "triageTabLater", Icon: Snowflake },
  { value: "done", i18nKey: "triageTabDone", Icon: CheckCircle2 },
  { value: "all", i18nKey: "triageTabAll", Icon: Flame },
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

const TONE: Record<Cadence | "all", { active: string; inactive: string; badge: string }> = {
  now: {
    active: "bg-destructive text-destructive-foreground shadow-sm",
    inactive: "text-destructive hover:bg-destructive/10",
    badge: "bg-destructive/20 text-destructive",
  },
  soon: {
    active: "bg-warning-soft text-warning-soft-foreground shadow-sm",
    inactive: "text-warning-soft-foreground hover:bg-warning-soft/60",
    badge: "bg-warning/30 text-warning-soft-foreground",
  },
  later: {
    active: "bg-info-soft text-info-soft-foreground shadow-sm",
    inactive: "text-info-soft-foreground hover:bg-info-soft/60",
    badge: "bg-info-soft text-info-soft-foreground",
  },
  done: {
    active: "bg-success text-success-foreground shadow-sm",
    inactive: "text-success-soft-foreground hover:bg-success-soft",
    badge: "bg-success-soft text-success-soft-foreground",
  },
  all: {
    active: "bg-card text-foreground shadow-sm",
    inactive: "text-muted-foreground hover:bg-card/60 hover:text-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

export function TriageTabs({ counts, activeCadence, baseParams }: Props) {
  const t = useTranslations("Defaulters");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div
      className="-mx-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1 px-4 no-scrollbar md:mx-0 md:px-1"
      role="tablist"
      aria-label={t("triageNavLabel")}
    >
      {TABS.map((tab) => {
        const count = tab.value === "all" ? total : (counts[tab.value as Cadence] ?? 0);
        const isActive =
          activeCadence === tab.value ||
          (tab.value === "now" && activeCadence === "all" && !baseParams.cadence) ||
          (tab.value === "all" && activeCadence === "all");
        const tone = TONE[tab.value as Cadence | "all"];
        const Icon = tab.Icon;

        return (
          <Link
            key={tab.value}
            href={buildTabHref(tab.value, baseParams)}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? tone.active : tone.inactive,
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {t(tab.i18nKey)}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                isActive ? "bg-card/30 text-current" : tone.badge,
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
