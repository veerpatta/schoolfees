import {
  LoadingBlock,
  LoadingProgress,
  LoadingTableRows,
  Skeleton,
} from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";

type RouteLoadingProps = {
  title: string;
  description: string;
  badgeLabel?: string;
  /** "cards" variant only. */
  cards?: number;
  /**
   * Shape of the page being waited for. A skeleton that looks nothing like
   * what arrives is worse than none — it makes the page appear to change
   * layout on load.
   */
  variant?: "cards" | "table" | "form";
  /** "table" variant only. */
  rows?: number;
  columns?: number;
};

/**
 * The table skeleton is `md:`-gated here, once, rather than at each of its call
 * sites. A wide table on a phone means scrubbing sideways to read one row, and
 * tests/ui/mobile-wide-tables.test.ts enforces that — gating it in the
 * primitive means fifteen loading screens cannot each get it wrong.
 */
function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full">
          <tbody>
            <LoadingTableRows rows={rows} columns={columns} />
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <LoadingBlock key={index} />
        ))}
      </div>
    </>
  );
}

function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9" />
        </div>
      ))}
    </div>
  );
}

export function RouteLoading({
  title,
  description,
  badgeLabel = "Loading",
  cards = 4,
  variant = "cards",
  rows = 6,
  columns = 5,
}: RouteLoadingProps) {
  return (
    <div className="space-y-6 anim-fade-in">
      <div className="space-y-3">
        <Badge variant="neutral" dot="info">
          {badgeLabel}
        </Badge>
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <LoadingProgress className="max-w-sm" label={title} />
      </div>

      {variant === "table" ? (
        <TableSkeleton rows={rows} columns={columns} />
      ) : variant === "form" ? (
        <FormSkeleton fields={cards * 2} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: cards }).map((_, index) => (
            <LoadingBlock key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
