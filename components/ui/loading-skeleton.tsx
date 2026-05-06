import { cn } from "@/lib/utils";

type LoadingProgressProps = {
  label?: string;
  className?: string;
};

type LoadingBlockProps = {
  className?: string;
  lines?: number;
};

type LoadingTableRowsProps = {
  rows?: number;
  columns?: number;
};

export function LoadingProgress({ label = "Loading", className }: LoadingProgressProps) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label={label}>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 rounded-full bg-slate-500 animate-loading-bar" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function LoadingBlock({ className, lines = 3 }: LoadingBlockProps) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white p-4", className)} aria-hidden="true">
      <div className="h-4 w-28 rounded bg-slate-200 animate-soft-shimmer" />
      <div className="mt-4 h-8 w-2/3 rounded bg-slate-200 animate-soft-shimmer" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-3 rounded bg-slate-100 animate-soft-shimmer",
              index === lines - 1 ? "w-5/6" : "w-full",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function LoadingTableRows({ rows = 4, columns = 4 }: LoadingTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-slate-100" aria-hidden="true">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="px-3 py-3">
              <div className="h-3 rounded bg-slate-100 animate-soft-shimmer" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
