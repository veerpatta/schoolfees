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
        "rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex sm:items-start sm:justify-between sm:gap-4 sm:px-5",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 font-heading text-xl font-semibold text-slate-950 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>
      {actions ? <div className="mt-3 shrink-0 self-start sm:mt-0">{actions}</div> : null}
    </header>
  );
}
