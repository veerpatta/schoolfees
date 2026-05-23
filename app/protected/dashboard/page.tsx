import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ReceiptText,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { ClassCollectionProgress } from "@/components/dashboard/class-collection-progress";
import { CollectionHeatmap } from "@/components/dashboard/collection-heatmap";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
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
  type DashboardCurrentInstallment,
} from "@/lib/dashboard/data";
import type {
  DashboardClassSummaryRow,
  DashboardInstallmentSummaryRow,
  DashboardKpis,
  DashboardPaymentModeBreakdown,
  DashboardTrendPoint,
} from "@/lib/dashboard/summary";
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
            subtext: "without late fee",
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
        hint={`Full session due across ${followUpCount} student${followUpCount === 1 ? "" : "s"}`}
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
          Overdue without late fee
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
   Analytics widgets
   --------------------------------------------------------------------------- */

function CollectionFunnelBar({
  expected,
  collected,
  pending,
  overdue,
}: {
  expected: number;
  collected: number;
  pending: number;
  overdue: number;
}) {
  if (expected === 0) return null;

  const collectedPct = Math.min(100, Math.round((collected / expected) * 100));
  const overdueWithinPending = Math.min(overdue, pending);
  const normalPending = Math.max(0, pending - overdueWithinPending);
  const pendingPct = Math.min(100, Math.round((normalPending / expected) * 100));
  const overduePct = Math.min(100, Math.round((overdueWithinPending / expected) * 100));
  const unaccountedPct = Math.max(0, 100 - collectedPct - pendingPct - overduePct);

  return (
    <Section
      title="Collection Funnel"
      description="Session due is the full pending amount; overdue excludes late fee."
      variant="card"
    >
      <div className="space-y-4">
        <div className="relative h-8 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${collectedPct}%` }}
            title={`Collected: ${collectedPct}%`}
          />
          <div
            className="absolute top-0 h-full bg-amber-400 transition-all duration-700"
            style={{ left: `${collectedPct}%`, width: `${pendingPct}%` }}
            title={`Pending: ${pendingPct}%`}
          />
          <div
            className="absolute top-0 h-full bg-red-500 transition-all duration-700"
            style={{ left: `${collectedPct + pendingPct}%`, width: `${overduePct}%` }}
            title={`Overdue: ${overduePct}%`}
          />
          {unaccountedPct > 0 ? (
            <div
              className="absolute top-0 h-full bg-muted-foreground/20"
              style={{
                left: `${collectedPct + pendingPct + overduePct}%`,
                width: `${unaccountedPct}%`,
              }}
            />
          ) : null}
          {collectedPct >= 12 ? (
            <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-white">
              {collectedPct}% collected
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground">Collected</span>
            </div>
            <Money value={collected} size="sm" tone="success" className="pl-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
              <span className="font-medium text-foreground">Due not overdue</span>
            </div>
            <Money value={normalPending} size="sm" tone="warning" className="pl-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span className="font-medium text-foreground">Overdue without late fee</span>
            </div>
            <Money value={overdue} size="sm" tone="danger" className="pl-4" />
          </div>
        </div>
      </div>
    </Section>
  );
}

function DailyMomentumCard({
  todaysCollection,
  receiptsToday,
  totalPending,
  installments,
  currentInstallment,
}: {
  todaysCollection: number;
  receiptsToday: number;
  totalPending: number;
  installments: DashboardInstallmentSummaryRow[];
  currentInstallment?: DashboardCurrentInstallment | null;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = installments
    .filter((installment) => {
      if (!installment.dueDate) return false;
      return new Date(installment.dueDate) >= today && installment.pendingAmount > 0;
    })
    .sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const nextInstallment = upcoming[0] ?? null;
  const targetLabel =
    nextInstallment?.installmentLabel ?? currentInstallment?.label ?? "next installment";
  const targetDueDate = nextInstallment?.dueDate ?? currentInstallment?.dueDate ?? null;
  const targetPending = nextInstallment?.pendingAmount ?? totalPending;
  let dailyTarget: number | null = null;
  let daysLeft: number | null = null;

  if (targetDueDate && targetPending > 0) {
    const due = new Date(targetDueDate);
    due.setHours(0, 0, 0, 0);
    daysLeft = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86_400_000));
    dailyTarget = Math.ceil(targetPending / daysLeft);
  }

  const onTrack = dailyTarget !== null && todaysCollection >= dailyTarget;

  return (
    <Section title="Today's Momentum" variant="card">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Collected Today
          </span>
          <Money
            value={todaysCollection}
            size="md"
            tone={todaysCollection > 0 ? "success" : "muted"}
          />
          <span className="text-xs text-muted-foreground">
            {receiptsToday} receipt{receiptsToday !== 1 ? "s" : ""}
          </span>
        </div>

        {dailyTarget !== null && daysLeft !== null && targetDueDate ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Daily Target
              </span>
              <Money value={dailyTarget} size="md" tone={onTrack ? "success" : "warning"} />
              <span className="text-xs text-muted-foreground">to clear {targetLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Days Left
              </span>
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  daysLeft <= 7
                    ? "text-red-600"
                    : daysLeft <= 14
                      ? "text-amber-600"
                      : "text-foreground",
                )}
              >
                {daysLeft}
              </span>
              <span className="text-xs text-muted-foreground">
                to{" "}
                {new Date(targetDueDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pace
              </span>
              <div
                className={cn(
                  "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold",
                  onTrack
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {onTrack ? "On Track" : "Behind"}
              </div>
              <span className="text-xs text-muted-foreground">{targetLabel} target</span>
            </div>
          </>
        ) : (
          <div className="col-span-1 flex items-center text-sm text-muted-foreground sm:col-span-3">
            All upcoming installments are on track. No pending dues detected.
          </div>
        )}
      </div>
    </Section>
  );
}

function PaymentModeDonut({
  modes,
  totalAmount,
}: {
  modes: DashboardPaymentModeBreakdown[];
  totalAmount: number;
}) {
  if (modes.length === 0 || totalAmount === 0) return null;

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const size = 96;
  const center = size / 2;
  const palette = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#64748b"];

  let offset = 0;
  const segments = modes.map((mode, index) => {
    const fraction = totalAmount > 0 ? mode.amount / totalAmount : 0;
    const dash = fraction * circumference;
    const segment = {
      ...mode,
      dash,
      offset,
      color: palette[index % palette.length],
    };
    offset += dash;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={10}
        />
        {segments.map((segment) => (
          <circle
            key={segment.paymentMode}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={10}
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            strokeDashoffset={-segment.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segments.map((segment) => (
          <div key={segment.paymentMode} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="truncate text-muted-foreground">{segment.paymentMode}</span>
            <span className="ml-auto shrink-0 font-medium tabular-nums">
              {Math.round((segment.amount / totalAmount) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayBreakdown({
  kpis,
  paymentModeBreakdown,
}: {
  kpis: DashboardKpis;
  paymentModeBreakdown: DashboardPaymentModeBreakdown[];
}) {
  const hasActivity = kpis.todaysCollection > 0 || kpis.receiptsToday > 0;

  return (
    <Section title="Today" variant="card">
      {!hasActivity ? (
        <p className="text-sm text-muted-foreground">No collections recorded yet today.</p>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total Collected
              </p>
              <Money value={kpis.todaysCollection} size="lg" tone="success" />
            </div>
            <div>
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipts Issued
              </p>
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {kpis.receiptsToday}
              </span>
            </div>
          </div>

          {paymentModeBreakdown.length > 0 ? (
            <>
              <div className="hidden h-full w-px bg-border sm:block" />
              <div className="flex-1">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  By Payment Mode
                </p>
                <PaymentModeDonut
                  modes={paymentModeBreakdown}
                  totalAmount={kpis.todaysCollection}
                />
              </div>
            </>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function SVGTrendBarChart({ trendData }: { trendData: DashboardTrendPoint[] }) {
  if (!trendData.length) return null;

  const chartHeight = 120;
  const chartWidth = 600;
  const barAreaTop = 10;
  const barAreaBottom = 80;
  const barAreaHeight = barAreaBottom - barAreaTop;
  const maxAmount = Math.max(...trendData.map((point) => point.amount), 1);
  const slotWidth = chartWidth / trendData.length;
  const barWidth = Math.max(4, slotWidth * 0.55);
  const todayStamp = new Date().toISOString().slice(0, 10);

  const formatLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).slice(0, 6);
  };

  const formatAmount = (value: number) =>
    value >= 100_000
      ? `Rs ${(value / 100_000).toFixed(1)}L`
      : value >= 1_000
        ? `Rs ${(value / 1_000).toFixed(0)}K`
        : `Rs ${value}`;

  return (
    <Section title="Collection Trend" description="Daily fee receipts" variant="card">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          style={{ minWidth: "260px", height: "auto" }}
          aria-hidden="true"
        >
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = barAreaBottom - fraction * barAreaHeight;
            return (
              <line
                key={fraction}
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={0.8}
                strokeDasharray="4 4"
              />
            );
          })}

          {trendData.map((point, index) => {
            const barHeight = Math.max(2, (point.amount / maxAmount) * barAreaHeight);
            const x = index * slotWidth + slotWidth / 2;
            const barX = x - barWidth / 2;
            const barY = barAreaBottom - barHeight;
            const isToday = point.date === todayStamp;

            return (
              <g key={point.date}>
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={isToday ? "hsl(var(--accent))" : "hsl(var(--primary) / 0.65)"}
                />
                {barHeight > 16 ? (
                  <text
                    x={x}
                    y={barY - 3}
                    textAnchor="middle"
                    fontSize={7}
                    fill="hsl(var(--muted-foreground))"
                  >
                    {formatAmount(point.amount)}
                  </text>
                ) : null}
                <text
                  x={x}
                  y={barAreaBottom + 10}
                  textAnchor="middle"
                  fontSize={7}
                  fill="hsl(var(--muted-foreground))"
                >
                  {formatLabel(point.date)}
                </text>
                {point.receiptCount > 0 ? (
                  <text
                    x={x}
                    y={barAreaBottom + 20}
                    textAnchor="middle"
                    fontSize={6}
                    fill="hsl(var(--muted-foreground) / 0.7)"
                  >
                    {point.receiptCount}r
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </Section>
  );
}

function InstallmentTrack({ installments }: { installments: DashboardInstallmentSummaryRow[] }) {
  if (!installments.length) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getStatus = (row: DashboardInstallmentSummaryRow) => {
    if (!row.dueDate) return "upcoming";
    const due = new Date(row.dueDate);
    due.setHours(0, 0, 0, 0);
    if (row.collectionRate >= 95) return "done";
    if (due < today) return "overdue";
    if (due <= new Date(today.getTime() + 30 * 86_400_000)) return "current";
    return "upcoming";
  };

  const statusConfig = {
    done: {
      ring: "border-emerald-500 bg-emerald-500",
      text: "text-emerald-700",
      label: "Cleared",
      dotColor: "#10b981",
    },
    overdue: {
      ring: "border-red-500 bg-red-50",
      text: "text-red-700",
      label: "Overdue",
      dotColor: "#ef4444",
    },
    current: {
      ring: "border-amber-500 bg-amber-50",
      text: "text-amber-700",
      label: "Due Soon",
      dotColor: "#f59e0b",
    },
    upcoming: {
      ring: "border-muted bg-muted/40",
      text: "text-muted-foreground",
      label: "Upcoming",
      dotColor: "#94a3b8",
    },
  } as const;

  return (
    <Section title="Installment Progress" description="Across all due dates" variant="card">
      <div className="hidden sm:block">
        <div className="relative">
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-border" />
          <div className="relative grid grid-cols-4 gap-2">
            {installments.map((installment) => {
              const status = getStatus(installment);
              const config = statusConfig[status];
              const percent = Math.round(installment.collectionRate);
              return (
                <div key={installment.installmentNo} className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold",
                      config.ring,
                    )}
                  >
                    {status === "done" ? (
                      <CheckCircle2 className="size-4 text-white" aria-hidden="true" />
                    ) : (
                      <span className={config.text}>{installment.installmentNo}</span>
                    )}
                  </div>

                  <div className="text-center">
                    <p className="text-xs font-semibold leading-tight text-foreground">
                      {installment.installmentLabel}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {installment.dueDate
                        ? new Date(installment.dueDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })
                        : "No due date"}
                    </p>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%`, backgroundColor: config.dotColor }}
                    />
                  </div>

                  <div className="text-center">
                    <span className={cn("text-sm font-bold tabular-nums", config.text)}>
                      {percent}%
                    </span>
                    <p className={cn("text-[10px] font-medium", config.text)}>{config.label}</p>
                  </div>

                  {installment.pendingAmount > 0 ? (
                    <Money value={installment.pendingAmount} size="xs" tone="warning" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {installments.map((installment) => {
          const status = getStatus(installment);
          const config = statusConfig[status];
          const percent = Math.round(installment.collectionRate);
          return (
            <div key={installment.installmentNo} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  config.ring,
                )}
              >
                {status === "done" ? (
                  <CheckCircle2 className="size-3.5 text-white" aria-hidden="true" />
                ) : (
                  <span className={config.text}>{installment.installmentNo}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {installment.installmentLabel}
                  </span>
                  <span className={cn("shrink-0 text-sm font-bold tabular-nums", config.text)}>
                    {percent}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: config.dotColor }}
                  />
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Due{" "}
                    {installment.dueDate
                      ? new Date(installment.dueDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                      : "-"}
                  </span>
                  {installment.pendingAmount > 0 ? (
                    <Money value={installment.pendingAmount} size="xs" tone="warning" />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ClassLeaderboard({ classSummary }: { classSummary: DashboardClassSummaryRow[] }) {
  if (!classSummary.length) return null;

  const sorted = [...classSummary].sort((a, b) => b.collectionRate - a.collectionRate);

  const getRateColor = (rate: number) =>
    rate >= 75 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";

  const getRateBg = (rate: number) =>
    rate >= 75
      ? "bg-emerald-50 text-emerald-700"
      : rate >= 50
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";

  return (
    <Section
      title="Class Leaderboard"
      description="Ranked by collection rate. Red needs attention."
      variant="card"
    >
      <div className="space-y-2.5">
        {sorted.map((row, index) => {
          const rate = Math.round(row.collectionRate);
          return (
            <div key={row.classId} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs font-bold text-muted-foreground">
                {index + 1}
              </span>
              <span className="w-20 shrink-0 truncate text-sm font-medium text-foreground">
                {row.classLabel}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${rate}%`,
                    backgroundColor: getRateColor(rate),
                  }}
                />
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums",
                  getRateBg(rate),
                )}
              >
                {rate}%
              </span>
              <div className="hidden w-24 shrink-0 text-right sm:block">
                {row.pendingAmount > 0 ? (
                  <Money value={row.pendingAmount} size="xs" tone="warning" />
                ) : (
                  <span className="text-xs font-medium text-emerald-600">Cleared</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span>{sorted.filter((row) => row.collectionRate >= 75).length} classes above 75%</span>
        <span>{sorted.filter((row) => row.collectionRate < 50).length} classes below 50%</span>
      </div>
    </Section>
  );
}

function StudentStatusRing({
  classSummary,
  totalStudents,
}: {
  classSummary: DashboardClassSummaryRow[];
  totalStudents: number;
}) {
  if (!classSummary.length || totalStudents === 0) return null;

  const studentsWithPending = classSummary.reduce((sum, row) => sum + row.studentsWithPending, 0);
  const studentsOverdue = classSummary.reduce((sum, row) => sum + row.overdueStudents, 0);
  const studentsFullyPaid = Math.max(0, totalStudents - studentsWithPending);
  const studentsNormal = Math.max(0, studentsWithPending - studentsOverdue);
  const missingDues = classSummary.reduce((sum, row) => sum + row.missingDuesStudents, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const size = 104;
  const center = size / 2;
  const segments = [
    { count: studentsFullyPaid, color: "#10b981", label: "Fully Paid" },
    { count: studentsNormal, color: "#f59e0b", label: "Pending" },
    { count: studentsOverdue, color: "#ef4444", label: "Overdue" },
  ].filter((segment) => segment.count > 0);

  let offset = 0;
  const rings = segments.map((segment) => {
    const fraction = segment.count / totalStudents;
    const dash = fraction * circumference;
    const ring = { ...segment, dash, offset };
    offset += dash;
    return ring;
  });

  return (
    <Section title="Student Status" description="Payment standing of all students" variant="card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={12}
            />
            {rings.map((segment) => (
              <circle
                key={segment.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={12}
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold tabular-nums text-foreground">{totalStudents}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              students
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-col sm:gap-2.5">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {segment.count}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({Math.round((segment.count / totalStudents) * 100)}%)
                  </span>
                </div>
                <p className="text-[11px] font-medium text-muted-foreground">{segment.label}</p>
              </div>
            </div>
          ))}
          {missingDues > 0 ? (
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
              <div>
                <span className="text-base font-bold tabular-nums text-foreground">
                  {missingDues}
                </span>
                <p className="text-[11px] font-medium text-muted-foreground">
                  No dues generated
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function QuickJumpLinks({
  kpis,
  classSummary,
  sessionLabel,
}: {
  kpis: DashboardKpis;
  classSummary: DashboardClassSummaryRow[];
  sessionLabel: string;
}) {
  const overdueStudents = classSummary.reduce((sum, row) => sum + row.overdueStudents, 0);
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const links = [
    {
      href: "/protected/defaulters",
      icon: <UsersRound className="h-5 w-5 text-red-500" />,
      label: "Defaulters",
      value: overdueStudents,
      unit: "students overdue",
      amount: kpis.overdueAmount,
      tone: "danger" as const,
      accent: "border-red-200 hover:border-red-400",
    },
    {
      href: "/protected/transactions",
      icon: <ReceiptText className="h-5 w-5 text-primary" />,
      label: "Transactions",
      value: kpis.receiptsToday,
      unit: "receipts today",
      amount: kpis.todaysCollection,
      tone: "success" as const,
      accent: "border-primary/20 hover:border-primary/50",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={withSession(link.href)}
          className={cn(
            "group flex items-center gap-4 rounded-xl border-2 bg-card p-4 transition-colors",
            link.accent,
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            {link.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{link.label}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold tabular-nums text-foreground">{link.value}</span>{" "}
              {link.unit}
            </p>
            <Money value={link.amount} size="xs" tone={link.tone} />
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Class summary table
   --------------------------------------------------------------------------- */

function ClassSummaryTable({
  classSummary,
}: {
  classSummary: DashboardClassSummaryRow[];
}) {
  const rows = classSummary;
  const renderTable = (tableRows: typeof rows, emptyLabel: string) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2/70">
          <tr className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Class</th>
            <th className="px-4 py-2.5 font-medium">Students</th>
            <th className="px-4 py-2.5 font-medium">Expected</th>
            <th className="px-4 py-2.5 font-medium">Collected</th>
            <th className="px-4 py-2.5 font-medium">Session due</th>
            <th className="px-4 py-2.5 font-medium">Overdue no late fee</th>
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
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <LoadingBlock />
        <LoadingBlock />
      </div>
      <LoadingBlock />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <LoadingBlock />
        <LoadingBlock />
      </div>
      <LoadingBlock />
    </div>
  );
}

async function DashboardBelowFold({
  staffRole,
  sessionLabel,
  canAutoPrepareDues,
  kpis,
}: {
  staffRole: Awaited<ReturnType<typeof requireStaffPermission>>["appRole"];
  sessionLabel: string;
  canAutoPrepareDues: boolean;
  kpis: DashboardKpis;
}) {
  const data = await getDashboardPageData({ staffRole, sessionLabel });
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
    <div className="space-y-4 md:space-y-6">
      {autoPrepareCount > 0 ? (
        <Notice tone="info" title="Dues update started">
          Preparing dues for {autoPrepareCount} student{autoPrepareCount === 1 ? "" : "s"} in the background. Refresh in a moment to see the updated totals.
        </Notice>
      ) : null}

      {staffRole === "admin" && data.systemSyncHealth ? (
        <FeeDataAttentionBanner health={data.systemSyncHealth} />
      ) : null}

      {visibleAlerts.length > 0 ? <AlertsPanel alerts={visibleAlerts} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <TodayBreakdown kpis={kpis} paymentModeBreakdown={data.todayPaymentModeBreakdown} />
        <StudentStatusRing classSummary={data.classSummary} totalStudents={kpis.totalStudents} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <Section
          title="Collection heatmap"
          description="Current month day-wise receipt activity."
          variant="card"
        >
          <CollectionHeatmap collections={data.collectionHeatmap} />
        </Section>
        <Section
          title="Class-wise collection progress"
          description="Most behind classes appear first."
          variant="card"
        >
          <ClassCollectionProgress rows={data.classSummary} />
        </Section>
      </div>

      <InstallmentTrack installments={data.installmentSummary} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <SVGTrendBarChart trendData={data.collectionTrend} />
        <ClassLeaderboard classSummary={data.classSummary} />
      </div>

      <Section
        title="Class-wise fee position"
        description="Sorted by highest pending amount."
      >
        <ClassSummaryTable classSummary={data.classSummary} />
      </Section>

      <QuickJumpLinks
        kpis={kpis}
        classSummary={data.classSummary}
        sessionLabel={sessionLabel}
      />
    </div>
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

        <CollectionFunnelBar
          expected={aboveFold.kpis.totalExpectedFees}
          collected={aboveFold.kpis.totalCollected}
          pending={aboveFold.kpis.totalPending}
          overdue={aboveFold.kpis.overdueAmount}
        />

        <DailyMomentumCard
          todaysCollection={aboveFold.kpis.todaysCollection}
          receiptsToday={aboveFold.kpis.receiptsToday}
          totalPending={aboveFold.kpis.totalPending}
          installments={[]}
          currentInstallment={aboveFold.currentInstallment}
        />
      </div>

      <Suspense fallback={<DashboardBelowFoldSkeleton />}>
        <DashboardBelowFold
          staffRole={staff.appRole}
          sessionLabel={viewSession.sessionLabel}
          canAutoPrepareDues={canAutoPrepareDues}
          kpis={aboveFold.kpis}
        />
      </Suspense>

    </div>
  );
}
