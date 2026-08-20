import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

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
  /**
   * Render as a `<details>` disclosure. Default false, and the default path
   * emits exactly the markup it always has — this is an early return, not a
   * rewrite, because 45 `SectionCard` call sites depend on the current shape.
   *
   * `actions` are ignored when collapsible: a button inside a `<summary>`
   * toggles the disclosure on every stray tap, and this is a server component,
   * so there is no `stopPropagation` available to stop it.
   */
  collapsible?: boolean;
  /** Only meaningful with `collapsible`. Default false: starts closed. */
  defaultOpen?: boolean;
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
  collapsible = false,
  defaultOpen = false,
}: SectionProps) {
  if (collapsible) {
    return (
      <details
        id={id}
        open={defaultOpen}
        className={cn(
          "group",
          variant === "card" && "rounded-lg border border-border bg-card",
          paddingClasses[padding],
          className,
        )}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-extrabold tracking-tight text-foreground md:text-lg md:font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-muted-foreground md:block">
                {description}
              </p>
            ) : null}
          </div>
          <ChevronDown
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-3 md:mt-5">{children}</div>
      </details>
    );
  }

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
