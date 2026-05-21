import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        // Solid — strong emphasis (rare in this app)
        default:
          "bg-primary text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground",
        outline:
          "border border-border bg-transparent text-foreground",
        // Tonal — most common across the app
        neutral:
          "bg-surface-2 text-foreground",
        accent:
          "bg-accent-soft text-accent-soft-foreground",
        success:
          "bg-success-soft text-success-soft-foreground",
        warning:
          "bg-warning-soft text-warning-soft-foreground",
        danger:
          "bg-destructive-soft text-destructive-soft-foreground",
        destructive:
          "bg-destructive text-destructive-foreground",
        info:
          "bg-info-soft text-info-soft-foreground",
        soft:
          "bg-accent-soft text-accent-soft-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type DotTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const dotColors: Record<DotTone, string> = {
  neutral: "bg-muted-foreground",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Add a colored dot before the label. Pass a tone or `true` to infer from variant. */
  dot?: boolean | DotTone;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  const dotTone: DotTone | null =
    dot === true
      ? variantToDotTone(variant)
      : dot
        ? (dot as DotTone)
        : null;

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dotTone ? (
        <span
          className={cn("size-1.5 rounded-full", dotColors[dotTone])}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

function variantToDotTone(variant: BadgeProps["variant"]): DotTone {
  switch (variant) {
    case "accent":
      return "accent";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
    case "destructive":
      return "danger";
    case "info":
      return "info";
    case "soft":
      return "accent";
    default:
      return "neutral";
  }
}

export { Badge, badgeVariants };
