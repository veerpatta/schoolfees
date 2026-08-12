import { randomUUID } from "node:crypto";

import Link from "next/link";

import { EmiLateFeeWaiveButton } from "@/components/students/emi-late-fee-waive-button";
import { Notice } from "@/components/ui/notice";
import { formatInr } from "@/lib/helpers/currency";
import {
  getDuesOutsidePlan,
  REPAYMENT_PLAN_SCOPE_LABELS,
} from "@/lib/repayment-plans/types";
import type {
  RepaymentEmiLateFee,
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

/**
 * The flat late fee a missed EMI attracts, and what has become of it.
 *
 * Rendered beside the month it belongs to so an admin waiving it can see which
 * month they are forgiving without cross-referencing the dues table.
 */
function EmiLateFeeCell({
  lateFee,
  sequenceNo,
  planId,
  studentId,
  sessionLabel,
  canWaive,
}: {
  lateFee: RepaymentEmiLateFee | null;
  sequenceNo: number;
  planId: string;
  studentId: string;
  sessionLabel: string;
  canWaive: boolean;
}) {
  if (!lateFee) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (lateFee.waivedAmount >= lateFee.amount) {
    return <span className="text-muted-foreground">Waived</span>;
  }

  if (lateFee.outstandingAmount <= 0) {
    return <span className="text-success-soft-foreground">Paid</span>;
  }

  return (
    <span className="inline-flex items-center justify-end gap-1">
      <span className="font-semibold text-destructive">
        {formatInr(lateFee.outstandingAmount)}
      </span>
      {canWaive ? (
        <EmiLateFeeWaiveButton
          planId={planId}
          studentId={studentId}
          sessionLabel={sessionLabel}
          sequenceNo={sequenceNo}
          lateFee={lateFee}
          clientRequestId={randomUUID()}
        />
      ) : null}
    </span>
  );
}

export function StudentRepaymentPlanCard({
  detail,
  editHref,
  canWaiveLateFees = false,
  duesOutsidePlanAmount = 0,
  className,
}: {
  detail: RepaymentPlanDetail;
  /** Admin-only link to the manage section. Omitted for non-admins. */
  editHref?: string;
  /** True for `fees:repayment_plan`. Only admins forgive an EMI late fee. */
  canWaiveLateFees?: boolean;
  /**
   * Money the plan's scope deliberately leaves out, priced live. Zero means
   * the partial scope happens to cover everything this student owes, so the
   * "stays outside the plan" notice would be describing nothing.
   */
  duesOutsidePlanAmount?: number;
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
            {REPAYMENT_PLAN_SCOPE_LABELS[summary.scope]} · {formatInr(summary.monthlyAmount)} a
            month ·{" "}
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

      {/* Gated on money actually sitting outside, not on the scope alone. A
          `current_year_only` plan for a student with no previous-year balance
          was being told about a balance that does not exist. */}
      {duesOutsidePlanAmount > 0 && getDuesOutsidePlan(summary.scope) === "current_year" ? (
        <Notice tone="info" className="mt-4">
          Only the previous-year balance is on EMI. {formatInr(duesOutsidePlanAmount)} of
          current-year fees keeps its own due dates, and payments clear this plan first.
        </Notice>
      ) : null}

      {duesOutsidePlanAmount > 0 && getDuesOutsidePlan(summary.scope) === "previous_year" ? (
        <Notice tone="info" className="mt-4">
          Only this year&rsquo;s fees are on EMI. {formatInr(duesOutsidePlanAmount)} of
          previous-year balance keeps its own due date, and payments clear this plan first.
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
                Late fee
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
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <EmiLateFeeCell
                      lateFee={row.lateFee}
                      sequenceNo={row.sequenceNo}
                      planId={summary.planId}
                      studentId={summary.studentId}
                      sessionLabel={summary.sessionLabel}
                      canWaive={canWaiveLateFees}
                    />
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
        {formatInr(summary.waivedLateFeeTotal)} of late fees on the covered installments was
        waived when this plan started on {formatDate(summary.activatedAt.slice(0, 10))}
        {summary.activatedByLabel ? ` by ${summary.activatedByLabel}` : ""}. From then on the
        calendar above carries the only penalty: every EMI that passes its due date unpaid
        attracts a flat {formatInr(1000)}, which an admin can waive once the family settles.
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
