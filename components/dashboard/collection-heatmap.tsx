"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

export type CollectionHeatmapPoint = {
  date: string;
  amount: number;
};

type CollectionHeatmapProps = {
  collections: CollectionHeatmapPoint[];
};

type YearMonth = { year: number; month: number };

function getSchoolMonthParts(): YearMonth {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  return { year, month };
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function getAmountClass(amount: number) {
  if (amount <= 0) return "bg-surface-2 text-muted-foreground";
  if (amount < 10000) return "bg-success-soft/40 text-foreground";
  if (amount < 50000) return "bg-success-soft/70 text-foreground";
  return "bg-success-soft font-semibold text-success-soft-foreground";
}

function formatMonthLabel({ year, month }: YearMonth): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

export function CollectionHeatmap({ collections }: CollectionHeatmapProps) {
  const today = getSchoolMonthParts();
  const [view, setView] = useState<YearMonth>(today);

  const minMonth = useMemo<YearMonth>(() => {
    if (!collections || collections.length === 0) {
      return today;
    }
    const earliest = collections
      .map((point) => point.date)
      .filter(Boolean)
      .sort()[0];
    if (!earliest) return today;
    const [y, m] = earliest.split("-").map(Number);
    return { year: y, month: m };
  }, [collections, today]);

  const { year, month } = view;
  const firstDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDate.getDay();

  const amountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of collections) {
      const [y, m] = point.date.split("-").map(Number);
      if (y === year && m === month) {
        map.set(point.date, point.amount);
      }
    }
    return map;
  }, [collections, year, month]);

  const cells = useMemo(
    () => [
      ...Array.from({ length: startOffset }, (_, index) => ({
        key: `blank-${index}`,
        day: null as number | null,
        date: "",
        amount: 0,
      })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return { key: date, day, date, amount: amountByDate.get(date) ?? 0 };
      }),
    ],
    [amountByDate, daysInMonth, month, startOffset, year],
  );

  const atMin = compareYearMonth(view, minMonth) <= 0;
  const atMax = compareYearMonth(view, today) >= 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setView((current) => shiftMonth(current, -1))}
          disabled={atMin}
          aria-label="Previous month"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
            atMin
              ? "cursor-not-allowed opacity-40"
              : "hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground tabular-nums">
          {formatMonthLabel(view)}
        </span>
        <button
          type="button"
          onClick={() => setView((current) => shiftMonth(current, 1))}
          disabled={atMax}
          aria-label="Next month"
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
            atMax
              ? "cursor-not-allowed opacity-40"
              : "hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="px-1 text-center text-[10px] font-semibold uppercase text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={cn(
              "flex aspect-square items-start justify-start rounded-md px-1.5 py-1 text-xs tabular-nums",
              cell.day === null ? "bg-transparent" : getAmountClass(cell.amount),
            )}
            title={cell.day === null ? undefined : `${cell.date}: ${formatInr(cell.amount)}`}
          >
            {cell.day}
          </div>
        ))}
      </div>
    </div>
  );
}
