import { type ComponentType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  /** Single primary CTA. Pass JSX (e.g. <Button asChild><Link …></Link></Button>). */
  action?: ReactNode;
  /** Secondary action, optional. Keep <=1 to avoid choice paralysis. */
  secondary?: ReactNode;
  className?: string;
  /** `card` wraps the empty state in a bordered card. `inline` is borderless. */
  variant?: "card" | "inline";
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  className,
  variant = "card",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        variant === "card" && "rounded-lg border border-dashed border-border bg-card",
        className,
      )}
    >
      {Icon ? (
        <div className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="max-w-md space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action || secondary ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
