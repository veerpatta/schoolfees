import { Badge } from "@/ui/primitives/badge";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import type {
  StatementInstallmentStatus,
  StatementStudentView,
} from "@/modules/students/domain/statement-view-model";
import { cn } from "@/platform/utils";

/**
 * One student's two-column block: how the year is charged, and where each
 * installment stands.
 *
 * Rendered identically by the single-student statement and by each sibling on
 * the family statement — the two documents were drifting apart before this was
 * one component.
 */

const STATUS: Record<
  StatementInstallmentStatus,
  { label: string; variant: "success" | "accent" | "danger" | "neutral" }
> = {
  paid: { label: "Paid", variant: "success" },
  written: { label: "Written off", variant: "accent" },
  overdue: { label: "Overdue", variant: "danger" },
  pending: { label: "Pending", variant: "neutral" },
};

const TH = "px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground";

/** Zebra striping, applied at the row so print keeps the same rhythm. */
function rowTint(index: number) {
  return cn("border-t border-border", index % 2 === 1 && "bg-surface-2/40");
}

export function StudentChargeBlock({ view }: { view: StatementStudentView }) {
  const { installmentSplit } = view;

  return (
    // Never split one student across two sheets — a half-read installment table
    // is worse than a shorter first page.
    <div className="break-inside-avoid pt-2">
      <div className="flex items-baseline justify-between gap-3 border-b-[1.5px] border-border-strong pb-1.5">
        <p className="font-display text-[16px] font-bold">{view.name}</p>
        <p className="text-[12px] text-muted-foreground">{view.meta}</p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 pt-2">
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            How the year is charged
          </p>
          <table className="w-full border-collapse border border-border-strong text-[12px]">
            <thead>
              <tr className="bg-surface-2">
                <th className={cn(TH, "text-left")}>Fee head</th>
                <th className={cn(TH, "text-left")}>Basis</th>
                <th className={cn(TH, "text-right")}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {view.chargeRows.map((row, index) => (
                <tr
                  key={row.id}
                  className={
                    row.kind === "discount"
                      ? "border-t border-border bg-accent-soft/60 text-accent-soft-foreground"
                      : cn("border-t border-border", index === 0 && "border-t-0")
                  }
                >
                  <td className="px-2 py-1.5 font-medium">{row.label}</td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{row.basis}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {formatInr(row.amount)}
                  </td>
                </tr>
              ))}

              <tr className="border-t-[1.5px] border-border-strong bg-surface-2">
                <td className="px-2 py-1.5 font-bold" colSpan={2}>
                  Annual fee
                </td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                  {formatInr(view.annualFee)}
                </td>
              </tr>

              {view.extras.map((extra) => (
                <tr key={extra.label} className="border-t border-border">
                  <td className="px-2 py-1.5 font-medium" colSpan={2}>
                    {extra.label}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {formatInr(extra.amount)}
                  </td>
                </tr>
              ))}

              <tr className="border-t-[1.5px] border-border-strong bg-surface-2">
                <td className="px-2 py-1.5 font-bold" colSpan={2}>
                  Total charged
                </td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                  {formatInr(view.totalCharged)}
                </td>
              </tr>
            </tbody>
          </table>

          {installmentSplit.count > 0 ? (
            <p className="mt-1.5 text-[11px] leading-[1.45] text-muted-foreground">
              The annual fee is split across {installmentSplit.count} installment
              {installmentSplit.count === 1 ? "" : "s"} of about{" "}
              {formatInr(installmentSplit.approxAmount)}.
              {installmentSplit.collectsCarryForwardFirst
                ? " The previous-year balance is collected first, before any current-year installment."
                : ""}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-[1.45] text-muted-foreground">
              No installments have been prepared for this session yet.
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Installment status
          </p>
          {/* "Payable" is fees plus any late fee on the row — the figure the
              counter collects. Said here so no column is ever read as fees. */}
          <table className="w-full border-collapse border border-border-strong text-[12px]">
            <thead>
              <tr className="bg-surface-2">
                <th className={cn(TH, "text-left")}>Installment</th>
                <th className={cn(TH, "text-right")}>Charged</th>
                <th className={cn(TH, "text-right")}>Paid</th>
                <th className={cn(TH, "text-right")}>Payable</th>
                <th className={cn(TH, "text-center")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {view.installmentRows.map((row, index) => (
                <tr key={row.id} className={rowTint(index)}>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{row.label}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      Due {formatShortDate(row.dueDate)}
                      {row.lateFee > 0 ? ` · incl. ${formatInr(row.lateFee)} late fee` : ""}
                      {row.writtenOff > 0 ? ` · ${formatInr(row.writtenOff)} written off` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatInr(row.charged)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-success-soft-foreground">
                    {row.paid > 0 ? formatInr(row.paid) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                    {row.payable > 0 ? formatInr(row.payable) : "—"}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Badge
                      variant={STATUS[row.status].variant}
                      className="rounded-[5px] border border-current/40 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em]"
                    >
                      {STATUS[row.status].label}
                    </Badge>
                  </td>
                </tr>
              ))}

              <tr className="border-t-[1.5px] border-border-strong bg-surface-2">
                <td className="px-2 py-1.5 font-bold">Subtotal</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                  {formatInr(view.totalCharged)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-success-soft-foreground">
                  {formatInr(view.paidInCash)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-destructive-soft-foreground">
                  {formatInr(view.stillPayable)}
                </td>
                <td className="px-2 py-1.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
