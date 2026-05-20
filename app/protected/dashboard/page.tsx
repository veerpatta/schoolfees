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
import { LoadingBlock } from "@/components/ui/loading-skeleton";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { RateGauge } from "@/components/ui/rate-gauge";
import { Section } from "@/components/ui/section";
import {
  getDashboardAboveFoldData,
  getDashboardPageData,
  type DashboardAlert,
} from "@/lib/dashboard/data";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import {
  hasStaffPermission,
  requireStaffPermission,
} from "@/lib/supabase/session";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-revalidation";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { cn } from "@/lib/utils";

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
   Hero strip - three KPIs that summarise "what should I look at today?"
   --------------------------------------------------------------------------- */

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function InstallmentPulse({
  installment,
  pending,
  followUpCount,
}: {
  installment: Awaited<ReturnType<typeof getDashboardAboveFoldData>>["currentInstallment"];
  pending: number;
  followUpCount: number;
}) {
  if (!installment) {
    return null;
  }

  const tone = installment.status === "overdue" ? "warning" : "info";

  return (
    <Notice tone={tone} iconless title={`${installment.label} due ${formatShortDate(installment.dueDate)}`}>
      <Money value={pending} size="sm" /> pending across {followUpCount} student{followUpCount === 1 ? "" : "s"} in this session.
    </Notice>
  );
}

function CriticalAlerts({
  syncError,
  appRole,
}: {
  syncError: boolean;
  appRole: string;
}) {
  if (!syncError) {
    return null;
  }

  return (
    <Notice tone="warning" title="Data sync issue">
      Some fee data could not be loaded. Numbers may be incomplete.
      {appRole === "admin" ? (
        <> <Link href="/protected/admin-tools#fee-data-troubleshooting" className="underline">Check Admin Tools</Link> for details.</>
      ) : null}
    </Notice>
  );
}

function getCollectionRateSignal(rate: number): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (rate >= 75) return { label: "On track", tone: "success" };
  if (rate >= 50) return { label: "Behind pace", tone: "warning" };
  return { label: "Needs attention", tone: "danger" };
}

function getCollectionRateHealth(rate: number) {
  return getCollectionRateSignal(rate);
}

