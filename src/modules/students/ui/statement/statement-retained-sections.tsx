import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import type { ResolvedFeeBreakdown } from "@/modules/fees/domain/types";
import type { RepaymentPlanDetail, RepaymentPlanSummary } from "@/modules/repayment-plans/domain/types";
import { cn } from "@/platform/utils";

/**
 * The three blocks the redesign did not draw but the office relies on: the EMI
 * schedule, the conventional-discount policy behind a reduced tuition, and the
 * per-student overrides. Restyled to the document's type scale rather than
 * dropped.
 *
 * The discount panel used to be `no-print`. It prints now: a parent asking "why
 * is my tuition ₹6,000?" is exactly the person holding the printout.
 */

const TH = "px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground";
const SECTION_LABEL =
  "mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground";

export function StatementRepaymentPlan({
  plan,
  history,
}: {
  plan: RepaymentPlanDetail | null;
  history: RepaymentPlanSummary[];
}) {
  if (!plan && history.length === 0) return null;

  return (
    <section className="break-inside-avoid pt-3">
      <p className={SECTION_LABEL}>Monthly EMI plan</p>

      {plan ? (
        <>
          <p className="text-[12px] leading-[1.5]">
            {formatInr(plan.summary.monthlyAmount)} a month over {plan.summary.termMonths}{" "}
            instalment{plan.summary.termMonths === 1 ? "" : "s"}, agreed on{" "}
            {formatShortDate(plan.summary.activatedAt.slice(0, 10))}
            {plan.summary.activatedByLabel ? ` by ${plan.summary.activatedByLabel}` : ""}.{" "}
            {formatInr(plan.summary.paidToDate)} of {formatInr(plan.summary.openingBalance)} cleared.
          </p>
          {plan.summary.waivedLateFeeTotal > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatInr(plan.summary.waivedLateFeeTotal)} of late fees was permanently waived when
              this plan started.
            </p>
          ) : null}

          <table className="mt-2 w-full border-collapse border border-border-strong text-[12px]">
            <thead className="table-header-group">
              <tr className="bg-surface-2">
                <th className={cn(TH, "text-left")}>EMI</th>
                <th className={cn(TH, "text-left")}>Due date</th>
                <th className={cn(TH, "text-right")}>Amount</th>
                <th className={cn(TH, "text-right")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.schedule.map((row, index) => (
                <tr
                  key={row.sequenceNo}
                  className={cn("border-t border-border", index % 2 === 1 && "bg-surface-2/40")}
                >
                  <td className="px-2 py-1.5 tabular-nums">{row.sequenceNo}</td>
                  <td className="px-2 py-1.5">{formatShortDate(row.dueDate)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatInr(row.amount)}</td>
                  <td className="px-2 py-1.5 text-right capitalize">
                    {row.status.replace(/_/g, " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {history.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {history.map((entry) => (
            <li key={entry.planId}>
              {formatShortDate(entry.activatedAt.slice(0, 10))} —{" "}
              {entry.lifecycle === "active"
                ? "plan activated"
                : entry.lifecycle === "superseded"
                  ? "plan rescheduled (replaced)"
                  : "plan cancelled"}
              : {formatInr(entry.openingBalance)} over {entry.termMonths} month
              {entry.termMonths === 1 ? "" : "s"} at {formatInr(entry.monthlyAmount)}.
              {entry.cancellationReason ? ` ${entry.cancellationReason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function StatementDiscountPolicyPanel({
  breakdown,
}: {
  breakdown: ResolvedFeeBreakdown;
}) {
  if (breakdown.conventionalDiscountApplied <= 0) return null;

  const applied =
    breakdown.tuitionBeforeConventionalDiscount - breakdown.conventionalDiscountApplied;

  return (
    <section className="break-inside-avoid pt-3">
      <p className={SECTION_LABEL}>Active conventional discount policy</p>
      <div className="rounded-[9px] border border-accent-soft-foreground/35 bg-accent-soft px-3 py-2 text-[11.5px] text-accent-soft-foreground">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Policy:{" "}
            <strong className="font-semibold">
              {breakdown.conventionalDiscountLabels.join(", ")}
            </strong>
          </span>
          <span>
            Baseline tuition:{" "}
            <span className="line-through">
              {formatInr(breakdown.tuitionBeforeConventionalDiscount)}
            </span>
          </span>
          <span>
            Applied tuition: <strong className="font-semibold">{formatInr(applied)}</strong>
          </span>
          <span>
            Saved:{" "}
            <strong className="font-semibold">
              {formatInr(breakdown.conventionalDiscountApplied)}
            </strong>
          </span>
        </div>
      </div>
    </section>
  );
}

export function StatementOverridesGrid({
  tuitionOverride,
  transportOverride,
  discountAmount,
  lateFeeWaiverAmount,
  otherAdjustmentHead,
  otherAdjustmentAmount,
}: {
  tuitionOverride: number | null;
  transportOverride: number | null;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
}) {
  const cells: Array<{ label: string; value: string }> = [
    {
      label: "Tuition override",
      value: tuitionOverride !== null ? formatInr(tuitionOverride) : "Class default",
    },
    {
      label: "Transport override",
      value: transportOverride !== null ? formatInr(transportOverride) : "Route default",
    },
    { label: "Discount", value: formatInr(discountAmount) },
    { label: "Late fee waiver", value: formatInr(lateFeeWaiverAmount) },
    {
      label: otherAdjustmentHead || "Other fee / adjustment",
      value: formatInr(otherAdjustmentAmount ?? 0),
    },
  ];

  return (
    <section className="break-inside-avoid pt-3">
      <p className={SECTION_LABEL}>Fee overrides on this student</p>
      <div className="grid grid-cols-5 gap-2 text-[11.5px]">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-[9px] border border-border px-2.5 py-1.5">
            <p className="truncate text-muted-foreground" title={cell.label}>
              {cell.label}
            </p>
            <p className="mt-0.5 font-semibold tabular-nums">{cell.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
