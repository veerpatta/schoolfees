import Link from "next/link";
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
  /** Layout style. `strip` is a compact horizontal row for dense mobile lists. */
  variant?: "card" | "strip";
  /** Optional drill-down href — wraps the card in a Link. */
  href?: string;
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
  variant = "card",
  href,
  className,
}: KpiCardProps) {
  const showAccentRule = accent !== "neutral";
  const isInteractive = Boolean(href);
  const Wrapper: React.ElementType = isInteractive ? Link : "div";
  const wrapperProps = isInteractive ? { href: href as string } : {};

  if (variant === "strip") {
    return (
      <Wrapper
        {...wrapperProps}
        className={cn(
          "relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border bg-card px-4 py-3",
          "transition-[border-color,box-shadow] duration-150 hover:border-border-strong",
          isInteractive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showAccentRule &&
            "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
          accentBorder[accent],
          className,
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          {hint ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right text-base font-semibold tracking-tight tabular text-foreground">
            {value}
          </div>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "relative block overflow-hidden rounded-lg border border-border bg-card p-3.5 md:p-5",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-border-strong",
        isInteractive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
    </Wrapper>
  );
}
