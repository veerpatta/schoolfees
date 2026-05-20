import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional trailing content, e.g. a small badge. */
  trailing?: ReactNode;
  /** Tone to subtly tint the card border-left. */
  accent?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  className?: string;
};

const accentBorder: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  neutral: "",
  accent: "before:bg-accent",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-destructive",
  info: "before:bg-info",
};

export function KpiCard({
  label,
  value,
  hint,
  trailing,
  accent = "neutral",
  className,
}: KpiCardProps) {
  const showAccentRule = accent !== "neutral";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-3.5 md:p-5",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong",
        showAccentRule &&
          "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
        accentBorder[accent],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight tabular text-foreground md:mt-3 md:text-[28px] md:leading-[34px]">
        {value}
      </div>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