function HeroKpis({
  collected,
  pending,
  collectionRate,
  receiptsToday,
  followUpCount,
  overdueAmount,
}: {
  collected: number;
  pending: number;
  collectionRate: number;
  receiptsToday: number;
  followUpCount: number;
  overdueAmount: number;
}) {
  const rateSignal = getCollectionRateHealth(collectionRate);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {/* Today - saffron accent border */}
      <KpiCard
        accent="accent"
        label="Today collection"
        value={
          <CountUp
            value={collected}
            className="text-xl font-semibold tracking-tight text-accent md:text-2xl md:text-[28px] md:leading-[34px]"
          />
        }
        hint={`${receiptsToday} receipt${receiptsToday === 1 ? "" : "s"} posted today`}
      />

      {/* Pending dues */}
      <KpiCard
        accent="warning"
        label="Pending dues"
        value={
          <CountUp
            value={pending}
            className="text-xl font-semibold tracking-tight md:text-2xl md:text-[28px] md:leading-[34px]"
          />
        }
        hint={`${followUpCount} student${followUpCount === 1 ? "" : "s"} need follow-up`}
      />

      {/* Collection rate - arc gauge */}
      <KpiCard
        accent="info"
        label="Collection rate"
        value={<RateGauge value={collectionRate} size="md" />}
        hint={
          <span
            className={cn(
              "text-xs font-medium",
              rateSignal.tone === "success" && "text-success",
              rateSignal.tone === "warning" && "text-warning",
              rateSignal.tone === "danger" && "text-destructive",
            )}
          >
            {rateSignal.label}
          </span>
        }
      />

      {/* Overdue amount - destructive-soft tinted card */}
      <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-destructive/70">
          Overdue amount
        </p>
        <div className="mt-1">
          <CountUp
            value={overdueAmount}
            className="text-xl font-semibold tracking-tight text-destructive md:text-2xl md:text-[28px] md:leading-[34px]"
          />
        </div>
        <p className="mt-1 text-xs text-destructive/60">
          Past installment due date
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Quick actions - single row of clear, labeled buttons (no icon-only confusion)
   --------------------------------------------------------------------------- */

function QuickActions({
  canWriteStudents,
  canPostPayments,
  sessionLabel,
}: {
  canWriteStudents: boolean;
  canPostPayments: boolean;
  sessionLabel?: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <div className="space-y-2 sm:flex sm:flex-wrap sm:gap-2 sm:space-y-0">
      {canPostPayments ? (
        <Button asChild variant="accent" className="w-full justify-center sm:w-auto" leadingIcon={<BadgeIndianRupee className="size-4" />}>
          <Link href={withSession("/protected/payments")}>Open Payment Desk</Link>
        </Button>
      ) : null}
      <div className="grid grid-cols-3 gap-2 sm:contents">
        {canWriteStudents ? (
          <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<UsersRound className="size-4" />}>
            <Link href={withSession("/protected/students/new")}>Add student</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<UsersRound className="size-4" />}>
            <Link href={withSession("/protected/students")}>Students</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<ReceiptText className="size-4" />}>
          <Link href={withSession("/protected/transactions")}>Transactions</Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11 justify-center" leadingIcon={<ClipboardList className="size-4" />}>
          <Link href={withSession("/protected/defaulters")}>Defaulters</Link>
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Today panel - collection + payment-mode breakdown
   --------------------------------------------------------------------------- */

function TodayPanel({
  amount,
  receiptCount,
  monthAmount,
  refundDue,
  modes,
}: {
  amount: number;
  receiptCount: number;
  monthAmount: number;
  refundDue: number;
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              This month: <Money value={monthAmount} size="xs" />
            </span>
            {refundDue > 0 ? (
              <span className="inline-flex items-center gap-1">
                Credit/refund: <Money value={refundDue} size="xs" />
              </span>
            ) : null}
          </div>
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
  sessionLabel,
}: {
  rows: Array<{
    studentId: string;
    studentName: string;
    admissionNo: string;
    classId: string;
    classLabel: string;
    fatherPhone: string | null;
    outstandingAmount: number;
    nextDueDate: string | null;
    statusLabel: string;
    reminderText: string;
  }>;
  canPostPayments: boolean;
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

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
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{row.classLabel} - SR {row.admissionNo}</span>
              {row.fatherPhone ? (
                <a
                  href={`tel:${row.fatherPhone}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-label={`Call ${row.studentName}'s parent`}
                >
                  <Phone className="size-3" aria-hidden="true" />
                  {row.fatherPhone}
                </a>
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

          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
            <div className="flex gap-1.5 sm:contents">
              <Button asChild size="sm" variant="ghost">
                <Link href={withSession(`/protected/students/${row.studentId}`)}>Open</Link>
              </Button>
              <CopyReminderButton text={row.reminderText} />
            </div>
            <Button asChild size="sm" variant={canPostPayments ? "accent" : "outline"} className="w-full justify-center sm:w-auto">
              <Link href={withSession(`/protected/payments?studentId=${row.studentId}&classId=${row.classId}`)}>
                {canPostPayments ? "Collect" : "Desk"}
              </Link>
            </Button>
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
  sessionLabel,
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
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

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
            href={withSession(`/protected/receipts/${row.receiptId}`)}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{row.receiptNumber}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.studentName} - {row.classLabel}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatShortDate(row.paymentDate)} - {row.paymentMode}
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
   Class-wise pending - minimal hairline bar list
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
          className="space-y-1.5 sm:grid sm:items-center sm:gap-3 sm:space-y-0 sm:grid-cols-[8rem_minmax(0,1fr)_8rem]"
        >
          <div className="flex items-center justify-between gap-2 sm:contents">
            <p className="truncate text-sm font-medium text-foreground">
              {row.classLabel}
            </p>
            <div className="text-sm font-medium tabular text-foreground sm:order-last sm:text-right">
              {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0 ? (
                <span className="text-muted-foreground">Not prepared</span>
              ) : (
                <Money value={row.pendingAmount} size="sm" />
              )}
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-warning"
              style={{ width: getBarWidth(row.pendingAmount, maxPending) }}
            />
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
          className="space-y-1.5 sm:grid sm:items-center sm:gap-3 sm:space-y-0 sm:grid-cols-[7rem_minmax(0,1fr)_8rem]"
        >
          <div className="flex items-center justify-between gap-2 sm:contents">
            <p className="text-sm font-medium text-foreground">
              {formatShortDate(row.date)}
            </p>
            <div className="text-sm font-medium tabular text-foreground sm:order-last sm:text-right">
              <Money value={row.amount} size="sm" />
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: getBarWidth(row.amount, maxAmount) }}
            />
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
                Due {row.dueDate ? formatShortDate(row.dueDate) : "-"}
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
            <span className="inline-flex items-center gap-1">
              Expected <Money value={row.expectedAmount} size="xs" />
            </span>
            <span className="inline-flex items-center gap-1">
              Collected <Money value={row.collectedAmount} size="xs" />
            </span>
            <span className="inline-flex items-center gap-1">
              Pending <Money value={row.pendingAmount} size="xs" />
            </span>
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
  sessionLabel,
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
  sessionLabel: string;
}) {
  const renderTable = (tableRows: typeof rows, emptyLabel: string) => (
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
          {tableRows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            tableRows.map((row) => (
              <tr key={row.classLabel} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5 font-medium text-foreground">{row.classLabel}</td>
                <td className="px-4 py-2.5 tabular">{row.totalStudents}</td>
                <td className="px-4 py-2.5 tabular">
                  {row.studentsWithGeneratedDues === 0 && row.totalStudents > 0
                    ? <span className="text-muted-foreground">Not prepared</span>
                    : <Money value={row.expectedAmount} size="sm" />}
                </td>
                <td className="px-4 py-2.5 tabular">
                  <Money value={row.collectedAmount} size="sm" />
                </td>
                <td className="px-4 py-2.5 font-semibold tabular text-foreground">
                  <Money value={row.pendingAmount} size="sm" />
                </td>
                <td className="px-4 py-2.5 tabular text-warning">
                  <Money value={row.overdueAmount} size="sm" tone="warning" />
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
  const visibleRows = rows.slice(0, 6);
  const hiddenRows = rows.slice(6);

  return (
    <>
      <div className="md:hidden">
        <Notice
          tone="info"
          iconless
          title="Class summary is available in Exports"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={appendSessionParam("/protected/exports", sessionLabel)}>Open Exports</Link>
            </Button>
          }
        >
          The full class-wise table is hidden on phone screens to keep the dashboard readable.
        </Notice>
      </div>
      <div className="hidden space-y-3 md:block">
        {renderTable(visibleRows, "No class-wise fee position is available yet.")}
        {hiddenRows.length > 0 ? (
          <details className="rounded-md border border-border bg-card px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Show all classes
            </summary>
            <div className="mt-3">
              {renderTable(hiddenRows, "No additional classes.")}
            </div>
          </details>
        ) : null}
      </div>
    </>
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
}: {
  health: NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>;
}) {
  const needsAttention =
    health.sessionMismatch ||
    !health.paymentDeskReady ||
    !health.dashboardReady;

  if (!needsAttention) {
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
      The payment desk or dashboard data layer is not responding correctly.
      Open Admin Tools → Fee Data Troubleshooting for details.
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
    <div className="space-y-7">
      {/* Follow-up + Recent receipts row */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <LoadingBlock />
        <LoadingBlock />
      </div>
      {/* Charts row */}
      <div className="grid gap-5 xl:grid-cols-2">
        <LoadingBlock />
        <LoadingBlock />
        <div className="xl:col-span-2">
          <LoadingBlock />
        </div>
      </div>
      {/* Class summary full width */}
      <LoadingBlock />
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
  const autoPrepareCount =
    canAutoPrepareDues && data.systemSyncHealth
      ? data.systemSyncHealth.studentsMissingInstallments.length
      : 0;
  const visibleAlerts = data.alerts.filter((alert) => {
    if (staffRole !== "admin") {
      if (alert.actionHref?.includes("/admin-tools")) return false;
      if (alert.key === "dues-missing") return false;
    }
    return true;
  });

  return (
    <>
      {autoPrepareCount > 0 ? (
        <Notice tone="info" title="Dues update started">
          Preparing dues for {autoPrepareCount} student{autoPrepareCount === 1 ? "" : "s"} in the background. Refresh in a moment to see the updated totals.
        </Notice>
      ) : null}

      {visibleAlerts
        .filter((a) => a.tone === "danger" || a.tone === "warning")
        .filter((a) =>
          staffRole === "admin" || !a.actionHref?.includes("/admin-tools"),
        )
        .map((a) => (
          <Notice
            key={a.key}
            tone={a.tone === "danger" ? "danger" : "warning"}
            title={a.title}
            action={
              a.actionHref && a.actionLabel ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={a.actionHref}>{a.actionLabel}</Link>
                </Button>
              ) : undefined
            }
          >
            {a.detail}
          </Notice>
        ))}

      {staffRole === "admin" && data.systemSyncHealth ? (
        <FeeDataAttentionBanner health={data.systemSyncHealth} />
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
          <FollowUpQueue
            rows={data.followUpQueue}
            canPostPayments={canPostPayments}
            sessionLabel={sessionLabel}
          />
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
          <RecentReceipts rows={data.recentPayments} sessionLabel={sessionLabel} />
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
        <ClassSummaryTable rows={data.classSummary} sessionLabel={sessionLabel} />
      </Section>

      <Section
        title="Attention"
        description="Informational setup and activity items."
      >
        <AlertsPanel
          alerts={visibleAlerts.filter(
            (a) => a.tone !== "danger" && a.tone !== "warning",
          )}
        />
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
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Today's collection, pending dues, and follow-up - at a glance."
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge label={`Session ${aboveFold.currentSession}`} tone="accent" />
            {aboveFold.currentInstallment ? (
              <StatusBadge
                label={`${aboveFold.currentInstallment.label} - ${formatShortDate(aboveFold.currentInstallment.dueDate)}`}
                tone={aboveFold.currentInstallment.status === "overdue" ? "warning" : "neutral"}
              />
            ) : null}
          </div>
        }
      />

      <p className="text-xs text-muted-foreground -mt-5">
        Updated at {formatUpdatedAt(aboveFold.generatedAt)}
      </p>

      {resolvedSearchParams?.notice ? (
        <Notice tone="success" iconless={false}>
          {resolvedSearchParams.notice}
        </Notice>
      ) : null}

      {/* Auto-prepare result: set by prepareDuesForStudentsAutomatically via ?prepared=N
          in the redirect URL. No direct code change needed - the after() flow handles this. */}
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
                href={withSession(action.href)}
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
      ) : null}

      {/* Hero strip */}
      <div className="space-y-4 anim-fade-in">
        <HeroKpis
          collected={aboveFold.kpis.todaysCollection}
          pending={aboveFold.kpis.totalPending}
          collectionRate={aboveFold.kpis.collectionRate}
          receiptsToday={aboveFold.kpis.receiptsToday}
          followUpCount={aboveFold.studentsWithPending}
          overdueAmount={aboveFold.kpis.overdueAmount}
        />
        <InstallmentPulse
          installment={aboveFold.currentInstallment}
          pending={aboveFold.kpis.totalPending}
          followUpCount={aboveFold.studentsWithPending}
        />
        <CriticalAlerts syncError={aboveFold.syncError} appRole={staff.appRole} />
        <div className="anim-fade-in [animation-delay:60ms]">
          <QuickActions
            canWriteStudents={canWriteStudents}
            canPostPayments={canPostPayments}
            sessionLabel={viewSession.sessionLabel}
          />
        </div>
      </div>

      {/* Today + secondary KPIs */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] anim-fade-in [animation-delay:120ms]">
        <TodayPanel
          amount={aboveFold.kpis.todaysCollection}
          receiptCount={aboveFold.kpis.receiptsToday}
          monthAmount={aboveFold.kpis.thisMonthCollection}
          refundDue={aboveFold.totalRefundDue}
          modes={aboveFold.todayPaymentModeBreakdown}
        />
        <div className="hidden lg:grid grid-cols-2 content-start gap-3">
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
            hint={
              aboveFold.totalRefundDue > 0
                ? (
                  <span className="inline-flex items-center gap-1">
                    <Money value={aboveFold.totalRefundDue} size="xs" /> refund/credit due
                  </span>
                )
                : undefined
            }
          />
          <KpiCard
            label="This month"
            value={<Money value={aboveFold.kpis.thisMonthCollection} size="xl" />}
            hint="Receipts posted in the current month."
          />
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
