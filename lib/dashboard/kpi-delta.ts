/**
 * Period-over-period comparison for the Today's-collection KPI.
 *
 * We compare today's value against the average of recent days that share
 * the same weekday. School payments cluster by day (cash-counter days vs.
 * online-heavy days), so a "today vs Tue avg" delta is more honest than a
 * raw rolling 7-day average.
 */

import type { DashboardTrendPoint } from "@/lib/dashboard/summary";

export type KpiDeltaPoint = {
  date: string;
  amount: number;
};

export type KpiDelta = {
  comparator: number;
  deltaPct: number | null;
  label: string;
  tone: "success" | "danger" | "neutral";
};

function getWeekday(iso: string): number {
  return new Date(`${iso}T00:00:00`).getDay();
}

const WEEKDAY_LABEL: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export function computeTodayCollectionDelta(
  trend: KpiDeltaPoint[] | DashboardTrendPoint[],
  todayIso: string,
  todayAmount: number,
): KpiDelta | null {
  if (!Array.isArray(trend) || trend.length < 2) return null;
  const todayWeekday = getWeekday(todayIso);
  const sameWeekday = trend
    .filter((point) => point.date && point.date !== todayIso)
    .filter((point) => getWeekday(point.date) === todayWeekday);

  if (sameWeekday.length === 0) return null;
  const comparator = Math.round(
    sameWeekday.reduce((sum, point) => sum + point.amount, 0) / sameWeekday.length,
  );

  if (comparator <= 0 && todayAmount <= 0) {
    return null;
  }

  const deltaPct = comparator > 0 ? Math.round(((todayAmount - comparator) / comparator) * 100) : null;
  const dayLabel = WEEKDAY_LABEL[todayWeekday] ?? "avg";
  const labelBase = `${dayLabel} avg`;
  const arrow = deltaPct === null ? "" : deltaPct >= 0 ? "▲" : "▼";
  const formattedPct = deltaPct === null ? "first day" : `${Math.abs(deltaPct)}%`;
  const tone: KpiDelta["tone"] =
    deltaPct === null ? "neutral" : deltaPct >= 0 ? "success" : "danger";

  return {
    comparator,
    deltaPct,
    label: `${arrow}${arrow ? " " : ""}${formattedPct} vs ${labelBase}`.trim(),
    tone,
  };
}
