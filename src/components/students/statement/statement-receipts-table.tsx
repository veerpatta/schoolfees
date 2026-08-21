import { Stamp } from "@/ui/primitives/stamp";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import type { StatementReceiptRow } from "@/lib/students/statement-view-model";
import { cn } from "@/platform/utils";

/**
 * The receipt register, oldest-first with a running balance, so the page reads
 * like a passbook: each line says what was received and what was still owed
 * after it.
 *
 * A reversed receipt stays on the page and is struck through — the register is
 * append-only, and a receipt that vanished would alarm a parent more than one
 * marked void. It moves no money, so the balance beside it does not change.
 */

const TH = "px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground";

export function StatementReceiptsTable({
  title,
  rows,
  totalReceived,
  outstanding,
  showStudentColumn = false,
  balanceLabel = "Balance after",
  isYearClear = false,
}: {
  title: string;
  rows: StatementReceiptRow[];
  totalReceived: number;
  outstanding: number;
  showStudentColumn?: boolean;
  balanceLabel?: string;
  isYearClear?: boolean;
}) {
  const leadingColumns = showStudentColumn ? 5 : 4;

  return (
    <div className="pt-2.5">
      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-strong px-3 py-4 text-center text-[12.5px] text-muted-foreground">
          No payments have been received for this session yet.
        </p>
      ) : (
        <table className="w-full border-collapse border border-border-strong text-[12.5px]">
          {/* Repeats the header when the register spills onto a second sheet. */}
          <thead className="table-header-group">
            <tr className="bg-surface-2">
              <th className={cn(TH, "text-left")}>Date</th>
              <th className={cn(TH, "text-left")}>Receipt no</th>
              {showStudentColumn ? <th className={cn(TH, "text-left")}>Student</th> : null}
              <th className={cn(TH, "text-left")}>Applied to</th>
              <th className={cn(TH, "text-left")}>Mode</th>
              <th className={cn(TH, "text-right")}>Amount</th>
              <th className={cn(TH, "text-right")}>{balanceLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className={cn("border-t border-border", index % 2 === 1 && "bg-surface-2/40")}
              >
                <td className="px-2.5 py-1.5 tabular-nums">{formatShortDate(row.paymentDate)}</td>
                <td className="px-2.5 py-1.5 font-mono text-[11px] font-medium">
                  {row.receiptNumber}
                </td>
                {showStudentColumn ? (
                  <td className="px-2.5 py-1.5 font-medium">{row.studentName}</td>
                ) : null}
                <td className="px-2.5 py-1.5 text-muted-foreground">{row.appliedTo ?? "—"}</td>
                <td className="px-2.5 py-1.5">
                  {row.isReversed ? (
                    <Stamp variant="void" size="sm" rotate={-4}>
                      Reversed
                    </Stamp>
                  ) : row.isWriteOff ? (
                    <span className="inline-block rounded-[5px] bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-soft-foreground">
                      {row.modeLabel}
                    </span>
                  ) : (
                    row.modeLabel
                  )}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right font-semibold tabular-nums",
                    row.isReversed && "line-through opacity-60",
                    row.isWriteOff && "text-accent-soft-foreground",
                  )}
                >
                  {formatInr(row.amount)}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.isReversed ? "—" : formatInr(row.balanceAfter)}
                </td>
              </tr>
            ))}

            <tr className="border-t-[1.5px] border-border-strong bg-surface-2">
              <td className="px-2.5 py-2 font-bold" colSpan={leadingColumns}>
                <span className="inline-flex items-center gap-2">
                  Received in cash
                  {isYearClear ? (
                    <Stamp variant="year-cleared" size="sm" rotate={-4}>
                      Year Cleared
                    </Stamp>
                  ) : null}
                </span>
              </td>
              <td className="px-2.5 py-2 text-right font-bold tabular-nums text-success-soft-foreground">
                {formatInr(totalReceived)}
              </td>
              <td className="px-2.5 py-2 text-right font-bold tabular-nums text-destructive-soft-foreground">
                {formatInr(outstanding)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
