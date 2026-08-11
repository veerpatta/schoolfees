import Link from "next/link";

import { Notice } from "@/components/ui/notice";
import { formatInr } from "@/lib/helpers/currency";
import type {
  RepaymentPlanDetail,
  RepaymentPlanPaymentStatus,
  RepaymentScheduleRow,
} from "@/lib/repayment-plans/types";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<
  RepaymentPlanPaymentStatus,
  { label: string; tone: string; blurb: string }
> = {
  upcoming: {
    label: "Starts soon",
    tone: "bg-info-soft text-info-soft-foreground",
    blurb: "The first EMI is not due yet.",
  },
  on_track: {
    label: "On track",
    tone: "bg-success-soft text-success-soft-foreground",
    blurb: "Everything due so far has been paid.",
  },
  due: {
    label: "Due now",
    tone: "bg-warning-soft text-warning-soft-foreground",
    blurb: "This month's EMI is outstanding.",
  },
  behind: {
    label: "Behind",
    tone: "bg-destructive-soft text-destructive-soft-foreground",
    blurb: "At least one EMI has gone past its due date unpaid.",
  },
  completed: {
    label: "Completed",
    tone: "bg-success-soft text-success-soft-foreground",
    blurb: "The plan balance is cleared.",
  },
};

const ROW_STATUS_COPY: Record<RepaymentScheduleRow["status"], { label: string; tone: string }> = {
  paid_on_time: { label: "Paid on time", tone: "text-success-soft-foreground" },
  paid_late: { label: "Paid late", tone: "text-warning-soft-foreground" },
  partial: { label: "Part paid", tone: "text-warning-soft-foreground" },
  missed: { label: "Missed", tone: "text-destructive" },
  upcoming: { label: "Upcoming", tone: "text-muted-foreground" },
};

const SCOPE_LABELS = {
  old_balance_only: "Previous-year balance only",
  old_and_current: "Previous year + full current year",
} as const;

function formatDate(value: string | null) {
  if (!value) return "—";

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-base font-bold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StudentRepaymentPlanCard({
  detail,
  editHref,
  className,
}: {
  detail: RepaymentPlanDetail;
  /** Admin-only link to the manage section. Omitted for non-admins. */
  editHref?: string;
  className?: string;
}) {
  const { summary, schedule } = detail;
  const status = STATUS_COPY[summary.paymentStatus];
  const progressPercent =
    summary.openingBalance > 0
      ? Math.min(Math.round((summary.paidToDate / summary.openingBalance) * 100), 100)
      : 0;

  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}
      aria-labelledby="student-emi-plan-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="student-emi-plan-heading" className="text-sm font-extrabold text-foreground">
            Monthly EMI plan
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {SCOPE_LABELS[summary.scope]} · {formatInr(summary.monthlyAmount)} a month ·{" "}
            {summary.termMonths} instalment{summary.termMonths === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold",
            status.tone,
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="EMI plan progress"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          {formatInr(summary.paidToDate)} of {formatInr(summary.openingBalance)} cleared (
          {progressPercent}%). {status.blurb}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Remaining" value={formatInr(summary.remainingBalance)} />
        <Stat
          label="Next due"
          value={summary.nextDueDate ? formatInr(summary.nextDueAmount) : "—"}
          hint={summary.nextDueDate ? formatDate(summary.nextDueDate) : "Plan cleared"}
        />
        <Stat
          label="Catch up"
          value={formatInr(summary.catchUpAmount)}
          hint={
            summary.missedInstallmentCount > 0
              ? `${summary.missedInstallmentCount} missed`
              : "Nothing overdue"
          }
        />
        <Stat label="Ends" value={formatDate(summary.endDate)} />
      </div>

      {summary.planReviewNeeded ? (
        <Notice tone="warning" title="Plan review needed" className="mt-4">
          A fee covered by this plan changed, or a new unpaid charge appeared inside its scope. The
          agreed monthly amount was left alone — an admin decides whether to fold the change in.
        </Notice>
      ) : null}

      {summary.scope === "old_balance_only" ? (
        <Notice tone="info" className="mt-4">
          Only the previous-year balance is on EMI. Current-year fees keep their own due dates, and
          payments clear this plan first.
        </Notice>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">Monthly EMI schedule</caption>
          <thead className="bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                #
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Due date
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Amount
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => {
              const rowStatus = ROW_STATUS_COPY[row.status];

              return (
                <tr key={row.sequenceNo} className="border-t">
                  <td className="px-3 py-1.5 tabular-nums">{row.sequenceNo}</td>
                  <td className="px-3 py-1.5">{formatDate(row.dueDate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatInr(row.amount)}
                    {row.status === "partial" ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {formatInr(row.paidAmount)} paid
                      </span>
                    ) : null}
                  </td>
                  <td className={cn("px-3 py-1.5 text-right font-semibold", rowStatus.tone)}>
                    {rowStatus.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        {formatInr(summary.waivedLateFeeTotal)} of late fees was permanently waived when this plan
        started on {formatDate(summary.activatedAt.slice(0, 10))}
        {summary.activatedByLabel ? ` by ${summary.activatedByLabel}` : ""}.
      </p>

      {editHref ? (
        <Link
          href={editHref}
          className="mt-3 inline-block text-[12.5px] font-semibold underline underline-offset-4"
        >
          Reschedule or cancel this plan
        </Link>
      ) : null}
    </section>
  );
}
