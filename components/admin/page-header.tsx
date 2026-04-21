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
        "flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/85 p-6 shadow-sm shadow-slate-200/60 backdrop-blur sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 md:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
