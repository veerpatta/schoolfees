import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

/**
 * The dashboard's tile vocabulary.
 *
 * Every tile is one label, one number, one visual and at most one short
 * footnote. No `description` prop, deliberately: the old dashboard gave every
 * section a title AND a paragraph, which is what buried the charts. If a panel
 * needs a sentence to be understood, the panel is wrong.
 *
 * All of it is server-rendered SVG and CSS. There is no charting library in
 * this project and there cannot be one -- `/protected/dashboard` sits inside a
 * gzip ceiling in quality/route-bundle-baseline.json with about 2.7 KB of head
 * room, and recharts is ~100 KB. Hand-rolled also keeps print, dark mode and
 * the zero-console-error a11y gate working for free.
 *
 * Colours come from --chart-1..5 and the semantic quads. Never a raw Tailwind
 * hue: docs/design/design-system.md §6.
 */

/* ── Shell ─────────────────────────────────────────────────────────────── */

export function TileLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Tile({
  label,
  action,
  children,
  className,
  tone = "default",
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5",
        tone === "default" && "border-border",
        tone === "accent" && "border-accent/30 bg-accent-soft/30",
        tone === "danger" && "border-destructive/30 bg-destructive-soft/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <TileLabel>{label}</TileLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A number with its label. The workhorse. */
const TONE_TEXT = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  muted: "text-muted-foreground",
} as const;

export function StatTile({
  label,
  value,
  footnote,
  tone = "neutral",
  size = "lg",
  format = "money",
  className,
}: {
  label: string;
  value: number;
  footnote?: string;
  tone?: "neutral" | "success" | "danger" | "warning" | "muted";
  size?: "md" | "lg" | "xl";
  /**
   * Not every tile holds rupees. "19 classes tracked" rendered through <Money>
   * reads "Rs 19", which is not a smaller version of the truth -- it is a
   * different fact. Counts opt out.
   */
  format?: "money" | "count";
  className?: string;
}) {
  const sizeClass = cn(
    "mt-1.5 block font-display-money",
    size === "md" && "text-xl",
    size === "lg" && "text-2xl",
    size === "xl" && "text-3xl",
  );
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <TileLabel>{label}</TileLabel>
      {format === "count" ? (
        <span className={cn(sizeClass, "tabular", TONE_TEXT[tone])}>
          {value.toLocaleString("en-IN") /* @allow-raw-money-format — a count, not rupees. Indian digit grouping is still right for "1,20,000 receipts"; formatInr would print "Rs". */}
        </span>
      ) : (
        <Money value={value} tone={tone} className={sizeClass} />
      )}
      {footnote ? (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}

/* ── Bars ──────────────────────────────────────────────────────────────── */

export type BarSegment = {
  key: string;
  label: string;
  value: number;
  /** A CSS colour, normally `hsl(var(--chart-1))`. */
  color: string;
};

/**
 * One horizontal bar split into segments, with a legend underneath.
 *
 * Segments are laid out with flex-basis percentages rather than absolute
 * positioning so a zero-width segment collapses cleanly instead of stacking
 * invisible boxes on top of each other at the origin.
 */
export function StackedBar({
  segments,
  ariaLabel,
  height = "h-8",
  showLegend = true,
  className,
}: {
  segments: BarSegment[];
  ariaLabel: string;
  height?: string;
  showLegend?: boolean;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  return (
    <div className={className}>
      <div
        className={cn("flex w-full overflow-hidden rounded-md bg-surface-2", height)}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={100}
      >
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.key}
                  className="h-full"
                  style={{
                    flexBasis: `${(segment.value / total) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                  title={`${segment.label}: ${segment.value}`}
                />
              ))
          : null}
      </div>
      {showLegend ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-muted-foreground">{segment.label}</span>
              <Money value={segment.value} size="xs" className="font-medium" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A label, a proportional bar and a value — the ranked-list row. */
export function BarRow({
  label,
  value,
  max,
  meta,
  color = "hsl(var(--chart-1))",
  href,
}: {
  label: string;
  value: number;
  max: number;
  meta?: string;
  color?: string;
  href?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <Money value={value} size="sm" className="shrink-0 font-medium" />
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={`${label} ${pct}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {meta ? <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p> : null}
    </>
  );

  return href ? (
    <a href={href} className="block rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2">
      {body}
    </a>
  ) : (
    <div className="px-1 py-1.5">{body}</div>
  );
}

/* ── SVG ───────────────────────────────────────────────────────────────── */

/**
 * Monthly collection as bars, with an optional dashed run-rate projection for
 * months that have not happened yet. The projection is drawn at 40% opacity and
 * labelled, so nobody mistakes a forecast for money in the drawer.
 */
export function TrendBars({
  points,
  ariaLabel,
  projectionFrom,
}: {
  points: Array<{ key: string; label: string; value: number; projected?: boolean }>;
  ariaLabel: string;
  projectionFrom?: number;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing collected yet.</p>;
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  const width = 640;
  const height = 140;
  const gap = 8;
  const barWidth = (width - gap * (points.length - 1)) / points.length;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height + 26}`}
        className="h-auto w-full min-w-[440px]"
        role="img"
        aria-label={ariaLabel}
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={width}
            y1={height - height * fraction}
            y2={height - height * fraction}
            stroke="hsl(var(--border))"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
        ))}
        {points.map((point, index) => {
          const barHeight = Math.max((point.value / max) * height, point.value > 0 ? 2 : 0);
          const x = index * (barWidth + gap);
          const isProjected =
            point.projected ?? (projectionFrom !== undefined && index >= projectionFrom);
          return (
            <g key={point.key}>
              <title>{`${point.label}: ${point.value}`}</title>
              <rect
                x={x}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={isProjected ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))"}
                opacity={isProjected ? 0.4 : 1}
              />
              <text
                x={x + barWidth / 2}
                y={height + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 11 }}
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Donut. Centre carries the headline so the ring never needs a caption. */
export function MiniDonut({
  segments,
  centreValue,
  centreLabel,
  ariaLabel,
  size = 112,
  format = "money",
}: {
  segments: BarSegment[];
  centreValue: string;
  centreLabel: string;
  ariaLabel: string;
  size?: number;
  /** See StatTile: a roster split is people, not rupees. */
  format?: "money" | "count";
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          width={size}
          height={size}
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--surface-3))"
            strokeWidth={10}
          />
          {total > 0
            ? segments.map((segment) => {
                const fraction = Math.max(segment.value, 0) / total;
                const dash = fraction * circumference;
                const offset = -consumed * circumference;
                consumed += fraction;
                if (dash <= 0) return null;
                return (
                  <circle
                    key={segment.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={10}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={offset}
                  />
                );
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display-money text-base leading-none">{centreValue}</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {centreLabel}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
            {format === "count" ? (
              <span className="shrink-0 tabular text-xs font-medium">
                {segment.value.toLocaleString("en-IN") /* @allow-raw-money-format — a count, not rupees; same reason as StatTile above. */}
              </span>
            ) : (
              <Money value={segment.value} size="xs" className="shrink-0 font-medium" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The five chart tokens, in the order tiles should reach for them. */
export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

export const TONE_COLORS = {
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
  accent: "hsl(var(--accent))",
} as const;
