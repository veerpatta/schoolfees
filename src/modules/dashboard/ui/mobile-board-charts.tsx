import type { ReactNode } from "react";

import { cn } from "@/platform/utils";

/**
 * Hand-rolled SVG for the phone analytics boards.
 *
 * No charting library, by rule: `/protected/dashboard` sits under a gzip
 * ceiling in `quality/route-bundle-baseline.json` that ratchets down and never
 * up. Everything here is a server component with zero client JS, and every
 * colour is a token — a raw hue would fail the design-system audit and the
 * board tests, which grep the rendered markup for `#rrggbb`.
 *
 * Each chart carries `role="img"` plus an `aria-label` that states the figure
 * in words, because a screen reader gets nothing from the path data.
 */

/* ── daily line ─────────────────────────────────────────────────────────── */

const LINE_WIDTH = 340;
const LINE_HEIGHT = 120;
/** Head-room so the peak's stroke and its end dot are not clipped. */
const LINE_TOP_PAD = 8;

export function MobileDailyLine({
  points,
  average,
  ariaLabel,
  startLabel,
  endLabel,
}: {
  points: readonly { date: string; amount: number }[];
  average: number;
  ariaLabel: string;
  startLabel: string;
  endLabel: string;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.amount), 1);
  const usable = LINE_HEIGHT - LINE_TOP_PAD;
  const x = (index: number) =>
    points.length > 1 ? (index / (points.length - 1)) * LINE_WIDTH : LINE_WIDTH / 2;
  const y = (amount: number) => LINE_HEIGHT - (amount / max) * usable;

  const coordinates = points.map((point, index) => `${x(index).toFixed(1)} ${y(point.amount).toFixed(1)}`);
  const path = `M${coordinates.join(" L")}`;
  const area = `${path} L${LINE_WIDTH} ${LINE_HEIGHT} L0 ${LINE_HEIGHT} Z`;
  const averageY = y(average);
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1].amount);

  return (
    <div>
      {/* No explicit width/height and no preserveAspectRatio override: the
          viewBox scales uniformly, so the end-of-series dot stays a circle and
          the stroke keeps its weight on every screen width. */}
      <svg
        viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
        className="mt-2.5 block h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={0}
          y1={averageY}
          x2={LINE_WIDTH}
          y2={averageY}
          className="stroke-border-strong"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <path d={area} className="fill-accent/10" />
        <path
          d={path}
          fill="none"
          className="stroke-accent"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r={4} className="fill-accent stroke-card" strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-[9.5px] font-bold text-subtle-foreground">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

/* ── weekday bars ───────────────────────────────────────────────────────── */

export function MobileWeekdayBars({
  bars,
  ariaLabel,
}: {
  bars: readonly { key: string; label: string; value: number; display: string }[];
  ariaLabel: string;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div role="img" aria-label={ariaLabel}>
      <div
        className="grid h-24 items-end gap-1.5"
        style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
      >
        {bars.map((bar) => {
          const share = bar.value / max;
          return (
            <div key={bar.key} className="flex h-full flex-col justify-end gap-1">
              <span className="text-center text-[9px] font-extrabold text-muted-foreground">
                {bar.display}
              </span>
              <div
                aria-hidden="true"
                className={cn(
                  "rounded-t-md",
                  // Three steps rather than a gradient: the point of the card is
                  // "which day pays", so the best days have to separate at a
                  // glance on a 390px screen.
                  share >= 0.9
                    ? "bg-accent"
                    : share >= 0.6
                      ? "bg-accent/55"
                      : "bg-accent/25",
                )}
                style={{ height: `${Math.max(4, share * 66)}px` }}
              />
            </div>
          );
        })}
      </div>
      <div
        className="mt-1.5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
      >
        {bars.map((bar) => (
          <span
            key={bar.key}
            className="text-center text-[9.5px] font-extrabold text-muted-foreground"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── ring ───────────────────────────────────────────────────────────────── */

/** Recovered-so-far ring. One arc, because it answers one question. */
export function MobileRing({
  percent,
  centreLabel,
  ariaLabel,
}: {
  percent: number;
  centreLabel: string;
  ariaLabel: string;
}) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const radius = 32;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={ariaLabel} className="shrink-0">
      <circle cx={42} cy={42} r={radius} strokeWidth={9} className="fill-none stroke-surface-3" />
      <circle
        cx={42}
        cy={42}
        r={radius}
        strokeWidth={9}
        strokeLinecap="round"
        className="fill-none stroke-success"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - safe / 100)}
        transform="rotate(-90 42 42)"
      />
      <text
        x={42}
        y={47}
        textAnchor="middle"
        className="fill-foreground font-sans tabular-nums"
        style={{ fontSize: "17px", fontWeight: 800 }}
      >
        {centreLabel}
      </text>
    </svg>
  );
}

/* ── matrix ─────────────────────────────────────────────────────────────── */

export type MatrixCell = {
  key: string;
  /** 0 = nothing outstanding, 1 = the worst cell on the grid. */
  intensity: number;
  label: string;
};

/**
 * Class × installment fees pending.
 *
 * Pending, not a collection rate — per class × installment the app stores what
 * is still owed, and there is no collected figure at that intersection to
 * divide by. Inventing one would be a rate nobody could reconcile against the
 * ledger.
 *
 * Four steps, not a continuous scale: at 32px a cell has room for a number and
 * a background, and the reader has to sort "fine" from "not fine" without
 * consulting the legend for every cell.
 */
function matrixCellClass(intensity: number): string {
  if (intensity <= 0) return "bg-success-soft text-success-soft-foreground";
  if (intensity < 0.35) return "bg-surface-2 text-muted-foreground";
  if (intensity < 0.7) return "bg-warning-soft text-warning-soft-foreground";
  return "bg-destructive-soft text-destructive-soft-foreground";
}

export function MobileMatrixGrid({
  columns,
  rows,
  legendLow,
  legendHigh,
}: {
  columns: readonly { key: string; label: string }[];
  rows: readonly { key: string; label: string; cells: readonly MatrixCell[] }[];
  legendLow: string;
  legendHigh: string;
}) {
  if (rows.length === 0 || columns.length === 0) return null;
  const template = `2.5rem repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div>
      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: template }}>
        <span />
        {columns.map((column) => (
          <span
            key={column.key}
            className="text-center text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground"
          >
            {column.label}
          </span>
        ))}
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <span className="truncate text-[11px] font-extrabold text-muted-foreground">
              {row.label}
            </span>
            {row.cells.map((cell) => (
              <span
                key={cell.key}
                className={cn(
                  "tabular grid h-8 place-items-center rounded-lg text-[10.5px] font-extrabold",
                  matrixCellClass(cell.intensity),
                )}
              >
                {cell.label}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5 text-[10px] font-semibold text-muted-foreground">
        <span>{legendLow}</span>
        <span
          aria-hidden="true"
          className="h-[7px] flex-1 rounded-full bg-gradient-to-r from-success-soft via-warning-soft to-destructive-soft"
        />
        <span>{legendHigh}</span>
      </div>
    </div>
  );
}

/* ── shared row shapes ──────────────────────────────────────────────────── */

/** Label + meta on the left, amount on the right, bar underneath. */
export function MobileMeterRow({
  label,
  meta,
  amount,
  percent,
  tone = "warning",
}: {
  label: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  percent: number;
  tone?: "accent" | "warning" | "danger" | "success";
}) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] font-bold text-foreground">
          {label}
          {meta ? <span className="font-medium text-muted-foreground"> · {meta}</span> : null}
        </span>
        <span
          className={cn(
            "tabular shrink-0 text-[12.5px] font-extrabold",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-warning",
            tone === "success" && "text-success",
            tone === "accent" && "text-foreground",
          )}
        >
          {amount}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "danger" && "bg-destructive",
            tone === "warning" && "bg-warning",
            tone === "success" && "bg-success",
            tone === "accent" && "bg-accent",
          )}
          style={{ width: `${safe}%` }}
        />
      </div>
    </li>
  );
}

/** Dot + label + trailing figures. The legend under a split bar. */
export function MobileLegendRow({
  tone,
  label,
  meta,
  value,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "accent" | "info";
  label: ReactNode;
  meta?: ReactNode;
  value: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-destructive",
          tone === "accent" && "bg-accent",
          tone === "info" && "bg-info",
          tone === "neutral" && "bg-border-strong",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-foreground">
        {label}
      </span>
      {meta ? (
        <span className="tabular shrink-0 text-[11px] font-semibold text-muted-foreground">
          {meta}
        </span>
      ) : null}
      <span className="tabular shrink-0 text-[12.5px] font-extrabold text-foreground">
        {value}
      </span>
    </li>
  );
}
