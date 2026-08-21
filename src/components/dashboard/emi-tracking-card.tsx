import Link from "next/link";

import { Section } from "@/ui/primitives/section";
import { formatInr } from "@/platform/helpers/currency";
import {
  getRepaymentDashboardSummary,
  type RepaymentDashboardSummary,
} from "@/lib/repayment-plans/data";

function Metric({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  tone?: "warning" | "danger";
  href?: string;
}) {
  const body = (
    <>
      <span
        className={
          tone === "danger"
            ? "text-xl font-bold tabular-nums text-destructive"
            : tone === "warning"
              ? "text-xl font-bold tabular-nums text-warning-soft-foreground"
              : "text-xl font-bold tabular-nums text-foreground"
        }
      >
        {value}
      </span>
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
    </>
  );

  if (!href) {
    return <div className="min-w-0">{body}</div>;
  }

  return (
    <Link href={href} className="min-w-0 rounded-md underline-offset-4 hover:underline">
      {body}
    </Link>
  );
}

/**
 * EMI Tracking.
 *
 * Renders nothing when the school has no active plans, so the dashboard does
 * not grow a permanently empty card during rollout.
 *
 * Pass `summary` when the caller has already loaded it — the phone Recovery
 * board reads the same figures, and the dashboard loads it once for both. The
 * self-fetch stays for any other call site.
 */
export async function EmiTrackingCard({
  sessionLabel,
  summary: preloaded,
}: {
  sessionLabel: string;
  summary?: RepaymentDashboardSummary | null;
}) {
  const summary =
    preloaded !== undefined
      ? preloaded
      : await getRepaymentDashboardSummary(sessionLabel).catch(() => null);

  if (!summary || summary.activePlans === 0) {
    return null;
  }

  const collectionPercent =
    summary.expectedThisMonth > 0
      ? Math.min(Math.round((summary.collectedThisMonth / summary.expectedThisMonth) * 100), 100)
      : null;

  const studentsHref = (segment: string) =>
    `/protected/students?segments=${segment}&session=${encodeURIComponent(sessionLabel)}`;

  return (
    <Section
      title="EMI Tracking"
      description="Families clearing dues on a monthly repayment plan"
      variant="card"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Active plans" value={summary.activePlans} href={studentsHref("onEmi")} />
        <Metric label="On track" value={summary.onTrack} />
        <Metric
          label="Due now"
          value={summary.dueNow}
          tone={summary.dueNow > 0 ? "warning" : undefined}
          href={studentsHref("emiDue")}
        />
        <Metric
          label="Missed"
          value={summary.missed}
          tone={summary.missed > 0 ? "danger" : undefined}
          href={studentsHref("emiMissed")}
        />
      </div>

      <div className="mt-5 rounded-lg border bg-surface-2 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground">
            Expected vs collected this month
          </span>
          <span className="text-sm font-bold tabular-nums">
            {formatInr(summary.collectedThisMonth)} of {formatInr(summary.expectedThisMonth)}
            {collectionPercent !== null ? ` (${collectionPercent}%)` : ""}
          </span>
        </div>
        {collectionPercent !== null ? (
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={collectionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="EMI collected against expected this month"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${collectionPercent}%` }} />
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {formatInr(summary.remainingTotal)} still on plan across {summary.activePlans}{" "}
          famil{summary.activePlans === 1 ? "y" : "ies"}
          {summary.catchUpTotal > 0
            ? ` · ${formatInr(summary.catchUpTotal)} needed to bring everyone current`
            : ""}
          {summary.planReviewNeeded > 0
            ? ` · ${summary.planReviewNeeded} need${summary.planReviewNeeded === 1 ? "s" : ""} plan review`
            : ""}
        </p>
      </div>

      {summary.topPriorityStudents.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chase first
          </p>
          <ul className="divide-y rounded-lg border">
            {summary.topPriorityStudents.map((row) => (
              <li key={row.planId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/protected/students/${row.studentId}`}
                    className="block truncate text-[13px] font-semibold underline-offset-4 hover:underline"
                  >
                    {row.studentName}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">
                    SR {row.admissionNo}
                    {row.missedInstallmentCount > 0
                      ? ` · ${row.missedInstallmentCount} EMI missed`
                      : " · EMI due"}
                  </span>
                </div>
                <span className="shrink-0 text-[13px] font-bold tabular-nums">
                  {formatInr(row.catchUpAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
