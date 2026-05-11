import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/helpers/currency";

type MoneyProps = {
  value: number | null | undefined;
  /** Visual emphasis. */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "display";
  /** Tone. `auto` colors negatives as destructive, positives as foreground. */
  tone?: "auto" | "neutral" | "muted" | "success" | "danger" | "warning";
  /** Show sign even for positives. */
  signed?: boolean;
  className?: string;
  /** Replacement when value is null/undefined. */
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
  className,
  fallback = "—",
}: MoneyProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={cn("tabular text-muted-foreground", sizeClasses[size], className)}>
        {fallback}
      </span>
    );
  }

  const resolved = resolveTone(tone, value);
  const formatted = formatInr(Math.abs(value));
  const sign = value < 0 ? "−" : signed ? "+" : "";

  return (
    <span
      className={cn(
        "tabular",
        sizeClasses[size],
        toneClasses[resolved as keyof typeof toneClasses] ?? "text-foreground",
        className,
      )}
    >
      {sign}
      {formatted}
    </span>
  );
}
