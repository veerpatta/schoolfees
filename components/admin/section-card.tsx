import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function SectionCard({
  id,
  title,
  description,
  children,
  actions,
  className,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
