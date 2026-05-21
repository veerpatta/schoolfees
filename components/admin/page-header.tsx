import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title (caps, tracked). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "hidden flex-col gap-3 pb-1 sm:flex sm:flex-row sm:items-end sm:justify-between sm:gap-6 print:flex",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 hidden text-sm leading-6 text-muted-foreground sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
