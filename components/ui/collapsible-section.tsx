import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A `Section` that folds away.
 *
 * Deliberately its own module rather than a `collapsible` prop on `Section`.
 * `Section` is imported by dozens of CLIENT components, so anything added there
 * — a branch, and especially a lucide icon — ships in each of their route
 * bundles. Measured: adding it to `Section` cost /protected/receipts 188 gzip
 * bytes and pushed it through its ceiling, for a disclosure that route does not
 * render. Here, only Server Components import it, so it costs client routes
 * nothing at all.
 *
 * The chevron is inline SVG for the same reason: an icon import would drag the
 * dependency back in the moment a client component ever imports this.
 *
 * Chrome is kept in step with `Section` by hand. If the card geometry there
 * changes, change it here too.
 */
export function CollapsibleSection({
  id,
  title,
  description,
  children,
  className,
  defaultOpen = false,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Default closed: the point of folding it away is that it starts away. */
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn("group rounded-lg border border-border bg-card p-3.5 md:p-5", className)}
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3 md:mt-5">{children}</div>
    </details>
  );
}
