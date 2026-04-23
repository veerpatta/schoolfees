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
        "glass-panel rounded-[28px] p-5 md:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
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
