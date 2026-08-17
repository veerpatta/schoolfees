import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
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
import { ActivityStrip } from "@/components/dashboard/activity-strip";
import {
  ClassesBoard,
  CollectionBoard,
  DiscountsBoard,
  LateFeeBoard,
  OverviewBoard,
  RecoveryBoard,
} from "@/components/dashboard/boards";
import { MoneyBand } from "@/components/dashboard/money-band";
import { ViewSwitcher } from "@/components/dashboard/view-switcher";
import {
  getDashboardAnalytics,
  resolveCollectionWindow,
  resolveDashboardView,
  type CollectionWindow,
  type DashboardView,
} from "@/lib/dashboard/analytics";
import { getRepaymentDashboardSummary } from "@/lib/repayment-plans/data";
import { EmiTrackingCard } from "@/components/dashboard/emi-tracking-card";
import { DashboardPrefetcher } from "@/components/dashboard/dashboard-prefetcher";
import { ClassCollectionProgress } from "@/components/dashboard/class-collection-progress";
import { CollectionHeatmap } from "@/components/dashboard/collection-heatmap";
import { MobileDashboardBoards } from "@/components/dashboard/mobile-boards";
import { MobileDashboardScreen } from "@/components/dashboard/mobile-dashboard-screen";
import { MorningBrief } from "@/components/dashboard/morning-brief";
import { RouteCollectionHeatmap } from "@/components/dashboard/route-collection-heatmap";
import { OptimisticBanner } from "@/components/dashboard/optimistic-banner";
import { MissingDuesBanner } from "@/components/shared/missing-dues-banner";
import { TrustBadge } from "@/components/trust/trust-badge";
import { composeMorningBrief } from "@/lib/dashboard/morning-brief";
import { DownloadAnchor } from "@/components/ui/download-anchor";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/loading-skeleton";
import { Money } from "@/components/ui/money";
import { MoneyGlossaryLink } from "@/components/ui/money-glossary";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/section";
import {
  getDashboardAboveFoldData,
  getDashboardPageData,
  scheduleDashboardAutoPrepare,
  type DashboardAlert,
  type DashboardCurrentInstallment,
} from "@/lib/dashboard/data";
import { getTodayActivityCounts } from "@/lib/activity/events";
import { computeTodayCollectionDelta } from "@/lib/dashboard/kpi-delta";
import type {
  DashboardClassSummaryRow,
  DashboardInstallmentSummaryRow,
  DashboardKpis,
  DashboardPaymentModeBreakdown,
  DashboardTrendPoint,
} from "@/lib/dashboard/summary";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate, formatTimeIst } from "@/lib/helpers/date";
import { staffDisplayName, staffInitials } from "@/lib/helpers/staff-name";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { ServerTimer } from "@/lib/observability/timing";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { resolveViewSession } from "@/lib/session/resolver";
import {
  hasStaffPermission,
  requireStaffPermission,
} from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<"Dashboard">>>;

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
    return formatTimeIst(iso, "");
  } catch {
    return "";
  }
}


function CriticalAlerts({
  syncError,
  appRole,
  sessionLabel,
  t,
}: {
  syncError: boolean;
  appRole: string;
  sessionLabel?: string;
  t: DashboardTranslator;
}) {
  if (!syncError) {
    return null;
  }

  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <Notice tone="warning" title={t("criticalAlertTitle")}>
      {t("criticalAlertBody")}
      {appRole === "admin" ? (
        <>
          {" "}
          <Link href={withSession("/protected/admin-tools#fee-data-troubleshooting")} className="underline">
            {t("criticalAlertAdminTools")}
          </Link>
          {t("criticalAlertAdminToolsSuffix")}
        </>
      ) : null}
    </Notice>
  );
}









/* ---------------------------------------------------------------------------
   Quick actions - single row of clear, labeled buttons (no icon-only confusion)
   --------------------------------------------------------------------------- */


