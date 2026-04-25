import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  IndianRupee,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { CopyReminderButton } from "@/components/dashboard/copy-reminder-button";
import { Button } from "@/components/ui/button";
import { getDashboardPageData, type DashboardAlert } from "@/lib/dashboard/data";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import {
  hasStaffPermission,
  requireStaffPermission,
} from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

function formatPercent(value: number) {
  return `${value}%`;
}

function getBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) {
    return "0%";
  }

  return `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
}

function getAlertToneClasses(tone: DashboardAlert["tone"]) {
  switch (tone) {
    case "danger":
      return "border-red-200 bg-red-50 text-red-950";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-950";
  }
}

function getAlertIcon(tone: DashboardAlert["tone"]) {
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

function ActionButtons({
  canWriteStudents,
}: {
  canWriteStudents: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {canWriteStudents ? (
        <Button asChild>
          <Link href="/protected/students/new">
            <UsersRound className="size-4" />
            Add student
          </Link>
        </Button>
      ) : (
        <Button asChild>
          <Link href="/protected/students">
            <UsersRound className="size-4" />
            Students
          </Link>
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href="/protected/payments">
          <BadgeIndianRupee className="size-4" />
          Open Payment Desk
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/protected/transactions">
          <ReceiptText className="size-4" />
          Transactions
        </Link>
      </Button>
    </div>
  );
}

function ProgressCard({
  collected,
  expected,
  pending,
  rate,
}: {
  collected: number;
  expected: number;
  pending: number;
  rate: number;
}) {
  return (
    <SectionCard
      title="Collection progress"
      description={`${formatInr(collected)} collected out of ${formatInr(expected)} expected. ${formatInr(pending)} is still pending.`}
      className="bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(239,246,255,0.92))]"
      actions={<StatusBadge label={`${rate}% collected`} tone={rate >= 75 ? "good" : "accent"} />}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-heading text-4xl font-semibold tracking-tight text-slate-950">
              {formatPercent(rate)}
            </p>
            <p className="mt-1 text-sm text-slate-600">Current session collection rate</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Collected
              </p>
              <p className="mt-1 font-semibold text-emerald-950">{formatInr(collected)}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Pending
              </p>
              <p className="mt-1 font-semibold text-amber-950">{formatInr(pending)}</p>
            </div>
          </div>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#0ea5e9,#10b981)]"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function TodayCard({
  amount,
  receiptCount,
  modes,
}: {
  amount: number;
  receiptCount: number;
  modes: Array<{ paymentMode: string; amount: number; receiptCount: number }>;
}) {
  return (
    <SectionCard
      title="Today's activity"
      description="Collection posted at the payment desk for the current school day."
    >
      <div className="space-y-4">
        <div className="rounded-3xl border border-sky-100 bg-sky-50/80 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Today&apos;s collection
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-950">
            {formatInr(amount)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {receiptCount} receipt{receiptCount === 1 ? "" : "s"} posted today.
          </p>
        </div>
        <div className="space-y-2">
          {modes.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No payment-mode breakup yet for today.
            </p>
          ) : (
            modes.map((mode) => (
              <div
                key={mode.paymentMode}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-950">{mode.paymentMode}</p>
                  <p className="text-xs text-slate-500">
                    {mode.receiptCount} receipt{mode.receiptCount === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-semibold text-slate-950">{formatInr(mode.amount)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function TrendChart({
  rows,
}: {
  rows: Array<{ date: string; amount: number; receiptCount: number }>;
}) {
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Collection trend will appear after receipts are posted.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.date} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_8rem] sm:items-center">
            <p className="text-sm font-medium text-slate-700">{formatShortDate(row.date)}</p>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: getBarWidth(row.amount, maxAmount) }}
              />
            </div>
            <p className="text-sm font-semibold text-slate-950 sm:text-right">
              {formatInr(row.amount)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

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

  return (
    <div className="space-y-3">
      {chartRows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Class-wise pending dues will appear after student fee data is ready.
        </p>
      ) : (
        chartRows.map((row) => (
          <div key={row.classLabel} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_8rem] sm:items-center">
            <p className="truncate text-sm font-medium text-slate-700">{row.classLabel}</p>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: getBarWidth(row.pendingAmount, maxPending) }}
              />
            </div>
            <p className="text-sm font-semibold text-slate-950 sm:text-right">
              {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0
                ? "Not prepared"
                : formatInr(row.pendingAmount)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

function BreakdownCard({
  collected,
  pending,
}: {
  collected: number;
  pending: number;
}) {
  const total = collected + pending;
  const collectedRate = total > 0 ? Math.round((collected / total) * 100) : 0;
  const pendingRate = total > 0 ? 100 - collectedRate : 0;

  return (
    <div className="space-y-4">
      <div className="flex h-44 items-end justify-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex h-full w-20 items-end rounded-t-2xl bg-white">
          <div
            className="w-full rounded-t-2xl bg-emerald-500"
            style={{ height: `${Math.max(6, collectedRate)}%` }}
          />
        </div>
        <div className="flex h-full w-20 items-end rounded-t-2xl bg-white">
          <div
            className="w-full rounded-t-2xl bg-amber-500"
            style={{ height: `${Math.max(6, pendingRate)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="font-semibold text-emerald-950">Collected</p>
          <p className="mt-1 text-emerald-800">{formatInr(collected)}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="font-semibold text-amber-950">Pending</p>
          <p className="mt-1 text-amber-800">{formatInr(pending)}</p>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Installment status will appear after ledgers are generated.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.installmentLabel} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">{row.installmentLabel}</p>
                <p className="text-xs text-slate-500">
                  Due {row.dueDate ? formatShortDate(row.dueDate) : "-"}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-950">
                {formatPercent(row.collectionRate)} collected
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${row.collectionRate}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              <span>Expected {formatInr(row.expectedAmount)}</span>
              <span>Collected {formatInr(row.collectedAmount)}</span>
              <span>Pending {formatInr(row.pendingAmount)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

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
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Students</th>
            <th className="px-4 py-3">Expected</th>
            <th className="px-4 py-3">Collected</th>
            <th className="px-4 py-3">Pending</th>
            <th className="px-4 py-3">Overdue</th>
            <th className="px-4 py-3">Collection %</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                No class-wise fee position is available yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.classLabel} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-950">{row.classLabel}</td>
                <td className="px-4 py-3">{row.totalStudents}</td>
                <td className="px-4 py-3">
                  {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0
                    ? "Not prepared"
                    : formatInr(row.expectedAmount)}
                </td>
                <td className="px-4 py-3">{formatInr(row.collectedAmount)}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{formatInr(row.pendingAmount)}</td>
                <td className="px-4 py-3 text-amber-800">{formatInr(row.overdueAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{formatPercent(row.collectionRate)}</span>
                    {row.missingDuesStudents > 0 ? (
                      <StatusBadge
                        label={`${row.missingDuesStudents} dues not prepared`}
                        tone="warning"
                      />
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
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
          No follow-up students found in the current dashboard data.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.studentId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">{row.studentName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.classLabel} | SR {row.admissionNo} | {row.fatherPhone ?? "No phone"}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-semibold text-amber-800">{formatInr(row.outstandingAmount)}</p>
                <p className="text-xs text-slate-500">
                  {row.nextDueDate ? `Next due ${formatShortDate(row.nextDueDate)}` : row.statusLabel || "Pending"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/protected/students/${row.studentId}`}>Open student</Link>
              </Button>
              <Button asChild size="sm" variant={canPostPayments ? "default" : "outline"}>
                <Link href={`/protected/payments?studentId=${row.studentId}`}>
                  {canPostPayments ? "Post payment" : "Payment Desk"}
                </Link>
              </Button>
              <CopyReminderButton text={row.reminderText} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

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
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Latest receipts will appear after payment posting starts.
        </p>
      ) : (
        rows.map((row) => (
          <Link
            key={row.receiptId}
            href={`/protected/receipts/${row.receiptId}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{row.receiptNumber}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.studentName} | {row.classLabel}
                </p>
              </div>
              <p className="font-semibold text-slate-950">{formatInr(row.amount)}</p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {formatShortDate(row.paymentDate)} | {row.paymentMode}
            </p>
          </Link>
        ))
      )}
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4" />
            No attention items
          </div>
          <p className="mt-1 text-emerald-800">No setup, import, or dues-update issues are visible right now.</p>
        </div>
      ) : (
        alerts.slice(0, 6).map((alert) => {
          const Icon = getAlertIcon(alert.tone);
          return (
            <div
              key={alert.key}
              className={cn("rounded-2xl border p-4 text-sm", getAlertToneClasses(alert.tone))}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{alert.title}</p>
                  <p className="mt-1 leading-6 opacity-85">{alert.detail}</p>
                  {alert.actionHref && alert.actionLabel ? (
                    <Link
                      href={alert.actionHref}
                      className="mt-2 inline-flex items-center gap-1 font-semibold text-current underline-offset-4 hover:underline"
                    >
                      {alert.actionLabel}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function FeeDataAttentionBanner({
  health,
}: {
  health: NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>;
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

  if (!needsAttention) {
    return null;
  }

  return (
    <SectionCard
      title="Fee records need attention"
      description="Some fee records need attention. Open Admin Tools to check and prepare missing dues."
      className="border-amber-100 bg-amber-50/70"
      actions={
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Needs attention" tone="warning" />
          <Button asChild size="sm">
            <Link href="/protected/advanced#fee-data-troubleshooting">
              Open Fee Data Troubleshooting
            </Link>
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-amber-950">
        {health.studentsMissingInstallmentRows > 0
          ? `${health.studentsMissingInstallmentRows} student${health.studentsMissingInstallmentRows === 1 ? "" : "s"} have dues not prepared.`
          : "Open Admin Tools for the detailed fee data status and follow-up actions."}
      </p>
    </SectionCard>
  );
}

type DashboardPageProps = {
  searchParams?: Promise<{
    notice?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const staff = await requireStaffPermission("dashboard:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getDashboardPageData({ staffRole: staff.appRole });
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewReports = hasStaffPermission(staff, "reports:view");
  const maxChartCards = data.classSummary.slice(0, 8);
  const nextActions = [
    canWriteStudents
      ? { href: "/protected/students/new", label: "Add student", icon: UsersRound }
      : { href: "/protected/students", label: "Open students", icon: UsersRound },
    { href: "/protected/defaulters", label: "Review defaulters", icon: CircleAlert },
    { href: "/protected/payments", label: "Payment Desk", icon: BadgeIndianRupee },
    { href: "/protected/fee-setup", label: "Fee Setup", icon: ClipboardList },
    canViewReports
      ? { href: "/protected/reports", label: "Export reports", icon: ReceiptText }
      : null,
  ].filter(
    (
      action,
    ): action is {
      href: string;
      label: string;
      icon: typeof UsersRound;
    } => action !== null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Dashboard"
        description="Today collection, pending dues, students, and follow-up."
        actions={
          <div className="space-y-3">
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              <StatusBadge label={`Session ${data.currentSession}`} tone="accent" />
              {data.currentInstallment ? (
                <StatusBadge
                  label={`${data.currentInstallment.label}: ${formatShortDate(data.currentInstallment.dueDate)}`}
                  tone={data.currentInstallment.status === "overdue" ? "warning" : "neutral"}
                />
              ) : null}
            </div>
            <ActionButtons canWriteStudents={canWriteStudents} />
          </div>
        }
      />

      {resolvedSearchParams?.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {resolvedSearchParams.notice}
        </div>
      ) : null}

      {!data.emptyState.hasStudents ? (
        <SectionCard
          title="No students yet"
          description="Start with test students and fee setup, then use the payment desk for posted receipts."
          className="border-sky-100 bg-sky-50/70"
          actions={<StatusBadge label="Start testing" tone="accent" />}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Button asChild variant="outline">
              <Link href="/protected/students/new">Add student</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/students">Bulk add students</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/fee-setup">Open Fee Setup</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/imports/template">Download template</Link>
            </Button>
          </div>
        </SectionCard>
      ) : !data.emptyState.hasFinancialData ? (
        <SectionCard
          title="Students found, dues missing"
          description="Students exist in the active fee setup session, but dues have not been generated yet."
          className="border-amber-100 bg-amber-50/70"
          actions={<StatusBadge label="Needs attention" tone="warning" />}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Button asChild variant="outline">
              <Link href="/protected/advanced#fee-data-troubleshooting">Prepare missing dues</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/students">Open Students</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/payments">Open Payment Desk</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/fee-setup">Open Fee Setup</Link>
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {data.systemSyncHealth ? (
        <FeeDataAttentionBanner
          health={data.systemSyncHealth}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Today's Collection"
          value={formatInr(data.kpis.todaysCollection)}
          hint="Collected at the Payment Desk today."
        />
        <MetricCard
          title="Pending Dues"
          value={formatInr(data.kpis.totalPending)}
          hint={`${data.studentsWithPending} student${data.studentsWithPending === 1 ? "" : "s"} need follow-up.`}
        />
        <MetricCard
          title="Active Students"
          value={data.kpis.totalStudents}
          hint="Students in this academic year."
        />
        <MetricCard
          title="Receipts Today"
          value={data.kpis.receiptsToday}
          hint="Receipts saved today."
        />
        <MetricCard
          title="Follow-up"
          value={data.followUpQueue.length}
          hint="Students needing fee follow-up."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <SectionCard
          title="Class-wise pending"
          description="Highest pending classes appear first."
          actions={<ClipboardList className="size-5 text-amber-600" />}
        >
          <ClassPendingChart rows={maxChartCards} />
        </SectionCard>
        <SectionCard
          title="Recent receipts"
          description="Latest receipts saved by the office."
        >
          <RecentReceipts rows={data.recentPayments} />
        </SectionCard>
      </div>

      <SectionCard
        title="Follow-up queue"
        description="Students with overdue or high pending balances."
      >
        <FollowUpQueue rows={data.followUpQueue} canPostPayments={canPostPayments} />
      </SectionCard>

      <details className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          More dashboard details
        </summary>
        <div className="grid gap-6 border-t border-slate-200 p-4 xl:grid-cols-2">
          <ProgressCard
            collected={data.kpis.totalCollected}
            expected={data.kpis.totalExpectedFees}
            pending={data.kpis.totalPending}
            rate={data.kpis.collectionRate}
          />
          <TodayCard
            amount={data.kpis.todaysCollection}
            receiptCount={data.kpis.receiptsToday}
            modes={data.todayPaymentModeBreakdown}
          />
          <SectionCard
            title="Collection trend"
            description="Recent receipt totals by payment date."
            actions={<BarChart3 className="size-5 text-sky-600" />}
          >
            <TrendChart rows={data.collectionTrend} />
          </SectionCard>
          <SectionCard
            title="Collected vs pending"
            description="Simple split of the current fee position."
            actions={<IndianRupee className="size-5 text-emerald-600" />}
          >
            <BreakdownCard
              collected={data.kpis.totalCollected}
              pending={data.kpis.totalPending}
            />
          </SectionCard>
          <SectionCard
            title="Installment status"
            description="Expected, collected, and pending totals by installment."
            actions={<CalendarClock className="size-5 text-blue-600" />}
          >
            <InstallmentStatus rows={data.installmentSummary} />
          </SectionCard>
          <SectionCard
            title="Class-wise fee position"
            description="Sorted by highest pending amount."
          >
            <ClassSummaryTable rows={data.classSummary} />
          </SectionCard>
        <SectionCard
          title="Attention needed"
          description="Setup, import, and dues-update items that may need review."
        >
          <AlertsPanel alerts={data.alerts} />
        </SectionCard>
          <SectionCard
            title="Next best actions"
            description="Shortcuts only. Dashboard does not post payments or edit fee setup."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {nextActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 transition hover:border-sky-200 hover:bg-sky-50"
                  >
                    <Icon className="mb-3 size-5 text-sky-700 transition group-hover:text-sky-800" />
                    {action.label}
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </details>
    </div>
  );
}
