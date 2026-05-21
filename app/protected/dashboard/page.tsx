import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { after } from "next/server";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
import { ClassInstallmentMatrixTable } from "@/components/dashboard/class-installment-matrix";
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

/**
 * MobileDashboardHero replaces the horizontal KPI rail on phones with a single
 * first-screen summary: today, collection rate, and the three office stats.
 */
function MobileDashboardHero({
  collected,
  pending,
  collectionRate,
  receiptsToday,
  followUpCount,
  overdueAmount,
  updatedAt,
  currentInstallmentLabel,
}: {
  collected: number;
  pending: number;
  collectionRate: number;
  receiptsToday: number;
  followUpCount: number;
  overdueAmount: number;
  updatedAt: string;
  currentInstallmentLabel?: string;
}) {
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div
      className="sm:hidden -mx-4 bg-card border-b border-border"
      aria-label={`Dashboard summary. Updated at ${formatUpdatedAt(updatedAt)}`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Today - {todayLabel}
        </p>
        {currentInstallmentLabel ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-semibold text-accent-soft-foreground">
            {currentInstallmentLabel}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-4 px-4 pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Today&apos;s collection
          </p>
          <div className="mt-1.5">
            <Money
              value={collected}
              size="display"
              className="text-[2.25rem] leading-none font-bold tracking-tight text-accent"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {receiptsToday} receipt{receiptsToday === 1 ? "" : "s"} posted today
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <RateGauge value={collectionRate} size="md" />
          <p className="text-[10px] font-medium text-muted-foreground">
            Collection rate
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-border">
        {[
          {
            label: "Pending",
            value: pending,
            tone: "warning" as const,
            subtext: `${followUpCount} students`,
          },
          {
            label: "Overdue",
            value: overdueAmount,
            tone: "danger" as const,
            subtext: "past due date",
          },
          {
            label: "Receipts",
            value: receiptsToday,
            tone: "neutral" as const,
            subtext: "posted today",
            isCount: true,
          },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "flex flex-col items-center justify-center px-2 py-3 text-center",
              index < 2 && "border-r border-border",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <div className="mt-1">
              {stat.isCount ? (
                <span className="text-lg font-bold tabular text-foreground">
                  {stat.value}
                </span>
              ) : (
                <Money
                  value={stat.value}
                  size="lg"
                  tone={stat.tone}
                  className="text-base font-bold"
                />
              )}
            </div>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              {stat.subtext}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
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
    <div className="hidden sm:grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {/* Today - saffron accent border */}
      <KpiCard
        accent="accent"
        label="Today collection"
        className="snap-start shrink-0 w-[72vw] sm:w-auto"
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
        className="snap-start shrink-0 w-[72vw] sm:w-auto"
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
        className="snap-start shrink-0 w-[72vw] sm:w-auto"
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
      <div className="snap-start shrink-0 w-[72vw] sm:w-auto rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3">
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

/**
 * MobileQuickActions gives the phone layout one dominant collection action and
 * three compact secondary destinations.
 */
function MobileQuickActions({
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
    <div className="sm:hidden space-y-2.5">
      {canPostPayments ? (
        <Button
          asChild
          variant="accent"
          className="h-14 w-full justify-between rounded-2xl px-5 text-base font-semibold shadow-sm"
        >
          <Link href={withSession("/protected/payments")}>
            <span className="flex items-center gap-2.5">
              <BadgeIndianRupee className="size-5" aria-hidden="true" />
              Open Payment Desk
            </span>
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {canWriteStudents ? (
          <Button
            asChild
            variant="outline"
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
          >
            <Link href={withSession("/protected/students/new")}>
              <UsersRound className="size-[18px]" aria-hidden="true" />
              Add student
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            variant="outline"
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
          >
            <Link href={withSession("/protected/students")}>
              <UsersRound className="size-[18px]" aria-hidden="true" />
              Students
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
        >
          <Link href={withSession("/protected/defaulters")}>
            <ClipboardList className="size-[18px]" aria-hidden="true" />
            Defaulters
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium leading-tight"
        >
          <Link href={withSession("/protected/transactions")}>
            <ReceiptText className="size-[18px]" aria-hidden="true" />
            History
          </Link>
        </Button>
      </div>
    </div>
  );
}

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
    <div className="hidden sm:flex sm:flex-wrap sm:gap-2 sm:space-y-0">
      {canPostPayments && (
        <Button asChild variant="accent" size="lg"
          className="w-full justify-between px-5 h-14 text-base rounded-xl shadow-sm sm:w-auto sm:h-10 sm:text-sm sm:rounded-md"
          leadingIcon={<BadgeIndianRupee className="size-5" />}
        >
          <Link href={withSession("/protected/payments")}>
            Open Payment Desk
            <ArrowRight className="size-5 ml-2" />
          </Link>
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2 sm:contents">
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
        <Button asChild variant="ghost" className="min-h-11 justify-center col-span-2 sm:col-span-1" leadingIcon={<ClipboardList className="size-4" />}>
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
        <div className="rounded-xl bg-surface-2/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Collected today
          </p>
          <Money value={amount} size="display" className="mt-2" />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
          <p className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-3 text-sm text-muted-foreground">
            No payment-mode breakup yet for today.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {modes.map((mode) => {
              const modeLabel = mode.paymentMode.toLowerCase();

              return (
                <li
                  key={mode.paymentMode}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      modeLabel === "cash" && "bg-success",
                      modeLabel === "upi" && "bg-info",
                      modeLabel === "bank transfer" && "bg-accent",
                      modeLabel === "cheque" && "bg-warning",
                      !["cash", "upi", "bank transfer", "cheque"].includes(modeLabel) &&
                        "bg-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {mode.paymentMode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mode.receiptCount} receipt{mode.receiptCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Money value={mode.amount} size="lg" />
                </li>
              );
            })}
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
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {rows.map((row) => (
        <li
          key={row.studentId}
          className="px-4 py-4 transition-colors hover:bg-surface-2/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link href={withSession(`/protected/students/${row.studentId}`)} className="hover:underline">
                <p className="font-semibold text-foreground truncate">{row.studentName}</p>
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.classLabel}
                {row.admissionNo ? ` - SR ${row.admissionNo}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money value={row.outstandingAmount} size="lg" tone="warning" />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {row.nextDueDate ? `Due ${formatShortDate(row.nextDueDate)}` : row.statusLabel || "Pending"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {row.fatherPhone ? (
              <a
                href={`tel:${row.fatherPhone}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3 active:bg-surface-3"
                aria-label={`Call ${row.studentName}'s parent at ${row.fatherPhone}`}
              >
                <Phone className="size-3.5 text-success" aria-hidden="true" />
                {row.fatherPhone}
              </a>
            ) : null}
            <CopyReminderButton text={row.reminderText} />
            <Button
              asChild
              size="sm"
              variant={canPostPayments ? "accent" : "outline"}
              className="ml-auto rounded-full px-4 font-semibold"
            >
              <Link href={withSession(`/protected/payments?studentId=${row.studentId}&classId=${row.classId}`)}>
                {canPostPayments ? "Collect" : "View"}
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
    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
      {rows.map((row) => (
        <li key={row.receiptId}>
          <Link
            href={withSession(`/protected/receipts/${row.receiptId}`)}
            className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-surface-2/40 active:bg-surface-2/60"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{row.receiptNumber}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.studentName} - {row.classLabel}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatShortDate(row.paymentDate)} - {row.paymentMode}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Money value={row.amount} size="lg" />
              <ChevronRight
                className="mt-1 ml-auto size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
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
      <div className="md:hidden grid grid-cols-2 gap-2">
        {[...rows]
          .sort((a, b) => b.pendingAmount - a.pendingAmount)
          .slice(0, 4)
          .map((row) => (
            <div key={row.classLabel} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">{row.classLabel}</p>
              <Money value={row.pendingAmount} size="sm" className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">{row.collectionRate}% collected</p>
            </div>
          ))}
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

/**
 * MobileCollapse keeps secondary dashboard analysis behind one-tap disclosure on
 * phones, then renders the normal Section card from tablet width upward.
 */
function MobileCollapse({
  title,
  mobileTitle,
  description,
  children,
  defaultOpen = false,
  className,
}: {
  title: string;
  mobileTitle?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <>
      <details
        className="group sm:hidden rounded-xl border border-border bg-card overflow-hidden"
        open={defaultOpen}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-semibold text-foreground select-none">
          {mobileTitle ?? title}
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      </details>

      <Section
        title={title}
        description={description}
        className={cn("hidden sm:block", className)}
      >
        {children}
      </Section>
    </>
  );
}

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
    <div className="space-y-4 sm:space-y-7">
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
        <MobileCollapse
          title="Class-wise pending"
          description="Highest pending classes appear first."
        >
          <ClassPendingChart rows={maxChartCards} />
        </MobileCollapse>
        <MobileCollapse
          title="Collection trend"
          description="Daily collection over the recent window."
        >
          <TrendChart rows={data.collectionTrend} />
        </MobileCollapse>
        <MobileCollapse
          title="Installment status"
          description="Expected, collected, and pending totals by installment."
          defaultOpen
          className="xl:col-span-2"
        >
          <InstallmentStatus rows={data.installmentSummary} />
        </MobileCollapse>
      </div>

      <MobileCollapse
        title="Class-wise & Installment-wise Pending Matrix"
        mobileTitle="Class / Installment pending matrix"
        description="Detailed pending balance grid across classes and installments."
      >
        <ClassInstallmentMatrixTable matrix={data.classInstallmentMatrix} />
      </MobileCollapse>

      <MobileCollapse
        title="Class-wise fee position"
        description="Sorted by highest pending amount."
      >
        <ClassSummaryTable rows={data.classSummary} />
      </MobileCollapse>

      <MobileCollapse
        title="Attention"
        mobileTitle="Attention items"
        description="Informational setup and activity items."
      >
        <AlertsPanel
          alerts={visibleAlerts.filter(
            (a) => a.tone !== "danger" && a.tone !== "warning",
          )}
        />
      </MobileCollapse>
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
    <div className="space-y-4 sm:space-y-7">
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

      <p className="hidden sm:block text-xs text-muted-foreground -mt-5">
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

      <div className="space-y-4 anim-fade-in">
        <MobileDashboardHero
          collected={aboveFold.kpis.todaysCollection}
          pending={aboveFold.kpis.totalPending}
          collectionRate={aboveFold.kpis.collectionRate}
          receiptsToday={aboveFold.kpis.receiptsToday}
          followUpCount={aboveFold.studentsWithPending}
          overdueAmount={aboveFold.kpis.overdueAmount}
          updatedAt={aboveFold.generatedAt}
          currentInstallmentLabel={aboveFold.currentInstallment?.label}
        />

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

        <MobileQuickActions
          canWriteStudents={canWriteStudents}
          canPostPayments={canPostPayments}
          sessionLabel={viewSession.sessionLabel}
        />

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
