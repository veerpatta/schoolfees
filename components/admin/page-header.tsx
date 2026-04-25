import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
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
        "glass-panel flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0 self-start">{actions}</div> : null}
    </header>
  );
}
