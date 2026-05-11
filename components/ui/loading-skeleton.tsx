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

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/** Atomic skeleton block — translate-x shimmer, no opacity pulse. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "anim-shimmer rounded-sm bg-surface-2",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Slim top-of-section indeterminate progress bar. */
export function LoadingProgress({ label = "Loading", className }: LoadingProgressProps) {
  return (
    <div className={cn("relative", className)} role="status" aria-label={label}>
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 rounded-full bg-foreground/40 anim-route-progress" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Skeleton card — used as page-level fallback. */
export function LoadingBlock({ className, lines = 3 }: LoadingBlockProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5",
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="mt-4 h-7 w-2/3" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-3", index === lines - 1 ? "w-5/6" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/** Table-row skeletons. */
export function LoadingTableRows({ rows = 4, columns = 4 }: LoadingTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-border" aria-hidden="true">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="px-3 py-3">
              <Skeleton className="h-3" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
