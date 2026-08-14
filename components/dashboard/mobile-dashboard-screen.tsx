import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, IndianRupee, Phone, Receipt } from "lucide-react";

import { MobileSessionPill } from "@/components/admin/mobile-session-pill";
import { ViewSwitcher } from "@/components/dashboard/view-switcher";
import { ConnectionPill } from "@/components/mobile-app/connection-pill";
import { RateGauge } from "@/components/ui/rate-gauge";
import {
  HeroMoney,
  InkCard,
  IconTile,
  MobileCard,
  MobileLabel,
  MobileScreen,
  MobileSectionCard,
  MobileStatStrip,
} from "@/components/mobile-app/mobile-kit";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import type { DashboardView } from "@/lib/dashboard/analytics";
import type { KpiDelta } from "@/lib/dashboard/kpi-delta";
import { computePaceToYearEnd } from "@/lib/dashboard/mobile-derived";
import type {
  DashboardFollowUpStudent,
  DashboardInstallmentSummaryRow,
  DashboardKpis,
} from "@/lib/dashboard/summary";
import { formatInr } from "@/lib/helpers/currency";
import { appendSessionParam } from "@/lib/navigation/session-href";

/**
 * Phone home screen — "VPPS Mobile App v2", screen 1.
 *
 * The ink band carries the one number the counter cares about at 9am (money
 * taken today); under it, whether that is where the year should be; then what
 * to do next; then the board switcher. Nothing here is decorative: each figure
 * comes straight from the dashboard summary the desktop page already loads.
 *
 * The analytics themselves live in `mobile-boards.tsx`, below the switcher and
 * inside the same Suspense boundary the desk boards use.
 */

type MobileDashboardScreenProps = {
  kpis: DashboardKpis;
  currentYearExpected: number;
  currentYearCollected: number;
  currentYearPending: number;
  previousYearOriginal: number;
  previousYearCollected: number;
  previousYearPending: number;
  collectionRate: number;
  followUpCount: number;
  todayDelta: KpiDelta | null;
  sessionLabel: string;
  canPostPayments: boolean;
  canViewDefaulters: boolean;
  /**
   * Home header. The design puts these here because the phone app has no
   * persistent app bar — Home is where identity and session live.
   */
  greeting: string;
  dateLine: string;
  sessionIsTest: boolean;
  /** Preloaded so the pill opens instantly instead of fetching on tap. */
  sessionOptions: AvailableSessionRow[];
  staffInitials: string;
  settingsHref: string;
  /** Due dates and expected amounts — what "Pace to year end" is measured against. */
  installmentSummary: DashboardInstallmentSummaryRow[];
  /** Ranked overdue-first then by amount; the top three get a call button. */
  followUpQueue: DashboardFollowUpStudent[];
  /** Which analytics board the switcher marks as current. */
  view: DashboardView;
  boardLabels: Record<DashboardView, string>;
  /** School-timezone `YYYY-MM-DD`, resolved once by the page. */
  todayIso: string;
};

