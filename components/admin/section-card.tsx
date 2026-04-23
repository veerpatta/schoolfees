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
        "rounded-2xl border border-slate-200 bg-white p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
