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
  Upload,
  UsersRound,
} from "lucide-react";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { CopyReminderButton } from "@/components/dashboard/copy-reminder-button";
import { Button } from "@/components/ui/button";
import type { StaffRole } from "@/lib/auth/roles";
import { getDashboardPageData, type DashboardAlert } from "@/lib/dashboard/data";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import {
  hasStaffPermission,
  requireStaffPermission,
} from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

import {
  repairCurrentSessionDuesAction,
  syncDashboardNowAction,
} from "./actions";

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
  staffRole,
  canWriteStudents,
}: {
  staffRole: StaffRole;
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
      {staffRole !== "accountant" ? (
        <Button asChild variant="outline">
          <Link href="/protected/imports">
            <Upload className="size-4" />
            Bulk Upload
          </Link>
        </Button>
      ) : null}
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
  rows: Array<{ classLabel: string; pendingAmount: number; collectionRate: number }>;
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
              {formatInr(row.pendingAmount)}
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
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[900px] text-left text-sm">
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
                <td className="px-4 py-3">{formatInr(row.expectedAmount)}</td>
                <td className="px-4 py-3">{formatInr(row.collectedAmount)}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{formatInr(row.pendingAmount)}</td>
                <td className="px-4 py-3 text-amber-800">{formatInr(row.overdueAmount)}</td>
                <td className="px-4 py-3">{formatPercent(row.collectionRate)}</td>
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

function SystemSyncHealthPanel({
  health,
  canRepair,
}: {
  health: NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>;
  canRepair: boolean;
}) {
  const rows = [
    ["Active session", health.activeSession],
    ["Students in active session", health.rawStudentsInActiveSession],
    ["Students with fee rows", health.studentsWithFinancialRows],
    ["Missing dues rows", health.studentsMissingInstallmentRows],
    ["No class fee setting", health.studentsWithNoFeeSetting],
    ["Wrong/inactive session", health.studentsInInactiveOrWrongSession],
    ["Classes without fee settings", health.classesWithoutFeeSettings],
    ["Routes without annual fees", health.routesWithoutAnnualFees],
  ] as const;

  const needsRepair =
    health.studentsMissingInstallmentRows > 0 ||
    health.studentsMissingFinancialRows > 0 ||
    health.studentsWithNoFeeSetting > 0 ||
    !health.paymentDeskReady ||
    !health.dashboardReady;

  return (
    <SectionCard
      id="system-sync-health"
      title="System Sync Health"
      description="Admin check for whether Student Master and Fee Setup are feeding Dashboard, Payment Desk, Transactions, and reports."
      actions={
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={needsRepair ? "Needs attention" : "Ready"}
            tone={needsRepair ? "warning" : "good"}
          />
          {canRepair ? (
            <>
              <form action={syncDashboardNowAction}>
                <Button type="submit" size="sm" variant="outline">
                  Sync Dashboard Now
                </Button>
              </form>
              <form action={repairCurrentSessionDuesAction}>
                <Button type="submit" size="sm">
                  Generate Missing Dues
                </Button>
              </form>
              <form action={repairCurrentSessionDuesAction}>
                <Button type="submit" size="sm" variant="outline">
                  Sync Current Session
                </Button>
              </form>
              <form action={repairCurrentSessionDuesAction}>
                <Button type="submit" size="sm" variant="outline">
                  Repair Payment Desk Data
                </Button>
              </form>
              <Button asChild size="sm" variant="outline">
                <Link href="/protected/students">
                  Open Students Missing Dues
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      {health.rawStudentsInActiveSession > 0 && health.studentsMissingInstallmentRows > 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {health.rawStudentsInActiveSession} students found, but dues are not generated for {health.studentsMissingInstallmentRows} student{health.studentsMissingInstallmentRows === 1 ? "" : "s"}.
        </p>
      ) : null}
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
  const canRepairFinance = hasStaffPermission(staff, "fees:write");
  const canViewImports = hasStaffPermission(staff, "imports:view");
  const canViewReports = hasStaffPermission(staff, "reports:view");
  const maxChartCards = data.classSummary.slice(0, 8);
  const nextActions = [
    canWriteStudents
      ? { href: "/protected/students/new", label: "Add student", icon: UsersRound }
      : { href: "/protected/students", label: "Open students", icon: UsersRound },
    canViewImports
      ? { href: "/protected/imports", label: "Upload spreadsheet", icon: Upload }
      : null,
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
        description="Fee collection overview for the current academic session"
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
            <ActionButtons staffRole={staff.appRole} canWriteStudents={canWriteStudents} />
          </div>
        }
      />

      {resolvedSearchParams?.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {resolvedSearchParams.notice}
        </div>
      ) : null}

      {!data.emptyState.hasFinancialData ? (
        <SectionCard
          title="No fee data yet"
          description="Start with test students and fee setup, then use the payment desk for posted receipts."
          className="border-sky-100 bg-sky-50/70"
          actions={<StatusBadge label="Start testing" tone="accent" />}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Button asChild variant="outline">
              <Link href="/protected/students/new">Add student</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/imports">Bulk upload students</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/fee-setup">Open Fee Setup</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/imports/template">Download template</Link>
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {data.systemSyncHealth ? (
        <SystemSyncHealthPanel
          health={data.systemSyncHealth}
          canRepair={canRepairFinance}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Students"
          value={data.kpis.totalStudents}
          hint="Students included in the current fee position."
        />
        <MetricCard
          title="Total Expected Fees"
          value={formatInr(data.kpis.totalExpectedFees)}
          hint="Current session expected fee total."
        />
        <MetricCard
          title="Total Collected"
          value={formatInr(data.kpis.totalCollected)}
          hint={`${formatPercent(data.kpis.collectionRate)} of expected fees collected.`}
        />
        <MetricCard
          title="Total Pending"
          value={formatInr(data.kpis.totalPending)}
          hint={`${data.studentsWithPending} student${data.studentsWithPending === 1 ? "" : "s"} still have dues.`}
        />
        <MetricCard
          title="Overdue Amount"
          value={formatInr(data.kpis.overdueAmount)}
          hint={`${data.overdueInstallmentCount} overdue installment${data.overdueInstallmentCount === 1 ? "" : "s"}.`}
        />
        <MetricCard
          title="Today's Collection"
          value={formatInr(data.kpis.todaysCollection)}
          hint="Posted through receipt records today."
        />
        <MetricCard
          title="Receipts Today"
          value={data.kpis.receiptsToday}
          hint="Receipts posted for the current school day."
        />
        <MetricCard
          title="Collection Rate"
          value={formatPercent(data.kpis.collectionRate)}
          hint="Collected amount divided by expected amount."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
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
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Collection trend"
          description="Recent receipt totals by payment date."
          actions={<BarChart3 className="size-5 text-sky-600" />}
        >
          <TrendChart rows={data.collectionTrend} />
        </SectionCard>
        <SectionCard
          title="Class-wise pending"
          description="Highest pending classes appear first."
          actions={<ClipboardList className="size-5 text-amber-600" />}
        >
          <ClassPendingChart rows={maxChartCards} />
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
      </div>

      <SectionCard
        title="Class-wise fee position"
        description="Sorted by highest pending amount so the office can decide where to follow up first."
      >
        <ClassSummaryTable rows={data.classSummary} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <SectionCard
          title="Follow-up queue"
          description="Overdue students and highest pending balances for office follow-up."
        >
          <FollowUpQueue rows={data.followUpQueue} canPostPayments={canPostPayments} />
        </SectionCard>
        <SectionCard
          title="Latest receipts"
          description="Recent posted receipts for quick verification and printing."
        >
          <RecentReceipts rows={data.recentPayments} />
        </SectionCard>
      </div>

      <SectionCard
        title="Attention needed"
        description="Setup, import, and dues-update items that may need office or admin review."
      >
        <AlertsPanel alerts={data.alerts} />
      </SectionCard>

      <SectionCard
        title="Next best actions"
        description="Shortcuts only. Dashboard does not post payments or edit fee setup."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {nextActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50"
              >
                <Icon className="mb-3 size-5 text-sky-700 transition group-hover:text-sky-800" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
