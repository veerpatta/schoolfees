import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

export type MoneyBreakdownRow = {
  key: string;
  label: string;
  value: number | null | undefined;
  /** Visual sub-tone for this row only. */
  tone?: "neutral" | "muted" | "success" | "danger" | "warning";
  /** Show + on positive values (useful for explicit reductions like −Discount). */
  signed?: boolean;
  /** Optional sub-label rendered muted below the label (e.g. due date). */
  hint?: string;
  /** Mark this row as a deduction — value is rendered negative. */
  deduction?: boolean;
};

type MoneyBreakdownProps = {
  rows: readonly MoneyBreakdownRow[];
  /** Total row at the bottom. Skipped if null. */
  total?: { label: string; value: number | null | undefined; tone?: MoneyBreakdownRow["tone"] };
  /** Optional sub-total between rows and total. */
  subtotal?: { label: string; value: number | null | undefined };
  className?: string;
  /** Compact rendering for receipt-style 80mm thermal layouts. */
  dense?: boolean;
};

/**
 * Line-by-line money list. Used wherever a value is the sum of named parts
 * (annual heads, installment breakdown, fee detail). Every figure flows
 * through `<Money>`, so the glossary and formatting stay consistent.
 */
export function MoneyBreakdown({
  rows,
  total,
  subtotal,
  className,
  dense = false,
}: MoneyBreakdownProps) {
  const rowPadding = dense ? "py-0.5" : "py-1";

  return (
    <dl
      className={cn(
        "w-full text-sm",
        dense ? "text-[11px] leading-tight" : "text-sm",
        className,
      )}
    >
      {rows.map((row) => {
        const renderedValue =
          row.deduction && typeof row.value === "number" ? -Math.abs(row.value) : row.value;
        return (
          <div
            key={row.key}
            className={cn(
              "flex items-baseline justify-between gap-3 border-b border-border/60 last:border-b-0",
              rowPadding,
            )}
          >
            <div className="min-w-0">
              <dt className="truncate text-muted-foreground">{row.label}</dt>
              {row.hint ? (
                <p className="truncate text-[10px] text-muted-foreground/80">{row.hint}</p>
              ) : null}
            </div>
            <dd className="shrink-0">
              <Money
                value={renderedValue}
                tone={row.tone ?? (row.deduction ? "success" : "neutral")}
                signed={row.signed}
              />
            </dd>
          </div>
        );
      })}

      {subtotal ? (
        <div
          className={cn(
            "mt-1 flex items-baseline justify-between gap-3 border-t border-dashed border-border",
            rowPadding,
          )}
        >
          <dt className="font-medium text-muted-foreground">{subtotal.label}</dt>
          <dd>
            <Money value={subtotal.value} tone="muted" />
          </dd>
        </div>
      ) : null}

      {total ? (
        <div
          className={cn(
            "mt-1 flex items-baseline justify-between gap-3 border-t-2 border-border pt-1.5",
            rowPadding,
          )}
        >
          <dt className="font-semibold text-foreground">{total.label}</dt>
          <dd>
            <Money value={total.value} size="lg" tone={total.tone ?? "neutral"} />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
