import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Inbox,
  Phone,
  ReceiptText,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { CopyReminderButton } from "@/components/dashboard/copy-reminder-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/section";
import {
  getDashboardAboveFoldData,
  getDashboardPageData,
  type DashboardAlert,
} from "@/lib/dashboard/data";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import {
  hasStaffPermission,
  requireStaffPermission,
} from "@/lib/supabase/session";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-revalidation";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";

function formatPercent(value: number) {
  return `${value}%`;
}

function getBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return "0%";
  return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
}

function alertTone(tone: DashboardAlert["tone"]): React.ComponentProps<typeof Notice>["tone"] {
  switch (tone) {
    case "danger":
      return "danger";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    default:
      return "info";
  }
}

function alertIcon(tone: DashboardAlert["tone"]) {
  switch (tone) {
    case "danger":
    case "warning":
      return AlertTriangle;
    case "success":
      return CheckCircle2;
    case "info":
    default:
      return CircleAlert;
  }
}

/* ---------------------------------------------------------------------------
   Hero strip — three KPIs that summarise "what should I look at today?"
   --------------------------------------------------------------------------- */

function HeroKpis({
  collected,
  pending,
  collectionRate,
  receiptsToday,
  followUpCount,
}: {
  collected: number;
  pending: number;
  collectionRate: number;
  receiptsToday: number;
  followUpCount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCard
        accent="accent"
        label="Today collection"
        value={
          <CountUp
            value={collected}
            className="text-2xl font-semibold tracking-tight md:text-[28px] md:leading-[34px]"
          />
        }
        hint={`${receiptsToday} receipt${receiptsToday === 1 ? "" : "s"} posted today`}
      />
      <KpiCard
        accent="warning"
        label="Pending dues"
        value={
          <CountUp
            value={pending}
            className="text-2xl font-semibold tracking-tight md:text-[28px] md:leading-[34px]"
          />
        }
        hint={`${followUpCount} student${followUpCount === 1 ? "" : "s"} need follow-up`}
      />
      <KpiCard
        accent="info"
        label="Collection rate"
        value={
          <CountUp
            value={collectionRate}
            format="percent"
            className="tabular text-foreground"
          />
        }
        hint="Current session, dues prepared"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Quick actions — single row of clear, labeled buttons (no icon-only confusion)
   --------------------------------------------------------------------------- */

function QuickActions({
  canWriteStudents,
  canPostPayments,
}: {
  canWriteStudents: boolean;
  canPostPayments: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {canPostPayments ? (
        <Button asChild variant="accent" leadingIcon={<BadgeIndianRupee className="size-4" />}>
          <Link href="/protected/payments">Open Payment Desk</Link>
        </Button>
      ) : null}
      {canWriteStudents ? (
        <Button asChild variant="outline" leadingIcon={<UsersRound className="size-4" />}>
          <Link href="/protected/students/new">Add student</Link>
        </Button>
      ) : (
        <Button asChild variant="outline" leadingIcon={<UsersRound className="size-4" />}>
          <Link href="/protected/students">Students</Link>
        </Button>
      )}
      <Button asChild variant="outline" leadingIcon={<ReceiptText className="size-4" />}>
        <Link href="/protected/transactions">Transactions</Link>
      </Button>
      <Button asChild variant="ghost" leadingIcon={<ClipboardList className="size-4" />}>
        <Link href="/protected/defaulters">Defaulters</Link>
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Today panel — collection + payment-mode breakdown
   --------------------------------------------------------------------------- */

function TodayPanel({
  amount,
  receiptCount,
  modes,
}: {
  amount: number;
  receiptCount: number;
  modes: Array<{ paymentMode: string; amount: number; receiptCount: number }>;
}) {
  return (
    <Section
      title="Today"
      description="Collection posted at the desk for the current school day."
      actions={
        <Badge variant="accent" dot>
          {receiptCount} receipt{receiptCount === 1 ? "" : "s"}
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md bg-surface-2/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Collected today
          </p>
          <Money value={amount} size="display" className="mt-2" />
        </div>

        {modes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-surface-2/40 px-4 py-3 text-sm text-muted-foreground">
            No payment-mode breakup yet for today.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {modes.map((mode) => (
              <li
                key={mode.paymentMode}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{mode.paymentMode}</p>
                  <p className="text-xs text-muted-foreground">
                    {mode.receiptCount} receipt{mode.receiptCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Money value={mode.amount} size="lg" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------------------
   Follow-up queue
   --------------------------------------------------------------------------- */

function FollowUpQueue({
  rows,
  canPostPayments,
}: {
  rows: Array<{
    studentId: string;
    studentName: string;
    admissionNo: string;
    classLabel: string;
    fatherPhone: string | null;
    outstandingAmount: number;
    nextDueDate: string | null;
    statusLabel: string;
    reminderText: string;
  }>;
  canPostPayments: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={CheckCircle2}
        title="No defaulters in view"
        description="No outstanding follow-up items in the current dashboard window."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {rows.map((row) => (
        <li
          key={row.studentId}
          className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/40 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{row.studentName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.classLabel} · SR {row.admissionNo}
              {row.fatherPhone ? (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" aria-hidden="true" />
                    {row.fatherPhone}
                  </span>
                </>
              ) : null}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <Money value={row.outstandingAmount} size="lg" tone="warning" />
            <p className="text-xs text-muted-foreground">
              {row.nextDueDate
                ? `Oldest due ${formatShortDate(row.nextDueDate)}`
                : row.statusLabel || "Pending"}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:shrink-0">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/protected/students/${row.studentId}`}>Open</Link>
            </Button>
            <Button asChild size="sm" variant={canPostPayments ? "primary" : "outline"}>
              <Link href={`/protected/payments?studentId=${row.studentId}`}>
                {canPostPayments ? "Collect" : "Desk"}
              </Link>
            </Button>
            <CopyReminderButton text={row.reminderText} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
   Recent receipts
   --------------------------------------------------------------------------- */

function RecentReceipts({
  rows,
}: {
  rows: Array<{
    receiptId: string;
    receiptNumber: string;
    paymentDate: string;
    studentName: string;
    classLabel: string;
    paymentMode: string;
    amount: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={Inbox}
        title="No receipts yet"
        description="Latest receipts will appear here after payment posting starts."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {rows.map((row) => (
        <li key={row.receiptId}>
          <Link
            href={`/protected/receipts/${row.receiptId}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{row.receiptNumber}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.studentName} · {row.classLabel}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatShortDate(row.paymentDate)} · {row.paymentMode}
              </p>
            </div>
            <Money value={row.amount} size="lg" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
   Class-wise pending — minimal hairline bar list
   --------------------------------------------------------------------------- */

function ClassPendingChart({
  rows,
}: {
  rows: Array<{
    classLabel: string;
    pendingAmount: number;
    collectionRate: number;
    totalStudents: number;
    studentsWithGeneratedDues: number;
  }>;
}) {
  const chartRows = rows.slice(0, 8);
  const maxPending = Math.max(...chartRows.map((row) => row.pendingAmount), 0);

  if (chartRows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={ClipboardList}
        title="No class-wise pending yet"
        description="Class-wise pending dues will appear after student fee data is ready."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {chartRows.map((row) => (
        <div
          key={row.classLabel}
          className="grid items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_8rem]"
        >
          <p className="truncate text-sm font-medium text-foreground">
            {row.classLabel}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-warning"
              style={{ width: getBarWidth(row.pendingAmount, maxPending) }}
            />
          </div>
          <div className="text-sm font-medium tabular text-foreground sm:text-right">
            {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0 ? (
              <span className="text-muted-foreground">Not prepared</span>
            ) : (
              formatInr(row.pendingAmount)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Collection trend
   --------------------------------------------------------------------------- */

function TrendChart({
  rows,
}: {
  rows: Array<{ date: string; amount: number; receiptCount: number }>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={TrendingUp}
        title="No collection trend yet"
        description="Trend will appear after receipts are posted."
      />
    );
  }

  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div
          key={row.date}
          className="grid items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_8rem]"
        >
          <p className="text-sm font-medium text-foreground">
            {formatShortDate(row.date)}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: getBarWidth(row.amount, maxAmount) }}
            />
          </div>
          <div className="text-sm font-medium tabular text-foreground sm:text-right">
            {formatInr(row.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Installment status
   --------------------------------------------------------------------------- */

function InstallmentStatus({
  rows,
}: {
  rows: Array<{
    installmentLabel: string;
    dueDate: string | null;
    expectedAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    collectionRate: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={CalendarClock}
        title="No installment status yet"
        description="Installment status will appear after ledgers are generated."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {rows.map((row) => (
        <li key={row.installmentLabel} className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{row.installmentLabel}</p>
              <p className="text-xs text-muted-foreground">
                Due {row.dueDate ? formatShortDate(row.dueDate) : "—"}
              </p>
            </div>
            <p className="text-sm font-semibold tabular text-foreground">
              {formatPercent(row.collectionRate)}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-info"
              style={{ width: `${row.collectionRate}%` }}
            />
          </div>
          <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
            <span>Expected · {formatInr(row.expectedAmount)}</span>
            <span>Collected · {formatInr(row.collectedAmount)}</span>
            <span>Pending · {formatInr(row.pendingAmount)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
   Class summary table
   --------------------------------------------------------------------------- */

function ClassSummaryTable({
  rows,
}: {
  rows: Array<{
    classLabel: string;
    totalStudents: number;
    expectedAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    collectionRate: number;
    studentsWithGeneratedDues: number;
    missingDuesStudents: number;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2/70">
          <tr className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Class</th>
            <th className="px-4 py-2.5 font-medium">Students</th>
            <th className="px-4 py-2.5 font-medium">Expected</th>
            <th className="px-4 py-2.5 font-medium">Collected</th>
            <th className="px-4 py-2.5 font-medium">Pending</th>
            <th className="px-4 py-2.5 font-medium">Overdue</th>
            <th className="px-4 py-2.5 font-medium">Collection %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                No class-wise fee position is available yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.classLabel} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.classLabel}</td>
                <td className="px-4 py-2.5 tabular">{row.totalStudents}</td>
                <td className="px-4 py-2.5 tabular">
                  {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0
                    ? <span className="text-muted-foreground">Not prepared</span>
                    : formatInr(row.expectedAmount)}
                </td>
                <td className="px-4 py-2.5 tabular">{formatInr(row.collectedAmount)}</td>
                <td className="px-4 py-2.5 font-semibold tabular text-foreground">
                  {formatInr(row.pendingAmount)}
                </td>
                <td className="px-4 py-2.5 tabular text-warning">
                  {formatInr(row.overdueAmount)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular">{formatPercent(row.collectionRate)}</span>
                    {row.missingDuesStudents > 0 ? (
                      <Badge variant="warning" dot>
                        {row.missingDuesStudents} dues missing
                      </Badge>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Alerts panel
   --------------------------------------------------------------------------- */

function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <Notice tone="success" iconless title="No attention items">
        No setup, import, or dues-update issues are visible right now.
      </Notice>
    );
  }

  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {alerts.slice(0, 6).map((alert) => {
        const Icon = alertIcon(alert.tone);
        return (
          <Notice
            key={alert.key}
            tone={alertTone(alert.tone)}
            iconless
            title={
              <span className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {alert.title}
              </span>
            }
            action={
              alert.actionHref && alert.actionLabel ? (
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={alert.actionHref}
                    className="inline-flex items-center gap-1 text-current"
                  >
                    {alert.actionLabel}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null
            }
          >
            {alert.detail}
          </Notice>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Fee-data attention banner
   --------------------------------------------------------------------------- */

function FeeDataAttentionBanner({
  health,
  canAutoPrepareDues,
}: {
  health: NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>;
  canAutoPrepareDues: boolean;
}) {
  const databaseObjectStatuses = Object.values(health.requiredDatabaseObjectsStatus);
  const needsAttention =
    health.sessionMismatch ||
    health.studentsMissingInstallmentRows > 0 ||
    health.studentsMissingFinancialRows > 0 ||
    health.studentsWithNoFeeSetting > 0 ||
    !health.paymentPreviewReady ||
    databaseObjectStatuses.some((status) => !status.usable) ||
    !health.paymentDeskReady ||
    !health.dashboardReady;

  if (
    !needsAttention ||
    (canAutoPrepareDues &&
      health.studentsMissingInstallmentRows > 0 &&
      health.studentsWithNoFeeSetting === 0)
  ) {
    return null;
  }

  return (
    <Notice
      tone="warning"
      title="Fee records need attention"
      action={
        <Button asChild size="sm" variant="outline">
          <Link href="/protected/admin-tools#fee-data-troubleshooting">
            Open Fee Data Troubleshooting
          </Link>
        </Button>
      }
    >
      {health.studentsMissingInstallmentRows > 0
        ? `${health.studentsMissingInstallmentRows} student${health.studentsMissingInstallmentRows === 1 ? "" : "s"} have dues not prepared.`
        : "Open Admin Tools for the detailed fee data status and follow-up actions."}
    </Notice>
  );
}

type DashboardAutoPrepareHealth = Pick<
  NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>,
  "studentsMissingInstallmentRows" | "studentsMissingInstallments"
>;

export function scheduleDashboardAutoPrepare({
  canAutoPrepareDues,
  sessionLabel,
  health,
}: {
  canAutoPrepareDues: boolean;
  sessionLabel: string;
  health: DashboardAutoPrepareHealth | null;
}) {
  const studentIds =
    health?.studentsMissingInstallments
      .map((student) => student.studentId)
      .filter(Boolean) ?? [];

  if (!canAutoPrepareDues || !health || health.studentsMissingInstallmentRows <= 0 || studentIds.length === 0) {
    return;
  }

  after(async () => {
    await prepareDuesForStudentsAutomatically({
      studentIds,
      reason: "Dashboard auto-prepare",
    });
    revalidateSessionFinance(sessionLabel, studentIds);
  });
}

function DashboardBelowFoldSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading dashboard details">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="h-64 rounded-md border border-border bg-surface-2/60" />
        <div className="h-64 rounded-md border border-border bg-surface-2/60" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-72 rounded-md border border-border bg-surface-2/60" />
        <div className="h-72 rounded-md border border-border bg-surface-2/60" />
        <div className="h-80 rounded-md border border-border bg-surface-2/60 xl:col-span-2" />
      </div>
      <div className="h-80 rounded-md border border-border bg-surface-2/60" />
    </div>
  );
}

async function DashboardBelowFold({
  staffRole,
  canPostPayments,
  sessionLabel,
  canAutoPrepareDues,
}: {
  staffRole: Awaited<ReturnType<typeof requireStaffPermission>>["appRole"];
  canPostPayments: boolean;
  sessionLabel: string;
  canAutoPrepareDues: boolean;
}) {
  const data = await getDashboardPageData({ staffRole, sessionLabel });
  const maxChartCards = data.classSummary.slice(0, 8);
  scheduleDashboardAutoPrepare({
    canAutoPrepareDues,
    sessionLabel,
    health: data.systemSyncHealth,
  });

  return (
    <>
      {staffRole === "admin" && data.systemSyncHealth ? (
        <FeeDataAttentionBanner
          health={data.systemSyncHealth}
          canAutoPrepareDues={canAutoPrepareDues}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Section
          title="Top defaulters"
          description="Students with the highest pending balances for daily follow-up."
          actions={
            <Button asChild size="sm" variant="ghost">
              <Link
                href="/protected/defaulters"
                className="inline-flex items-center gap-1"
              >
                Open all
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          <FollowUpQueue rows={data.followUpQueue} canPostPayments={canPostPayments} />
        </Section>

        <Section
          title="Recent receipts"
          description="Latest receipts saved by the office."
          actions={
            <Button asChild size="sm" variant="ghost">
              <Link
                href="/protected/transactions"
                className="inline-flex items-center gap-1"
              >
                All receipts
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          <RecentReceipts rows={data.recentPayments} />
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          title="Class-wise pending"
          description="Highest pending classes appear first."
        >
          <ClassPendingChart rows={maxChartCards} />
        </Section>
        <Section
          title="Collection trend"
          description="Daily collection over the recent window."
        >
          <TrendChart rows={data.collectionTrend} />
        </Section>
        <Section
          title="Installment status"
          description="Expected, collected, and pending totals by installment."
          className="xl:col-span-2"
        >
          <InstallmentStatus rows={data.installmentSummary} />
        </Section>
      </div>

      <Section
        title="Class-wise fee position"
        description="Sorted by highest pending amount."
      >
        <ClassSummaryTable rows={data.classSummary} />
      </Section>

      <Section
        title="Attention"
        description="Setup, import, and dues-update items that may need review."
      >
        <AlertsPanel alerts={data.alerts} />
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */

type DashboardPageProps = {
  searchParams?: Promise<{ notice?: string; prepared?: string; session?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const staff = await requireStaffPermission("dashboard:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const aboveFold = await getDashboardAboveFoldData({
    staffRole: staff.appRole,
    sessionLabel: viewSession.sessionLabel,
  });
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canAutoPrepareDues = hasStaffPermission(staff, "fees:write");
  const preparedCount = Number.parseInt(resolvedSearchParams?.prepared ?? "", 10);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Today's collection, pending dues, and follow-up — at a glance."
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge label={`Session ${aboveFold.currentSession}`} tone="accent" />
            {aboveFold.currentInstallment ? (
              <StatusBadge
                label={`${aboveFold.currentInstallment.label} · ${formatShortDate(aboveFold.currentInstallment.dueDate)}`}
                tone={aboveFold.currentInstallment.status === "overdue" ? "warning" : "neutral"}
              />
            ) : null}
          </div>
        }
      />

      {resolvedSearchParams?.notice ? (
        <Notice tone="success" iconless={false}>
          {resolvedSearchParams.notice}
        </Notice>
      ) : null}

      {Number.isFinite(preparedCount) && preparedCount > 0 ? (
        <Notice tone="success" iconless={false}>
          Refreshed dues for {preparedCount} student{preparedCount === 1 ? "" : "s"}.
        </Notice>
      ) : null}

      {/* Empty-state guidance */}
      {!aboveFold.emptyState.hasStudents ? (
        <Section
          title="No students yet"
          description="Start with student records, then review Fee Setup before collection."
          actions={<StatusBadge label="Get started" tone="accent" />}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              { href: "/protected/students/new", label: "Add a student", detail: "Create one student record." },
              { href: "/protected/imports/template", label: "Bulk-add students", detail: "Download the import template." },
              { href: "/protected/fee-setup", label: "Open Fee Setup", detail: "Check yearly fees before collection." },
              { href: "/protected/admin-tools", label: "Admin Tools", detail: "Setup, lists, and fixes." },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                  <span className="block text-xs text-muted-foreground">{action.detail}</span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </Section>
      ) : !aboveFold.emptyState.hasFinancialData ? (
        <Notice
          tone="warning"
          title="Students found, dues missing"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/admin-tools#fee-data-troubleshooting">Prepare dues</Link>
            </Button>
          }
        >
          Students exist for this year, but their payable dues are not ready yet.
        </Notice>
      ) : null}

      {/* Hero strip */}
      <div className="space-y-4">
        <HeroKpis
          collected={aboveFold.kpis.todaysCollection}
          pending={aboveFold.kpis.totalPending}
          collectionRate={aboveFold.kpis.collectionRate}
          receiptsToday={aboveFold.kpis.receiptsToday}
          followUpCount={aboveFold.studentsWithPending}
        />
        <QuickActions canWriteStudents={canWriteStudents} canPostPayments={canPostPayments} />
      </div>

      {/* Today + secondary KPIs */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <TodayPanel
          amount={aboveFold.kpis.todaysCollection}
          receiptCount={aboveFold.kpis.receiptsToday}
          modes={aboveFold.todayPaymentModeBreakdown}
        />
        <div className="grid grid-cols-2 content-start gap-3">
          <KpiCard
            label="Total expected"
            value={<Money value={aboveFold.kpis.totalExpectedFees} size="xl" />}
          />
          <KpiCard
            label="Total collected"
            value={<Money value={aboveFold.kpis.totalCollected} size="xl" tone="success" />}
            hint={`${formatPercent(aboveFold.kpis.collectionRate)} of expected`}
          />
          <KpiCard
            label="Active students"
            value={
              <span className="tabular">{aboveFold.kpis.totalStudents}</span>
            }
          />
          <KpiCard
            label="Refund / credit"
            value={<Money value={aboveFold.totalRefundDue} size="xl" tone="muted" />}
          />
          <div className="col-span-2">
            <KpiCard
              label="This month"
              value={<Money value={aboveFold.kpis.thisMonthCollection} size="xl" />}
              hint="Receipts posted in the current month."
            />
          </div>
        </div>
      </div>

      <Suspense fallback={<DashboardBelowFoldSkeleton />}>
        <DashboardBelowFold
          staffRole={staff.appRole}
          canPostPayments={canPostPayments}
          sessionLabel={viewSession.sessionLabel}
          canAutoPrepareDues={canAutoPrepareDues}
        />
      </Suspense>

    </div>
  );
}
