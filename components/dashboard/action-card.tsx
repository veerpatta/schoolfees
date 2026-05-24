import Link from "next/link";
import { type ComponentType } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "warning" | "info" | "success";

type ActionCardProps = {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  count?: number | string;
  helper?: string;
  href: string;
  cta?: string;
  tone?: Tone;
  className?: string;
};

const toneSurface: Record<Tone, string> = {
  neutral: "border-border bg-card",
  warning: "border-warning/30 bg-warning-soft",
  info: "border-info/30 bg-info-soft",
  success: "border-success/30 bg-success-soft",
};

const toneIcon: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  success: "bg-success text-success-foreground",
};

/**
 * One of three action cards on the morning-brief dashboard. Tells the user
 * what's worth doing right now — not what number is on the board.
 *
 * Always renders as a link so keyboard nav and middle-click "open in new
 * tab" work as expected.
 */
export function ActionCard({
  icon: Icon,
  label,
  count,
  helper,
  href,
  cta = "Open",
  tone = "neutral",
  className,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border px-4 py-4 shadow-xs transition-colors hover:border-border-strong focus-ring",
        toneSurface[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span
            className={cn(
              "grid size-9 place-items-center rounded-md",
              toneIcon[tone],
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        {count !== undefined ? (
          <span className="text-2xl font-semibold tabular tracking-tight text-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
        {helper ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
      <div className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-accent-soft-foreground group-hover:text-accent">
        {cta}
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
