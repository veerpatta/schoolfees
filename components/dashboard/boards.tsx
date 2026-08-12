import Link from "next/link";

import {
  BarRow,
  CHART_COLORS,
  MiniDonut,
  StackedBar,
  StatTile,
  Tile,
  TONE_COLORS,
  TrendBars,
} from "@/components/dashboard/tiles";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/admin/status-badge";
import type { DashboardAnalytics } from "@/lib/dashboard/analytics";
import type {
  DashboardInstallmentSummaryRow,
  DashboardFollowUpStudent,
  DashboardPaymentModeBreakdown,
} from "@/lib/dashboard/summary";
import { formatInr } from "@/lib/helpers/currency";

/**
 * The five boards.
 *
 * Each is a grid of tiles, not a stack of titled sections with paragraphs under
 * them. Every number on every board is fees-only unless the label says late fee.
 */

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

function formatMonth(month: string) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short" });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank",
  cheque: "Cheque",
};

/* ── Overview ──────────────────────────────────────────────────────────── */

export function OverviewBoard({
  installmentSummary,
  followUpQueue,
  todayModes,
  sessionLabel,
  studentCounts,
}: {
  installmentSummary: DashboardInstallmentSummaryRow[];
  followUpQueue: DashboardFollowUpStudent[];
  todayModes: DashboardPaymentModeBreakdown[];
  sessionLabel: string;
  studentCounts: { paid: number; partly: number; overdue: number; notStarted: number };
}) {
  const withSession = (href: string) => `${href}?session=${encodeURIComponent(sessionLabel)}`;
  const currentYear = installmentSummary.filter((row) => !row.isCarryForward);
  const rosterTotal =
    studentCounts.paid + studentCounts.partly + studentCounts.overdue + studentCounts.notStarted;

  return (
    <div className={GRID}>
      <Tile label="Installment progress" className="md:col-span-2">
        <div className="space-y-3">
          {currentYear.map((row) => {
            const collected = Math.max(row.collectedAmount, 0);
            const pending = Math.max(row.pendingAmount, 0);
            return (
              <div key={row.installmentNo}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{row.installmentLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.collectionRate}% · due {formatDate(row.dueDate)}
                  </span>
                </div>
                <StackedBar
                  className="mt-1.5"
                  height="h-2.5"
                  showLegend={false}
                  ariaLabel={`${row.installmentLabel} ${row.collectionRate}% collected`}
                  segments={[
                    { key: "c", label: "Collected", value: collected, color: TONE_COLORS.success },
                    { key: "p", label: "Pending", value: pending, color: TONE_COLORS.warning },
                  ]}
                />
              </div>
            );
          })}
        </div>
      </Tile>

      <Tile label="Where the roll stands">
        <MiniDonut
          ariaLabel="Students by payment state"
          centreValue={String(rosterTotal)}
          centreLabel="students"
          segments={[
            { key: "paid", label: "Cleared", value: studentCounts.paid, color: TONE_COLORS.success },
            { key: "partly", label: "Part paid", value: studentCounts.partly, color: CHART_COLORS[3] },
            { key: "overdue", label: "Overdue", value: studentCounts.overdue, color: TONE_COLORS.danger },
            { key: "none", label: "Not started", value: studentCounts.notStarted, color: TONE_COLORS.muted },
          ]}
        />
      </Tile>

      <Tile label="Today by mode">
        {todayModes.length > 0 ? (
          <MiniDonut
            ariaLabel="Today's collection by payment mode"
            centreValue={formatInr(
              todayModes.reduce((sum, mode) => sum + mode.amount, 0),
              { compact: true },
            )}
            centreLabel="today"
            segments={todayModes.map((mode, index) => ({
              key: mode.paymentMode,
              label: MODE_LABELS[mode.paymentMode] ?? mode.paymentMode,
              value: mode.amount,
              color: CHART_COLORS[index % CHART_COLORS.length],
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing collected yet today.</p>
        )}
      </Tile>

      <Tile
        label="Worth a call today"
        className="md:col-span-2"
        action={
          <Link
            href={withSession("/protected/defaulters")}
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            All defaulters
          </Link>
        }
      >
        {followUpQueue.length > 0 ? (
          <ul className="divide-y divide-border">
            {followUpQueue.slice(0, 6).map((student) => (
              <li key={student.studentId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{student.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.classLabel}
                    {student.fatherPhone ? ` · ${student.fatherPhone}` : ""}
                  </p>
                </div>
                <Money value={student.outstandingAmount} size="sm" className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody is behind on fees.</p>
        )}
      </Tile>
    </div>
  );
}

/* ── Collection ────────────────────────────────────────────────────────── */

export function CollectionBoard({ analytics }: { analytics: DashboardAnalytics }) {
  const months = analytics.monthlyCollection;
  const collected = months.reduce((sum, month) => sum + month.amount, 0);
  const receipts = months.reduce((sum, month) => sum + month.receipts, 0);
  const averageReceipt = receipts > 0 ? Math.round(collected / receipts) : 0;

  // Run-rate projection: the mean of the last three months carried forward to
  // the end of the session. Drawn at 40% opacity and labelled a projection --
  // it is arithmetic, not a forecast anyone should bank on.
  const recent = months.slice(-3);
  const runRate =
    recent.length > 0
      ? Math.round(recent.reduce((sum, month) => sum + month.amount, 0) / recent.length)
      : 0;

  const points = months.map((month) => ({
    key: month.month,
    label: formatMonth(month.month),
    value: month.amount,
  }));
  const projectionFrom = points.length;
  const projected = [1, 2, 3].map((offset) => {
    const last = months.at(-1)?.month ?? "2026-04";
    const [year, monthPart] = last.split("-").map(Number);
    const date = new Date(year, monthPart - 1 + offset, 1);
    return {
      key: `projected-${offset}`,
      label: date.toLocaleDateString("en-IN", { month: "short" }),
      value: runRate,
      projected: true,
    };
  });

  const modeTotals = months.reduce<Record<string, number>>((acc, month) => {
    for (const [mode, amount] of Object.entries(month.byMode ?? {})) {
      acc[mode] = (acc[mode] ?? 0) + amount;
    }
    return acc;
  }, {});

  return (
    <div className={GRID}>
      <Tile label="Collection by month" className="md:col-span-2 xl:col-span-3">
        <TrendBars
          ariaLabel="Collection by month, with a run-rate projection"
          points={[...points, ...projected]}
          projectionFrom={projectionFrom}
        />
        <p className="text-xs text-muted-foreground">
          Faded bars are the last three months&apos; average carried forward.
        </p>
      </Tile>

      <StatTile label="Collected this session" value={collected} tone="success" />
      <StatTile
        label="Average receipt"
        value={averageReceipt}
        footnote={`${receipts} receipts`}
      />
      <StatTile label="Monthly run rate" value={runRate} footnote="Mean of the last three months" />

      <Tile label="Payment mix" className="md:col-span-2">
        <StackedBar
          ariaLabel="Collection by payment mode across the session"
          segments={Object.entries(modeTotals).map(([mode, amount], index) => ({
            key: mode,
            label: MODE_LABELS[mode] ?? mode,
            value: amount,
            color: CHART_COLORS[index % CHART_COLORS.length],
          }))}
        />
      </Tile>

      <Tile label="Families paying, by month">
        <div className="space-y-1">
          {months.slice(-6).map((month) => (
            <div key={month.month} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{formatMonth(month.month)}</span>
              <span className="tabular font-medium">{month.students}</span>
            </div>
          ))}
        </div>
      </Tile>
    </div>
  );
}

/* ── Recovery ──────────────────────────────────────────────────────────── */

const AGE_LABELS: Record<string, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "Over 90 days",
};

const AGE_COLORS: Record<string, string> = {
  "0-30": TONE_COLORS.warning,
  "31-60": CHART_COLORS[3],
  "61-90": CHART_COLORS[1],
  "90+": TONE_COLORS.danger,
};

export function RecoveryBoard({
  analytics,
  oldBalance,
}: {
  analytics: DashboardAnalytics;
  oldBalance: { original: number; recovered: number; pending: number };
}) {
  const { debtAge, concentration } = analytics;
  const stale = debtAge.find((bucket) => bucket.bucket === "90+");
  const agedTotal = debtAge.reduce((sum, bucket) => sum + bucket.feesPending, 0);

  return (
    <div className={GRID}>
      <Tile label="How old is the money owed" className="md:col-span-2">
        <StackedBar
          ariaLabel="Fees pending by how long they have been overdue"
          segments={debtAge.map((bucket) => ({
            key: bucket.bucket,
            label: AGE_LABELS[bucket.bucket] ?? bucket.bucket,
            value: bucket.feesPending,
            color: AGE_COLORS[bucket.bucket] ?? TONE_COLORS.muted,
          }))}
        />
        {stale && agedTotal > 0 ? (
          <p className="text-xs text-muted-foreground">
            {Math.round((stale.feesPending / agedTotal) * 100)}% of overdue fees are more than 90
            days old, across {stale.students} students.
          </p>
        ) : null}
      </Tile>

      <Tile label="Is the debt concentrated?">
        <div className="space-y-3">
          <BarRow
            label="Top 10 families"
            value={concentration.top10Amount}
            max={concentration.totalPending}
            meta={`${concentration.top10Pct}% of everything owed`}
            color={CHART_COLORS[1]}
          />
          <BarRow
            label="Top 50 families"
            value={concentration.top50Amount}
            max={concentration.totalPending}
            meta={`${concentration.top50Pct}% of everything owed`}
            color={CHART_COLORS[4]}
          />
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          {concentration.top50Pct < 40
            ? `Spread thin across ${concentration.studentsWithDues} families — no shortlist clears this.`
            : `Concentrated: a shortlist of 50 covers ${concentration.top50Pct}% of it.`}
        </p>
      </Tile>

      <StatTile
        label="Families with fees due"
        value={concentration.studentsWithDues}
        tone="warning"
        size="md"
      />
      <StatTile label="Old balance brought forward" value={oldBalance.original} size="md" />
      <StatTile
        label="Old balance recovered"
        value={oldBalance.recovered}
        tone="success"
        size="md"
        footnote={
          oldBalance.original > 0
            ? `${Math.round((oldBalance.recovered / oldBalance.original) * 100)}% of what was carried in`
            : undefined
        }
      />
    </div>
  );
}

/* ── Classes ───────────────────────────────────────────────────────────── */

export function ClassesBoard({
  analytics,
  sessionLabel,
}: {
  analytics: DashboardAnalytics;
  sessionLabel: string;
}) {
  const rows = analytics.classRecovery;
  const worstPending = Math.max(...rows.map((row) => row.feesPending), 1);
  const behind = rows.filter((row) => row.recoveryRate < 50).length;
  const ahead = rows.filter((row) => row.recoveryRate >= 75).length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Tile label="Fees pending by class" className="xl:col-span-2">
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <BarRow
              key={row.classId}
              label={row.classLabel}
              value={row.feesPending}
              max={worstPending}
              meta={`${row.recoveryRate}% collected · ${row.studentsAtRisk} of ${row.students} behind${
                row.lateFeePending > 0 ? ` · late fee ${formatInr(row.lateFeePending)}` : ""
              }`}
              color={
                row.recoveryRate >= 75
                  ? TONE_COLORS.success
                  : row.recoveryRate >= 50
                    ? TONE_COLORS.warning
                    : TONE_COLORS.danger
              }
              href={`/protected/students?session=${encodeURIComponent(sessionLabel)}&classId=${row.classId}`}
            />
          ))}
        </div>
      </Tile>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
        <StatTile label="Classes above 75%" value={ahead} tone="success" size="md" />
        <StatTile label="Classes below 50%" value={behind} tone="danger" size="md" />
        <StatTile
          label="Classes tracked"
          value={rows.length}
          size="md"
          className="col-span-2 xl:col-span-1"
        />
      </div>
    </div>
  );
}

/* ── Late fee ──────────────────────────────────────────────────────────── */

const WAIVER_SOURCE_LABELS: Record<string, string> = {
  grandfather: "Waived automatically by a rule change",
  migration: "Carried over from the old waiver pool",
  manual: "Waived by staff",
  payment_desk: "Waived at the counter",
  repayment_plan: "Folded into an EMI plan",
};

export function LateFeeBoard({
  analytics,
  sessionLabel,
}: {
  analytics: DashboardAnalytics;
  sessionLabel: string;
}) {
  const { lateFee } = analytics;
  const automatic = lateFee.byWaiverSource.filter(
    (source) => source.source === "grandfather" || source.source === "migration",
  );
  const automaticTotal = automatic.reduce((sum, source) => sum + source.amount, 0);
  const decided = lateFee.byWaiverSource.filter(
    (source) => source.source !== "grandfather" && source.source !== "migration",
  );

  return (
    <div className={GRID}>
      <Tile label="Where the late fee went" className="md:col-span-2">
        <StackedBar
          ariaLabel="Late fee charged, split into waived and still owed"
          segments={[
            { key: "waived", label: "Waived", value: lateFee.waived, color: TONE_COLORS.muted },
            { key: "pending", label: "Still owed", value: lateFee.pending, color: TONE_COLORS.danger },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {formatInr(lateFee.charged)} charged in total. {formatInr(lateFee.pending)} is still owed,
          by {lateFee.studentsWithPending} students.
        </p>
      </Tile>

      <StatTile
        label="Late fee still owed"
        value={lateFee.pending}
        tone="danger"
        footnote={`${lateFee.studentsWithPending} students`}
      />

      {automaticTotal > 0 ? (
        <Tile
          label="Waived without anyone deciding"
          tone="accent"
          className="md:col-span-2"
          action={
            <Link
              href={`/protected/students?session=${encodeURIComponent(sessionLabel)}&segments=late_fee_waived`}
              className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              Review
            </Link>
          }
        >
          <p className="font-display-money text-3xl leading-none text-foreground">
            {formatInr(automaticTotal)}
          </p>
          <ul className="space-y-1.5">
            {automatic.map((source) => (
              <li key={source.source} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  {WAIVER_SOURCE_LABELS[source.source] ?? source.source}
                </span>
                <span className="shrink-0 tabular">
                  {formatInr(source.amount)} · {source.students} students
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-snug text-muted-foreground">
            The school approved the corrected rule but not back-charging families, so the increase
            was waived. Voiding a waiver bills that installment.
          </p>
        </Tile>
      ) : null}

      <Tile
        label="Next accrual"
        tone={lateFee.nextAccrual.amount > 0 ? "danger" : "default"}
      >
        {lateFee.nextAccrual.amount > 0 ? (
          <>
            <p className="font-display-money text-3xl leading-none">
              {formatInr(lateFee.nextAccrual.amount)}
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              lands on {formatDate(lateFee.nextAccrual.dueDate)} across{" "}
              {lateFee.nextAccrual.installments} installments, unless they are paid or waived first.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing due to accrue.</p>
        )}
      </Tile>

      {decided.length > 0 ? (
        <Tile label="Waived by staff">
          <ul className="space-y-1.5">
            {decided.map((source) => (
              <li key={source.source} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {WAIVER_SOURCE_LABELS[source.source] ?? source.source}
                </span>
                <span className="shrink-0 tabular font-medium">{formatInr(source.amount)}</span>
              </li>
            ))}
          </ul>
        </Tile>
      ) : (
        <Tile label="Waived by staff">
          <p className="text-sm text-muted-foreground">
            No late fee has been waived at the counter this session.
          </p>
          <StatusBadge label="All waivers were automatic" tone="neutral" />
        </Tile>
      )}
    </div>
  );
}
