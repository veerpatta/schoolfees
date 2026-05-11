import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (badges, buttons). Single row. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Render as a bordered card (default) or as a borderless block. */
  variant?: "card" | "plain";
  /** Padding density. */
  padding?: "default" | "tight" | "none";
};

const paddingClasses = {
  default: "p-5",
  tight: "p-4",
  none: "p-0",
} as const;

export function Section({
  id,
  title,
  description,
  actions,
  children,
  className,
  variant = "card",
  padding = "default",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        variant === "card" && "rounded-lg border border-border bg-card",
        paddingClasses[padding],
        className,
      )}
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}