function QuickActions({
  canWriteStudents,
  canPostPayments,
  sessionLabel,
  t,
}: {
  canWriteStudents: boolean;
  canPostPayments: boolean;
  sessionLabel?: string;
  t: DashboardTranslator;
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
            {t("openPaymentDesk")}
            <ArrowRight className="size-5 ml-2" />
          </Link>
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        {canWriteStudents ? (
          <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<UsersRound className="size-4" />}>
            <Link href={withSession("/protected/students/new")}>{t("addStudent")}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<UsersRound className="size-4" />}>
            <Link href={withSession("/protected/students")}>{t("students")}</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-11 justify-center" leadingIcon={<ReceiptText className="size-4" />}>
          <Link href={withSession("/protected/transactions")}>{t("transactions")}</Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11 justify-center col-span-2 sm:col-span-1" leadingIcon={<ClipboardList className="size-4" />}>
          <Link href={withSession("/protected/defaulters")}>{t("defaulters")}</Link>
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Analytics widgets. CollectionFunnelBar is mounted from the desktop hero so
   the year-to-date collection progress is the second thing the office sees
   after the KPI cards. DailyMomentumCard below stays parked for now.
   --------------------------------------------------------------------------- */


// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const palette = [
    "hsl(var(--accent))",
    "hsl(var(--info))",
    "hsl(var(--primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--muted-foreground))",
  ];

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
            {/* Cash specifically — it's the figure that has to match the
                drawer at day close. Derived from the mode breakdown rather
                than inventing a separate day-close number. */}
            {(() => {
              const cash = paymentModeBreakdown.find(
                (mode) => mode.paymentMode?.toLowerCase() === "cash",
              );
              if (!cash || cash.amount <= 0) return null;
              return (
                <div>
                  <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cash collected today
                  </p>
                  <Money value={cash.amount} size="md" />
                  <p className="text-[11px] text-muted-foreground">
                    counts toward the automatic day close
                  </p>
                </div>
              );
            })()}
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

function SVGTrendBarChart({
  trendData,
  sessionLabel,
}: {
  trendData: DashboardTrendPoint[];
  sessionLabel: string;
}) {
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
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <Section
      title="Collection Trend"
      description="Daily fee receipts — tap a bar to open that day's receipts"
      variant="card"
    >
      <div
        className="w-full overflow-x-auto"
        tabIndex={0}
        aria-label="Scrollable daily collection trend"
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          style={{ minWidth: "260px", height: "auto" }}
          role="group"
          aria-label="Daily collection trend"
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
              <a
                key={point.date}
                href={withSession(
                  `/protected/transactions?fromDate=${point.date}&toDate=${point.date}`,
                )}
                aria-label={`${formatLabel(point.date)} · ${formatInr(point.amount)} · ${point.receiptCount} receipts`}
                className="cursor-pointer [&:hover>rect]:opacity-80"
              >
                {/* One template string, not three children. React cannot
                    flatten an array into a <title>, and warned on every
                    dashboard render that carried a trend chart. */}
                <title>{`${formatLabel(point.date)} · ${formatInr(point.amount)}`}</title>
                {/* Full-slot hit area so the whole column is clickable, not
                    just a 4px bar on a quiet day. */}
                <rect
                  x={index * slotWidth}
                  y={barAreaTop}
                  width={slotWidth}
                  height={barAreaBottom - barAreaTop}
                  fill="transparent"
                />
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
              </a>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 grid gap-2 md:hidden">
        {trendData.map((point) => (
          <Link
            key={`mobile-trend-${point.date}`}
            href={withSession(`/protected/transactions?fromDate=${point.date}&toDate=${point.date}`)}
            className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground">{formatLabel(point.date)}</span>
            <span className="text-right">
              <span className="block font-semibold text-foreground">{formatInr(point.amount)}</span>
              <span className="block text-[10px] text-muted-foreground">
                {point.receiptCount} receipt{point.receiptCount === 1 ? "" : "s"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

/**
 * The families worth a call today, straight from the dashboard — already
 * ranked overdue-first then by amount by `followUpQueue`. Saves a trip to
 * the Defaulters page just to see who is at the top.
 */
function TopDefaulters({
  rows,
  sessionLabel,
  t,
}: {
  rows: Awaited<ReturnType<typeof getDashboardAboveFoldData>>["followUpQueue"];
  sessionLabel?: string;
  t: DashboardTranslator;
}) {
  if (!rows.length) return null;
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <Section
      title={t("topDefaultersTitle")}
      description={t("topDefaultersDescription")}
      variant="card"
      actions={
        <Link
          href={withSession("/protected/defaulters")}
          className="text-xs font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("openWorklist")} →
        </Link>
      }
    >
      <ul className="divide-y divide-border/70">
        {rows.slice(0, 5).map((row) => (
          <li key={row.studentId}>
            <Link
              href={withSession(`/protected/students/${row.studentId}`)}
              className="flex min-h-12 items-center justify-between gap-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.studentName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {row.classLabel}
                  {row.statusLabel === "OVERDUE" ? ` · ${t("overdue")}` : ""}
                </span>
              </span>
              <Money
                value={row.outstandingAmount}
                size="sm"
                tone={row.statusLabel === "OVERDUE" ? "danger" : "warning"}
              />
            </Link>
          </li>
        ))}
      </ul>
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
      dotColor: "hsl(var(--success))",
    },
    overdue: {
      ring: "border-red-500 bg-red-50",
      text: "text-red-700",
      label: "Overdue",
      dotColor: "hsl(var(--destructive))",
    },
    current: {
      ring: "border-amber-500 bg-amber-50",
      text: "text-amber-700",
      label: "Due Soon",
      dotColor: "hsl(var(--warning))",
    },
    upcoming: {
      ring: "border-muted bg-muted/40",
      text: "text-muted-foreground",
      label: "Upcoming",
      dotColor: "hsl(var(--muted-foreground))",
    },
  } as const;

  const gridClass =
    installments.length <= 4
      ? "grid-cols-4"
      : installments.length === 5
        ? "grid-cols-5"
        : "grid-cols-6";

  return (
    <Section title="Installment Progress" description="Across all due dates" variant="card">
      <div className="hidden sm:block">
        <div className="relative">
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-border" />
          <div className={cn("relative grid gap-2", gridClass)}>
            {installments.map((installment) => {
              const status = getStatus(installment);
              const config = statusConfig[status];
              const percent = Math.round(installment.collectionRate);
              const isOldBalance = installment.isCarryForward === true;
              return (
                <div key={`${installment.installmentNo}-${installment.installmentLabel}`} className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold",
                      isOldBalance ? "border-amber-500 bg-amber-50 text-amber-700" : config.ring,
                    )}
                  >
                    {status === "done" ? (
                      <CheckCircle2 className="size-4 text-white" aria-hidden="true" />
                    ) : isOldBalance ? (
                      <span className="text-[10px] font-bold">Old</span>
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
          const isOldBalance = installment.isCarryForward === true;
          return (
            <div key={`${installment.installmentNo}-${installment.installmentLabel}`} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  isOldBalance ? "border-amber-500 bg-amber-50 text-[10px] text-amber-700" : config.ring,
                )}
              >
                {status === "done" ? (
                  <CheckCircle2 className="size-3.5 text-white" aria-hidden="true" />
                ) : isOldBalance ? (
                  "Old"
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
    rate >= 75 ? "hsl(var(--success))" : rate >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

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
    { count: studentsFullyPaid, color: "hsl(var(--success))", label: "Fully Paid" },
    { count: studentsNormal, color: "hsl(var(--warning))", label: "Pending" },
    { count: studentsOverdue, color: "hsl(var(--destructive))", label: "Overdue" },
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
              {/*
                "active students", not "students". This ring counts active
                students only (507 in live 2026-27), while the money figures
                above it deliberately also include students who have LEFT but
                paid something this year, so their payments are not orphaned
                from the fees they were paid against. Two populations, one
                screen — the count should say which one it is.
              */}
              active students
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
      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
            No class-wise fee position is available yet.
          </p>
        ) : (
          [...rows]
            .sort((a, b) => b.pendingAmount - a.pendingAmount)
            .map((row) => (
              <div key={row.classLabel} className="rounded-md border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold text-foreground">{row.classLabel}</p>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                    {formatPercent(row.collectionRate)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, row.collectionRate)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Pending <Money value={row.pendingAmount} size="xs" tone="warning" />
                  </span>
                  <span>{row.totalStudents} student{row.totalStudents === 1 ? "" : "s"}</span>
                </div>
                {row.missingDuesStudents > 0 ? (
                  <Badge variant="warning" dot className="mt-2">
                    {row.missingDuesStudents} dues missing
                  </Badge>
                ) : null}
              </div>
            ))
        )}
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

const DASHBOARD_ALERT_I18N: Record<string, { title: string; body: string; action: string }> = {
  "no-students": {
    title: "alertNoStudentsTitle",
    body: "alertNoStudentsBody",
    action: "alertNoStudentsAction",
  },
  "no-receipts": {
    title: "alertNoReceiptsTitle",
    body: "alertNoReceiptsBody",
    action: "alertNoReceiptsAction",
  },
};

function localizedAlertField(
  alert: DashboardAlert,
  field: "title" | "body" | "action",
  t: DashboardTranslator,
): string {
  const mapping = DASHBOARD_ALERT_I18N[alert.key];
  const fallback = field === "title" ? alert.title : field === "body" ? alert.detail : alert.actionLabel ?? "";
  if (!mapping) return fallback;
  const key = mapping[field];
  if (!key) return fallback;
  return t(key as Parameters<DashboardTranslator>[0]);
}

function AlertsPanel({ alerts, t }: { alerts: DashboardAlert[]; t: DashboardTranslator }) {
  if (alerts.length === 0) {
    return (
      <Notice tone="success" iconless title={t("alertsEmptyTitle")}>
        {t("alertsEmptyBody")}
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
                {localizedAlertField(alert, "title", t)}
              </span>
            }
            action={
              alert.actionHref && alert.actionLabel ? (
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={alert.actionHref}
                    className="inline-flex items-center gap-1 text-current"
                  >
                    {localizedAlertField(alert, "action", t)}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null
            }
          >
            {localizedAlertField(alert, "body", t)}
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
  sessionLabel,
  t,
}: {
  health: NonNullable<Awaited<ReturnType<typeof getDashboardPageData>>["systemSyncHealth"]>;
  sessionLabel?: string;
  t: DashboardTranslator;
}) {
  const needsAttention =
    health.sessionMismatch ||
    !health.paymentDeskReady ||
    !health.dashboardReady;

  if (!needsAttention) {
    return null;
  }

  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <Notice
      tone="warning"
      title={t("feeRecordsAttentionTitle")}
      action={
        <Button asChild size="sm" variant="outline">
          <Link href={withSession("/protected/admin-tools#fee-data-troubleshooting")}>
            {t("feeRecordsAttentionAction")}
          </Link>
        </Button>
      }
    >
      {t("feeRecordsAttentionBody")}
    </Notice>
  );
}



// Shaped like a board, not like the stack that used to live here, and given a
// floor height. Swapping a full board for a shorter skeleton collapsed the page
// mid-switch and then pushed it back down when the content arrived -- the
// scroll position survived, but the content under it moved anyway.
function DashboardBelowFoldSkeleton() {
  return (
    <>
      {/* A phone board is a single column of cards, so a six-tile grid
          skeleton was a shape it never resolves into. */}
      <div className="flex min-h-[24rem] flex-col gap-2.5 md:hidden">
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
      </div>
      <div className="hidden min-h-[32rem] grid-cols-1 gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
      </div>
    </>
  );
}

async function DashboardBelowFold({
  staffRole,
  sessionLabel,
  canAutoPrepareDues,
  kpis,
  view,
  collectionWindowDays,
  todayIso,
}: {
  staffRole: Awaited<ReturnType<typeof requireStaffPermission>>["appRole"];
  sessionLabel: string;
  canAutoPrepareDues: boolean;
  kpis: DashboardKpis;
  view: DashboardView;
  collectionWindowDays: CollectionWindow;
  todayIso: string;
}) {
  const t = await getTranslations("Dashboard");
  // Overview is built from getDashboardPageData; the other four boards are built
  // entirely from the analytics payload. Fetching both for every board meant a
  // tab click paid for work the tab could not display -- and getRouteCollectionSummary,
  // now folded into the analytics query, was shipping 507 student rows from Mumbai
  // to produce twenty. Analytics is cached on `session:{label}`, so once one
  // board has loaded it the rest are a cache read.
  //
  // The EMI summary is loaded here rather than inside EmiTrackingCard because
  // the phone Recovery board reads the same figures. Two call sites would be
  // two round trips -- unstable_cache does not de-duplicate concurrent
  // callers, and this read is not cached at all.
  const [data, analytics, emiSummary] = await Promise.all([
    getDashboardPageData({ staffRole, sessionLabel }),
    getDashboardAnalytics(sessionLabel),
    getRepaymentDashboardSummary(sessionLabel).catch(() => null),
  ]);
  scheduleDashboardAutoPrepare({
    canAutoPrepareDues,
    sessionLabel,
    health: data.systemSyncHealth,
  });
  const autoPrepareCount =
    canAutoPrepareDues && data.systemSyncHealth
      ? (data.systemSyncHealth.studentsMissingInstallments?.length ?? 0)
      : 0;
  // Same source the desktop banner uses; shown regardless of write permission
  // because reading "these students are missing from every total" matters to
  // anyone looking at the numbers.
  const missingDuesCount = data.systemSyncHealth?.studentsMissingInstallments?.length ?? 0;

  const visibleAlerts = data.alerts.filter((alert) => {
    if (staffRole !== "admin") {
      if (alert.actionHref?.includes("/admin-tools")) return false;
      if (alert.key === "dues-missing") return false;
    }
    return true;
  });

  return (
    <>
      {/* Phone below-fold: the selected analytics board.
          The data-integrity warnings stay ABOVE it and outside the board — a
          student with no fee ledger is invisible in every pending total, so
          that warning must not end up behind a board nobody happens to open. */}
      <div className="space-y-2.5 md:hidden">
        {staffRole === "admin" && data.systemSyncHealth ? (
          <FeeDataAttentionBanner
            health={data.systemSyncHealth}
            sessionLabel={sessionLabel}
            t={t}
          />
        ) : null}
        {missingDuesCount > 0 ? (
          <MissingDuesBanner
            missingCount={missingDuesCount}
            repairHref={appendSessionParam("/protected/fee-setup", sessionLabel)}
          />
        ) : null}
        <MobileDashboardBoards
          view={view}
          sessionLabel={sessionLabel}
          kpis={kpis}
          data={data}
          analytics={analytics}
          emiSummary={emiSummary}
          collectionWindowDays={collectionWindowDays}
          todayIso={todayIso}
        />
      </div>

      <div className="hidden space-y-4 md:block md:space-y-6">
      {autoPrepareCount > 0 ? (
        <Notice tone="info" title={t("duesUpdateStartedTitle")}>
          {t("duesUpdateStartedBody", { count: autoPrepareCount })}
        </Notice>
      ) : null}

      {staffRole === "admin" && data.systemSyncHealth ? (
        <FeeDataAttentionBanner health={data.systemSyncHealth} sessionLabel={sessionLabel} t={t} />
      ) : null}

      {visibleAlerts.length > 0 ? <AlertsPanel alerts={visibleAlerts} t={t} /> : null}

      {/* The four analytical boards. Each is a grid of tiles and nothing else --
          the sections that used to stack below the fold on every view now live
          on the one board they belong to. */}
      {view === "collection" ? <CollectionBoard analytics={analytics} /> : null}
      {view === "recovery" ? (
        <RecoveryBoard
          analytics={analytics}
          oldBalance={{
            original: kpis.previousYearOriginal ?? 0,
            recovered: kpis.previousYearCollected ?? 0,
            pending: kpis.previousYearPending ?? 0,
          }}
        />
      ) : null}
      {view === "classes" ? (
        <ClassesBoard analytics={analytics} sessionLabel={sessionLabel} />
      ) : null}
      {view === "discounts" ? (
        <DiscountsBoard analytics={analytics} sessionLabel={sessionLabel} />
      ) : null}
      {view === "latefee" ? (
        <LateFeeBoard analytics={analytics} sessionLabel={sessionLabel} />
      ) : null}

      {view === "overview" ? (
      <>
      <OverviewBoard
        installmentSummary={data.installmentSummary}
        followUpQueue={data.followUpQueue}
        todayModes={data.todayPaymentModeBreakdown}
        sessionLabel={sessionLabel}
        studentCounts={{
          paid: data.paidStudents,
          partly: data.partlyPaidStudents,
          overdue: data.overdueStudents,
          notStarted: data.notStartedStudents,
        }}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <TodayBreakdown kpis={kpis} paymentModeBreakdown={data.todayPaymentModeBreakdown} />
        <StudentStatusRing classSummary={data.classSummary} totalStudents={kpis.totalStudents} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <Section
          title={t("collectionHeatmapTitle")}
          description={t("collectionHeatmapDescription")}
          variant="card"
        >
          <CollectionHeatmap collections={data.collectionHeatmap} />
        </Section>
        <Section
          title={t("classProgressTitle")}
          description={t("classProgressDescription")}
          variant="card"
        >
          <ClassCollectionProgress rows={data.classSummary} />
        </Section>
      </div>

      {(analytics.routeRecovery?.length ?? 0) > 0 ? (
        <Section
          title={t("routeProgressTitle")}
          description={t("routeProgressDescription")}
          variant="card"
        >
          <RouteCollectionHeatmap rows={analytics.routeRecovery} />
        </Section>
      ) : null}

      <InstallmentTrack installments={data.installmentSummary} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <SVGTrendBarChart trendData={data.collectionTrend} sessionLabel={sessionLabel} />
        <TopDefaulters rows={data.followUpQueue} sessionLabel={sessionLabel} t={t} />
      </div>

      {/* Renders nothing until the school actually has active plans. */}
      <EmiTrackingCard sessionLabel={sessionLabel} summary={emiSummary} />

      <ClassLeaderboard classSummary={data.classSummary} />

      <Section
        title={t("classFeePositionTitle")}
        description={t("classFeePositionDescription")}
      >
        <ClassSummaryTable classSummary={data.classSummary} />
      </Section>

      <QuickJumpLinks
        kpis={kpis}
        classSummary={data.classSummary}
        sessionLabel={sessionLabel}
      />
      </>
      ) : null}

      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */

type DashboardPageProps = {
  searchParams?: Promise<{
    notice?: string;
    prepared?: string;
    session?: string;
    view?: string | string[];
    /** Phone Collection board window, 14 or 30. */
    days?: string | string[];
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // Phase 0 perf instrumentation: per-call server timing (auth + each data
  // loader) so later phases can attribute a TTFB change to a specific cause.
  // No-op unless on a Vercel preview or PERF_TIMING=1.
  const timer = new ServerTimer("dashboard");
  // Auth gate — must resolve before any protected data is fetched.
  const staff = await timer.measure("auth", () =>
    requireStaffPermission("dashboard:view", { onDenied: "redirect" }),
  );
  // Translations, the search params, and the session cookie are independent of
  // each other and of the auth result — load them concurrently instead of in
  // series.
  const [t, resolvedSearchParams, cookieSession] = await Promise.all([
    getTranslations("Dashboard"),
    searchParams,
    getViewSessionCookie(),
  ]);
  const viewSession = await timer.measure("resolveViewSession", () =>
    resolveViewSession({
      searchParamSession: resolvedSearchParams?.session,
      cookieSession,
    }),
  );
  // aboveFold (needs the resolved session) and today's activity counts (need
  // only staff.id) are independent reads — run them concurrently rather than
  // chaining one after the other.
  // sessionSwitcher preloaded so Home's pill opens with rows in hand rather
  // than firing a request on tap. TTL-cached, so this costs nothing.
  const [aboveFold, todayActivityCounts, sessionSwitcher] = await Promise.all([
    timer.measure("aboveFold", () =>
      getDashboardAboveFoldData({
        staffRole: staff.appRole,
        sessionLabel: viewSession.sessionLabel,
      }),
    ),
    typeof staff?.id === "string"
      ? timer.measure("todayActivityCounts", () => getTodayActivityCounts(staff.id))
      : Promise.resolve({}),
    getSessionSwitcherData(),
  ]);
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canAutoPrepareDues = hasStaffPermission(staff, "fees:write");
  const preparedCount = Number.parseInt(resolvedSearchParams?.prepared ?? "", 10);
  const view = resolveDashboardView(resolvedSearchParams?.view);
  const collectionWindowDays = resolveCollectionWindow(resolvedSearchParams?.days);
  // One label map, two switchers: the phone's (inside MobileDashboardScreen)
  // and the desk's. Divergent labels would make the same `?view=` read as two
  // different boards depending on the screen it was opened on.
  const boardLabels: Record<DashboardView, string> = {
    overview: t("viewOverview"),
    collection: t("viewCollection"),
    recovery: t("viewRecovery"),
    classes: t("viewClasses"),
    latefee: t("viewLateFee"),
    discounts: t("viewDiscounts"),
  };
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const todayIsoForDelta = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayDelta = computeTodayCollectionDelta(
    aboveFold.collectionTrend ?? [],
    todayIsoForDelta,
    aboveFold.kpis.todaysCollection,
  );

  // Three-pot split: this year's fees, previous-year carry-forward ("old
  // balance"), and late fees. Every above-fold card reads from exactly one
  // pot so the numbers never blend. Fallbacks keep the page rendering if the
  // carry-forward augmentation ever fails (older cached summary payloads).
  const currentYearExpected =
    aboveFold.kpis.currentYearExpected ?? aboveFold.kpis.totalExpectedFees;
  const currentYearCollected =
    aboveFold.kpis.currentYearCollected ?? aboveFold.kpis.totalCollected;
  const currentYearPending =
    aboveFold.kpis.currentYearPending ?? aboveFold.kpis.totalPending;
  const previousYearOriginal = aboveFold.kpis.previousYearOriginal ?? 0;
  const previousYearCollected = aboveFold.kpis.previousYearCollected ?? 0;
  const previousYearPending = aboveFold.kpis.previousYearPending ?? 0;
  const lateFeePending = aboveFold.kpis.lateFeePending ?? 0;
  const thisYearCollectionRate =
    currentYearExpected > 0
      ? Math.min(100, Math.round((currentYearCollected / currentYearExpected) * 100))
      : aboveFold.kpis.collectionRate;

  // Home header (mobile v2). The phone app has no persistent app bar, so the
  // greeting and identity that used to sit in it are rendered by Home itself.
  // School-time hour comes from the server so the greeting is right on first
  // paint rather than flashing after hydration.
  // School time, not server time — the greeting must match the clock on the
  // office wall, and be correct on first paint (same rule as the desktop bar).
  const schoolHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  // Same email-to-name transform the Receipts "Collected by" filter uses --
  // both are looking at a staff member we only know by their sign-in address.
  const mobileFirstName = staffDisplayName(staff.email).split(" ")[0] || "there";
  // Translated: this is the first line on the phone home screen, so an English
  // greeting above a Hindi app is the most visible language leak there is.
  const tMobile = await getTranslations("MobileApp");
  const mobileGreetingKey =
    schoolHour < 12 ? "goodMorning" : schoolHour < 17 ? "goodAfternoon" : "goodEvening";
  const mobileGreeting = tMobile(mobileGreetingKey, { name: mobileFirstName });
  const mobileInitials = staffInitials(staff.email);

  timer.flush();

  return (
    <div className="space-y-4 sm:space-y-7">
      <DashboardPrefetcher
        sessionLabel={viewSession.sessionLabel}
        canPostPayments={canPostPayments}
      />
      {/* Desktop page chrome. On a phone the sticky app header already
          greets the user and the ink band below carries the day's money, so
          a second title block would only push the numbers down. */}
      <div className="hidden space-y-4 md:block sm:space-y-7">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge label={t("sessionPrefix", { session: aboveFold.currentSession })} tone="accent" />
            {aboveFold.currentInstallment ? (
              <StatusBadge
                label={`${aboveFold.currentInstallment.label} - ${formatShortDate(aboveFold.currentInstallment.dueDate)}`}
                tone={aboveFold.currentInstallment.status === "overdue" ? "warning" : "neutral"}
              />
            ) : null}
            <MoneyGlossaryLink />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 -mt-3 sm:-mt-5">
        <p className="hidden text-xs text-muted-foreground sm:block">
          {t("updatedAt", { when: formatUpdatedAt(aboveFold.generatedAt) })}
        </p>
        <TrustBadge
          source="Workbook v1"
          computedAt={aboveFold.generatedAt}
          className="hidden sm:inline-flex"
        />
      </div>

      <MorningBrief
        sentence={composeMorningBrief({
          kpis: aboveFold.kpis,
          followUpCount: aboveFold.studentsWithPending,
          currentInstallment: aboveFold.currentInstallment
            ? {
                label: aboveFold.currentInstallment.label,
                dueDate: formatShortDate(aboveFold.currentInstallment.dueDate),
                status: aboveFold.currentInstallment.status,
              }
            : null,
          t,
        })}
      />

      <ActivityStrip
        counts={todayActivityCounts}
        sessionLabel={viewSession.sessionLabel}
      />
      </div>

      {resolvedSearchParams?.notice ? (
        <Notice tone="success" iconless={false}>
          {resolvedSearchParams.notice}
        </Notice>
      ) : null}

      {/* Auto-prepare result: set by prepareDuesForStudentsAutomatically via ?prepared=N
          in the redirect URL. No direct code change needed - the after() flow handles this. */}
      {Number.isFinite(preparedCount) && preparedCount > 0 ? (
        <Notice tone="success" iconless={false}>
          {t("preparedNotice", { count: preparedCount })}
        </Notice>
      ) : null}

      {/* Empty-state guidance */}
      {!aboveFold.emptyState.hasStudents ? (
        <Section
          title={t("noStudentsTitle")}
          description={t("noStudentsBody")}
          actions={<StatusBadge label={t("getStartedBadge")} tone="accent" />}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              { href: "/protected/students/new", label: t("emptyAddStudent"), detail: t("emptyAddStudentDetail") },
              // A download, not a page. As a <Link> this quick action did
              // nothing at all: the App Router intercepts the click and a
              // binary attachment response silently no-ops.
              { href: "/protected/imports/template", label: t("emptyBulkAdd"), detail: t("emptyBulkAddDetail"), download: true },
              { href: "/protected/fee-setup", label: t("emptyOpenFeeSetup"), detail: t("emptyOpenFeeSetupDetail") },
              { href: "/protected/admin-tools", label: t("emptyAdminTools"), detail: t("emptyAdminToolsDetail") },
            ].map((action) => {
              const body = (
                <>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                    <span className="block text-xs text-muted-foreground">{action.detail}</span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </>
              );
              const className =
                "group flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2";

              return action.download ? (
                <DownloadAnchor key={action.href} href={withSession(action.href)} download className={className}>
                  {body}
                </DownloadAnchor>
              ) : (
                <Link key={action.href} href={withSession(action.href)} className={className}>
                  {body}
                </Link>
              );
            })}
          </div>
        </Section>
      ) : null}

      <div className="space-y-4 anim-fade-in">
        <OptimisticBanner />

        {/* ── Phone app (v2) ────────────────────────────────────────────
            A different information architecture, not a narrower table: one
            ink money band, the three pots, then the next action. The
            tablet/desktop tree below is untouched. */}
        <div className="md:hidden">
          <MobileDashboardScreen
            kpis={aboveFold.kpis}
            currentYearExpected={currentYearExpected}
            currentYearCollected={currentYearCollected}
            currentYearPending={currentYearPending}
            previousYearOriginal={previousYearOriginal}
            previousYearCollected={previousYearCollected}
            previousYearPending={previousYearPending}
            collectionRate={thisYearCollectionRate}
            followUpCount={aboveFold.studentsWithPending}
            todayDelta={todayDelta}
            sessionLabel={viewSession.sessionLabel}
            canPostPayments={canPostPayments}
            canViewDefaulters={hasStaffPermission(staff, "defaulters:view")}
            greeting={mobileGreeting}
            dateLine={`${formatShortDate(new Date())} · ${viewSession.sessionLabel}`}
            sessionIsTest={viewSession.isTest}
            sessionOptions={sessionSwitcher.availableSessions}
            staffInitials={mobileInitials}
            settingsHref={withSession("/protected/settings")}
            installmentSummary={aboveFold.installmentSummary}
            followUpQueue={aboveFold.followUpQueue}
            view={view}
            boardLabels={boardLabels}
            todayIso={todayIsoForDelta}
          />
        </div>

        {/* Desk view. The band carries the four numbers that are true on every
            board; the switcher picks which board sits under it. This replaces a
            fourteen-section vertical stack in which every section had a title
            AND a paragraph, and three of them restated the same KPIs. */}
        <div className="hidden space-y-4 md:block">
          <MoneyBand
            collectedToday={aboveFold.kpis.todaysCollection}
            collectedThisYear={currentYearCollected}
            expectedThisYear={currentYearExpected}
            feesPending={currentYearPending}
            lateFeePending={lateFeePending}
            receiptsToday={aboveFold.kpis.receiptsToday}
            todayDelta={todayDelta}
            sessionLabel={viewSession.sessionLabel}
            labels={{
              today: t("todayCollection"),
              thisYear: t("thisYearCollected"),
              expectedThisYear: t("ofExpectedLabel"),
              feesPending: t("feesPendingLabel"),
              lateFeePending: t("lateFeePendingLabel"),
              receipts: t("receiptsWord"),
              lateFeeHint: t("lateFeeNotDuesHint"),
            }}
          />

          <ViewSwitcher
            current={view}
            sessionLabel={viewSession.sessionLabel}
            labels={boardLabels}
          />

          <CriticalAlerts
            syncError={aboveFold.syncError}
            appRole={staff.appRole}
            sessionLabel={viewSession.sessionLabel}
            t={t}
          />

          <div className="anim-fade-in [animation-delay:60ms]">
            <QuickActions
              canWriteStudents={canWriteStudents}
              canPostPayments={canPostPayments}
              sessionLabel={viewSession.sessionLabel}
              t={t}
            />
          </div>
        </div>
        <div className="min-h-[32rem]">
        <Suspense fallback={<DashboardBelowFoldSkeleton />}>
          <DashboardBelowFold
            staffRole={staff.appRole}
            sessionLabel={viewSession.sessionLabel}
            canAutoPrepareDues={canAutoPrepareDues}
            kpis={aboveFold.kpis}
            view={view}
            collectionWindowDays={collectionWindowDays}
            todayIso={todayIsoForDelta}
          />
        </Suspense>
        </div>
      </div>

      {/* Tablet-only floating desk shortcut. Phones (v2) get a full-width
          "Collect a fee" card in the ink hero plus the saffron pill in the
          bottom bar — a third affordance on the same screen is noise. */}
      {canPostPayments ? (
        <Link
          href={withSession("/protected/payments")}
          className="fixed bottom-[calc(var(--mobile-bottom-nav-offset)+12px)] right-4 z-50 hidden items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-md md:flex lg:hidden"
        >
          <BadgeIndianRupee className="size-4" aria-hidden="true" />
          {t("openDesk")}
        </Link>
      ) : null}
    </div>
  );
}
