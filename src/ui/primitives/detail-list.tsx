import { type ReactNode } from "react";

import { cn } from "@/platform/utils";

/**
 * A label/value list — the shape every detail surface in this app draws by
 * hand.
 *
 * Seven places were rolling their own `<dl>/<dt>/<dd>` with slightly different
 * type sizes and slightly different answers for "what does an empty value look
 * like". This is the one answer: a blank renders as an em dash, never as an
 * empty cell that reads like a rendering bug.
 */
export function DetailList({
  children,
  columns = 1,
  className,
}: {
  children: ReactNode;
  /** Two columns from `lg` up; one column always on narrow screens. */
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "text-sm text-foreground",
        columns === 2
          ? "grid gap-x-8 gap-y-3 lg:grid-cols-2"
          : "flex flex-col gap-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function DetailRow({
  label,
  value,
  emptyText = "—",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Shown when `value` is null, undefined, or an empty/whitespace string. */
  emptyText?: string;
  className?: string;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "");

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("break-words", isEmpty && "text-muted-foreground")}>
        {isEmpty ? emptyText : value}
      </dd>
    </div>
  );
}