export async function MobileDashboardScreen({
  kpis,
  currentYearExpected,
  currentYearCollected,
  currentYearPending,
  previousYearOriginal,
  previousYearCollected,
  previousYearPending,
  collectionRate,
  followUpCount,
  todayDelta,
  sessionLabel,
  canPostPayments,
  canViewDefaulters,
  greeting,
  dateLine,
  sessionIsTest,
  sessionOptions,
  staffInitials,
  settingsHref,
  installmentSummary,
  followUpQueue,
  view,
  boardLabels,
  todayIso,
}: MobileDashboardScreenProps) {
  const t = await getTranslations("MobileApp");
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const recoveredPct =
    previousYearOriginal > 0
      ? Math.round((previousYearCollected / previousYearOriginal) * 100)
      : 0;

  const pace = computePaceToYearEnd({
    installmentSummary,
    currentYearExpected,
    currentYearCollected,
    todayIso,
  });

  const topCalls = followUpQueue.slice(0, 3);

  return (
    <MobileScreen>
      {/* Home owns its header (mobile v2). The app used to carry a sticky bar
          on every screen; the design gives Home the greeting on the left and
          live state on the right — connection, and the avatar that leads to
          Settings, which is where the old account menu now lives. */}
      <div className="flex items-start justify-between gap-2.5 pt-1">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold leading-tight tracking-tight text-foreground">
            {greeting}
          </h1>
          <p className="truncate text-[11.5px] font-medium text-muted-foreground">{dateLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionPill />
          <Link
            href={settingsHref}
            aria-label={t("account")}
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-nav text-[11.5px] font-extrabold text-nav-foreground"
          >
            {staffInitials}
          </Link>
        </div>
      </div>

      {/* Session switching was in the removed app bar — it stays one tap away. */}
      <div className="flex justify-start">
        <MobileSessionPill
          currentLabel={sessionLabel}
          isTest={sessionIsTest}
          initialSessions={sessionOptions}
        />
      </div>

      {/* ── Money taken today ─────────────────────────────────────────── */}
      <InkCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <MobileLabel tone="ink">{t("collectedToday")}</MobileLabel>
            <HeroMoney value={kpis.todaysCollection} className="mt-1.5" />
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-nav-muted">
              <span className="tabular">
                {kpis.receiptsToday === 1
                  ? t("receiptOne")
                  : t("receiptOther", { count: kpis.receiptsToday })}
              </span>
              {todayDelta?.deltaPct !== null && todayDelta ? (
                <span
                  className={
                    todayDelta.tone === "danger"
                      ? "rounded-full bg-destructive/25 px-2 py-0.5 text-[10px] font-extrabold text-nav-foreground"
                      : "rounded-full bg-success/25 px-2 py-0.5 text-[10px] font-extrabold text-nav-foreground"
                  }
                >
                  {/* The precomputed label ends in an English comparator
                      ("vs Tue avg") built server-side in kpi-delta.ts. The
                      phone card has no room for it and the v2 design shows the
                      arrow and figure alone — which also keeps the Hindi UI
                      from leaking one English phrase. */}
                  {todayDelta.deltaPct >= 0 ? "↑" : "↓"} {Math.abs(todayDelta.deltaPct)}%
                </span>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <RateGauge value={collectionRate} size="sm" tone="ink" />
            <p className="text-[9px] uppercase tracking-[0.07em] text-nav-muted">{t("yearRate")}</p>
          </div>
        </div>
      </InkCard>

      {/* ── Is that where the year should be? ─────────────────────────── */}
      {pace ? (
        <MobileCard>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13.5px] font-extrabold text-foreground">{t("paceTitle")}</h2>
            <span
              className={
                pace.daysBehind > 0
                  ? "shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-[10.5px] font-extrabold text-warning-soft-foreground"
                  : "shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-extrabold text-success-soft-foreground"
              }
            >
              {pace.daysBehind > 0 ? t("paceBehind", { days: pace.daysBehind }) : t("paceOnTrack")}
            </span>
          </div>

          {/* The marker is where the year SHOULD be — the sum of every
              installment already past its due date, not a smooth ramp. */}
          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${Math.max(0, Math.min(100, pace.collectedPct))}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute -top-1 h-[18px] w-0.5 bg-foreground"
              style={{ left: `${Math.max(0, Math.min(100, pace.expectedPct))}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between gap-2 text-[10.5px] font-semibold text-muted-foreground">
            <span>
              {t("collected")}{" "}
              <b className="tabular text-foreground">
                {formatInr(pace.collected, { compact: true })}
              </b>{" "}
              · {Math.round(pace.collectedPct)}%
            </span>
            <span>
              {t("paceShouldBe")}{" "}
              <b className="tabular text-foreground">
                {formatInr(pace.expectedToDate, { compact: true })}
              </b>{" "}
              · {Math.round(pace.expectedPct)}%
            </span>
          </div>

          {pace.catchUpPerDay > 0 ? (
            <p className="mt-2.5 border-t border-border pt-2.5 text-[11px] font-semibold leading-relaxed text-muted-foreground">
              {t("paceCatchUp", {
                amount: formatInr(pace.catchUpPerDay),
                days: pace.daysLeftInMonth,
              })}
            </p>
          ) : null}
        </MobileCard>
      ) : null}

      {/* ── The three pots, never blended ─────────────────────────────── */}
      <MobileStatStrip
        stats={[
          {
            label: t("pending"),
            value: formatInr(currentYearPending, { compact: true }),
            meta: t("studentsCount", { count: followUpCount }),
            tone: "warning",
          },
          {
            label: t("overdue"),
            value: formatInr(kpis.overdueAmount, { compact: true }),
            meta: t("pastDueDate"),
            tone: "danger",
          },
          {
            label: t("oldBalance"),
            value: formatInr(previousYearPending, { compact: true }),
            meta:
              previousYearOriginal > 0
                ? t("percentRecovered", { percent: recoveredPct })
                : t("noneCarried"),
          },
        ]}
      />

      {/* ── The action the app exists for ─────────────────────────────── */}
      {canPostPayments ? (
        <Link
          href={withSession("/protected/payments")}
          className="focus-ring flex h-[62px] items-center justify-center gap-2.5 rounded-2xl bg-accent text-accent-foreground shadow-md transition-transform active:scale-[0.985]"
        >
          <IndianRupee className="size-6" aria-hidden="true" />
          <span className="text-left">
            <span className="block text-[17px] font-extrabold leading-tight">{t("collectCta")}</span>
            <span className="block text-[11.5px] font-semibold text-accent-foreground">
              {t("collectSub")}
            </span>
          </span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        {canViewDefaulters ? (
          <Link
            href={withSession("/protected/defaulters")}
            className="focus-ring flex h-[58px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 transition-colors active:bg-surface-2"
          >
            <IconTile tone="danger">
              <Phone className="size-[17px]" aria-hidden="true" />
            </IconTile>
            <span className="min-w-0">
              <span className="block text-[13px] font-extrabold leading-tight text-foreground">
                {t("todaysCalls")}
              </span>
              <span className="block text-[10.5px] font-semibold text-muted-foreground">
                {t("toFollowUp", { count: followUpCount })}
              </span>
            </span>
          </Link>
        ) : null}
        <Link
          href={withSession("/protected/transactions?view=collection_today")}
          className="focus-ring flex h-[58px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 transition-colors active:bg-surface-2"
        >
          <IconTile tone="accent">
            <Receipt className="size-[17px]" aria-hidden="true" />
          </IconTile>
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold leading-tight text-foreground">
              {t("todaysReceipts")}
            </span>
            <span className="block text-[10.5px] font-semibold text-muted-foreground">
              {t("receiptOther", { count: kpis.receiptsToday })}
            </span>
          </span>
        </Link>
      </div>

      {/* ── Worth a call today ────────────────────────────────────────── */}
      {canViewDefaulters && topCalls.length > 0 ? (
        <MobileSectionCard
          title={t("worthACallToday")}
          action={
            <Link
              href={withSession("/protected/defaulters")}
              className="focus-ring inline-flex items-center gap-1 text-[11px] font-extrabold text-accent"
            >
              {t("seeAll")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          }
        >
          <ul className="flex flex-col gap-2.5">
            {topCalls.map((row) => (
              <li key={row.studentId} className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-foreground">
                    {row.studentName}
                  </span>
                  <span className="block truncate text-[10.5px] font-medium text-muted-foreground">
                    {row.classLabel}
                    {row.nextDueLabel ? ` · ${row.nextDueLabel}` : ""}
                  </span>
                </span>
                <b className="tabular shrink-0 text-[13px] text-destructive">
                  {formatInr(row.outstandingAmount, { compact: true })}
                </b>
                {row.fatherPhone ? (
                  <a
                    href={`tel:${row.fatherPhone}`}
                    aria-label={`${t("callAction")} ${row.studentName}`}
                    className="focus-ring grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                ) : (
                  <span
                    title={t("noPhoneOnFile")}
                    aria-label={t("noPhoneOnFile")}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground"
                  >
                    <Phone className="size-4 opacity-40" aria-hidden="true" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      {/* ── The analytics, behind a switcher ──────────────────────────────
          Last on the home screen because the board it selects streams in
          directly underneath, inside the same Suspense boundary the desk
          boards use. The switcher's links carry `scroll={false}`, so the pill
          the reader just tapped stays where their thumb left it. */}
      <ViewSwitcher current={view} sessionLabel={sessionLabel} labels={boardLabels} />
    </MobileScreen>
  );
}
