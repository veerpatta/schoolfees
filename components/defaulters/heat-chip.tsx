"use client";

import { Flame } from "lucide-react";

import { heatLevel, type HeatLevel } from "@/lib/defaulters/cadence";
import { cn } from "@/lib/utils";

type Props = {
  score: number;
  className?: string;
  /** Hide the score number, show only flame icons. */
  iconOnly?: boolean;
};

const STYLES: Record<HeatLevel, { dot: string; chip: string; flames: 1 | 2 | 3 | 4 }> = {
  cold: {
    dot: "bg-muted",
    chip: "border-border bg-surface-2 text-muted-foreground",
    flames: 1,
  },
  warm: {
    dot: "bg-warning",
    chip: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
    flames: 2,
  },
  hot: {
    dot: "bg-destructive/80",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    flames: 3,
  },
  blazing: {
    dot: "bg-destructive",
    chip: "border-destructive/60 bg-destructive/15 text-destructive",
    flames: 4,
  },
};

export function HeatChip({ score, className, iconOnly = false }: Props) {
  const level = heatLevel(score);
  const style = STYLES[level];
  const flames = Array.from({ length: style.flames });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        style.chip,
        className,
      )}
      title={`Heat ${score} / 100`}
      aria-label={`Heat score ${score} of 100`}
    >
      <span className="flex">
        {flames.map((_, idx) => (
          <Flame
            key={idx}
            className={cn("size-3", idx > 0 ? "-ml-1" : "")}
            aria-hidden="true"
          />
        ))}
      </span>
      {iconOnly ? null : <span>{score}</span>}
    </span>
  );
}
