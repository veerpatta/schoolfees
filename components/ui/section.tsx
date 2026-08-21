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

/**
 * Phones get the design's compact card geometry; tablet and up keep the desk
 * padding. Every phone/desktop gate in this file is `md` so a section never
 * disagrees with the shell chrome, which also switches at `md`. (They used to
 * split at `sm`, which gave 640–767px devices phone chrome stacked on a desktop
 * header.)
 */
const paddingClasses = {
  default: "p-3.5 md:p-5",
  tight: "p-3 md:p-4",
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
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          {/* Extrabold on phones — the design's dominant weight (800 appears
              175× in the spec). Desktop keeps semibold. */}
          <h2 className="text-[13.5px] font-extrabold tracking-tight text-foreground md:text-lg md:font-semibold">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-muted-foreground md:block">
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
      <div className="mt-3 md:mt-5">{children}</div>
    </section>
  );
}
