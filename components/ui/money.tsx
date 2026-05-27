import { cn } from "@/lib/utils";
import { formatInr, type FormatInrOptions } from "@/lib/helpers/currency";

type MoneyProps = {
  value: number | null | undefined;
  /** Visual emphasis. */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "display";
  /** Tone. `auto` colors negatives as destructive, positives as foreground. */
  tone?: "auto" | "neutral" | "muted" | "success" | "danger" | "warning";
  /** Show sign even for positives. */
  signed?: boolean;
  /** Render two decimals for paise. Default false (whole rupees). */
  showPaise?: boolean;
  /** Compact KPI form: ₹1.2L / ₹3.4Cr. Use sparingly. */
  compact?: boolean;
  className?: string;
  /** Replacement when value is null/undefined/NaN. */
  fallback?: string;
};

const sizeClasses: Record<NonNullable<MoneyProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-sm font-medium",
  lg: "text-base font-semibold",
  xl: "text-xl font-semibold tracking-tight",
  display: "text-3xl font-semibold tracking-tight md:text-4xl",
};

function resolveTone(tone: NonNullable<MoneyProps["tone"]>, value: number) {
  if (tone !== "auto") return tone;
  if (value < 0) return "danger";
  return "neutral";
}

const toneClasses = {
  neutral: "text-foreground",
  muted: "text-muted-foreground",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
} as const;

export function Money({
  value,
  size = "md",
  tone = "neutral",
  signed = false,
  showPaise = false,
  compact = false,
  className,
  fallback = "—",
}: MoneyProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span
        className={cn("tabular text-muted-foreground", sizeClasses[size], className)}
        data-money="missing"
      >
        {fallback}
      </span>
    );
  }

  const resolved = resolveTone(tone, value);
  const options: FormatInrOptions = { signed, showPaise, compact };
  const formatted = formatInr(value, options);

  return (
    <span
      className={cn(
        "tabular",
        sizeClasses[size],
        toneClasses[resolved as keyof typeof toneClasses] ?? "text-foreground",
        className,
      )}
      data-money={value === 0 ? "zero" : value < 0 ? "negative" : "positive"}
    >
      {formatted}
    </span>
  );
}

/**
 * Small bordered pill — for inline mode/status chips next to a money figure.
 * Example: <MoneyChip label="Late fee" value={1000} tone="danger" />.
 */
export function MoneyChip({
  label,
  value,
  tone = "neutral",
  signed = false,
  className,
}: {
  label: string;
  value: number | null | undefined;
  tone?: NonNullable<MoneyProps["tone"]>;
  signed?: boolean;
  className?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : tone === "success"
        ? "border-success/30 bg-success-soft text-success-soft-foreground"
        : tone === "warning"
          ? "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground"
          : tone === "muted"
            ? "border-border bg-surface-2 text-muted-foreground"
            : "border-border bg-card text-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        toneCls,
        className,
      )}
      data-money-chip={label}
    >
      <span className="text-muted-foreground/90">{label}</span>
      <Money value={value} size="xs" tone={tone} signed={signed} className="font-semibold" />
    </span>
  );
}
