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
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-5 text-slate-600">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0 self-start">{actions}</div> : null}
    </header>
  );
}
