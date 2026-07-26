import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, IndianRupee, Phone, Receipt } from "lucide-react";

import { MobileSessionPill } from "@/components/admin/mobile-session-pill";
import { ConnectionPill } from "@/components/mobile-app/connection-pill";
import { RateGauge } from "@/components/ui/rate-gauge";
import {
  HeroMoney,
  InkCard,
  IconTile,
  MobileBar,
  MobileCard,
  MobileLabel,
  MobileNote,
  MobileScreen,
  MobileSectionCard,
  MobileSplitBar,
  MobileStatStrip,
} from "@/components/mobile-app/mobile-kit";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import type { KpiDelta } from "@/lib/dashboard/kpi-delta";
import type {
  DashboardClassSummaryRow,
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
 * taken today); everything under it answers "what should I do next". Nothing
 * here is decorative: each figure comes straight from the dashboard summary
 * the desktop page already loads.
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
  currentInstallmentLabel?: string;
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
  /** Per-installment collected/pending — powers the installment track card. */
  installmentSummary: DashboardInstallmentSummaryRow[];
  /** Recovery funnel counts. The four status labels partition the roster. */
  paidStudents: number;
  partlyPaidStudents: number;
  overdueStudents: number;
  notStartedStudents: number;
  /** Ranked overdue-first then by amount; the top three get a call button. */
  followUpQueue: DashboardFollowUpStudent[];
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
  currentInstallmentLabel,
  greeting,
  dateLine,
  sessionIsTest,
  sessionOptions,
  staffInitials,
  settingsHref,
  installmentSummary,
  paidStudents,
  partlyPaidStudents,
  overdueStudents,
  notStartedStudents,
  followUpQueue,
}: MobileDashboardScreenProps) {
  const t = await getTranslations("MobileApp");
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const recoveredPct =
    previousYearOriginal > 0
      ? Math.round((previousYearCollected / previousYearOriginal) * 100)
      : 0;

  // Three-segment year bar. "Not due yet" is what is left once collected and
  // pending are taken out — never a stored number, always the remainder, so
  // the three segments always add to the expected total.
  const notDueYet = Math.max(0, currentYearExpected - currentYearCollected - currentYearPending);
  const pctOf = (value: number) =>
    currentYearExpected > 0 ? (value / currentYearExpected) * 100 : 0;

  // This year's installments only. Carry-forward rows arrive in the same list
  // with a pseudo installment number in the 90s; they belong to the old-balance
  // card, not to a track showing how this year is progressing.
  const installmentTrack = installmentSummary
    .filter((row) => !row.isCarryForward && row.installmentNo < 90 && row.expectedAmount > 0)
    .slice(0, 6);

  // All FOUR status labels, because they partition the roster and anything
  // less lies about its size. Live 2026-27 is 17 paid / 24 part / 440 overdue
  // / 0 not started = 481; leaving overdue out drew a near-empty bar over 41
  // students and implied that was the school.
  const rosterTotal =
    paidStudents + partlyPaidStudents + overdueStudents + notStartedStudents;
  const rosterPct = (value: number) => (rosterTotal > 0 ? (value / rosterTotal) * 100 : 0);
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
                      ? "rounded-full bg-destructive/25 px-2 py-0.5 text-[10px] font-extrabold text-destructive-soft-foreground"
                      : "rounded-full bg-success/25 px-2 py-0.5 text-[10px] font-extrabold text-success-soft-foreground"
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
            <RateGauge value={collectionRate} size="sm" />
            <p className="text-[9px] uppercase tracking-[0.07em] text-nav-muted">{t("yearRate")}</p>
          </div>
        </div>
      </InkCard>

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
            <span className="block text-[11.5px] font-semibold opacity-85">
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

      {/* ── The year, in one card ─────────────────────────────────────── */}
      <MobileCard>
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <MobileLabel>{t("expectedThisYear")}</MobileLabel>
            <HeroMoney
              value={currentYearExpected}
              compact
              className="mt-1 text-3xl text-foreground"
            />
          </div>
          <div className="text-right">
            <p className="tabular text-xl font-extrabold text-success">{collectionRate}%</p>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              {t("collected")}
            </p>
          </div>
        </div>

        <MobileSplitBar
          className="mt-3"
          segments={[
            { key: "collected", percent: pctOf(currentYearCollected), tone: "success" },
            { key: "pending", percent: pctOf(currentYearPending), tone: "danger" },
            { key: "notdue", percent: pctOf(notDueYet), tone: "neutral" },
          ]}
        />

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
          {[
            { label: t("collected"), value: currentYearCollected, dot: "bg-success" },
            { label: t("pending"), value: currentYearPending, dot: "bg-destructive" },
            { label: t("notDueYet"), value: notDueYet, dot: "bg-border-strong" },
          ].map((legend) => (
            <div key={legend.label}>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`inline-block size-2 rounded-full ${legend.dot}`}
                />
                <span className="font-semibold text-muted-foreground">{legend.label}</span>
              </span>
              <b className="tabular block text-[13px]">
                {formatInr(legend.value, { compact: true })}
              </b>
            </div>
          ))}
        </div>

        {currentInstallmentLabel ? (
          <p className="mt-2.5 border-t border-border pt-2.5 text-[11px] font-semibold leading-relaxed text-muted-foreground">
            {t("installmentLine", {
              label: currentInstallmentLabel,
              pending: formatInr(currentYearPending),
              notDue: formatInr(notDueYet),
            })}
          </p>
        ) : null}
      </MobileCard>

      {/* ── Which installment is dragging ─────────────────────────────── */}
      {installmentTrack.length > 0 ? (
        <MobileSectionCard title={t("installmentTrack")}>
          <ul className="flex flex-col gap-3">
            {installmentTrack.map((row) => (
              <li key={row.installmentNo}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-bold text-foreground">
                    {row.installmentLabel}
                  </span>
                  <span className="tabular shrink-0 text-[11px] font-semibold text-muted-foreground">
                    {row.collectionRate}%
                  </span>
                </div>
                <MobileBar
                  className="mt-1.5"
                  percent={row.collectionRate}
                  tone={row.overdueAmount > 0 ? "danger" : "accent"}
                />
                <p className="mt-1 text-[10.5px] font-medium text-muted-foreground">
                  {t("installmentCollectedOf", {
                    collected: formatInr(row.collectedAmount, { compact: true }),
                    expected: formatInr(row.expectedAmount, { compact: true }),
                  })}
                  {row.dueDate ? ` · ${row.dueDate}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      {/* ── Where the roster stands ───────────────────────────────────── */}
      {rosterTotal > 0 ? (
        <MobileSectionCard
          title={t("recoveryFunnel")}
          action={
            <Link
              href={withSession("/protected/students")}
              className="focus-ring inline-flex items-center gap-1 text-[11px] font-extrabold text-accent"
            >
              {t("seeAll")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          }
        >
          <p className="tabular -mt-1 mb-2 text-[11px] font-semibold text-muted-foreground">
            {t("studentsCount", { count: rosterTotal })}
          </p>
          <MobileSplitBar
            segments={[
              { key: "paid", percent: rosterPct(paidStudents), tone: "success" },
              { key: "part", percent: rosterPct(partlyPaidStudents), tone: "warning" },
              { key: "overdue", percent: rosterPct(overdueStudents), tone: "danger" },
              { key: "none", percent: rosterPct(notStartedStudents), tone: "neutral" },
            ]}
          />
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
            {[
              { label: t("funnelPaid"), value: paidStudents, dot: "bg-success" },
              { label: t("funnelPart"), value: partlyPaidStudents, dot: "bg-warning" },
              { label: t("funnelOverdue"), value: overdueStudents, dot: "bg-destructive" },
              { label: t("funnelNone"), value: notStartedStudents, dot: "bg-border-strong" },
            ].map((legend) => (
              <div key={legend.label}>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`inline-block size-2 rounded-full ${legend.dot}`}
                  />
                  <span className="truncate font-semibold text-muted-foreground">
                    {legend.label}
                  </span>
                </span>
                <b className="tabular block text-[13px]">{legend.value}</b>
              </div>
            ))}
          </div>
        </MobileSectionCard>
      ) : null}

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
    </MobileScreen>
  );
}

/**
 * Pending by class — the one below-fold block the phone home screen keeps.
 * Bars are relative to the worst class, so the top row always fills the track
 * and the rest read as a proportion of it.
 */
export async function MobilePendingByClass({
  rows,
  sessionLabel,
}: {
  rows: DashboardClassSummaryRow[];
  sessionLabel: string;
}) {
  const t = await getTranslations("MobileApp");
  const ranked = rows
    .filter((row) => row.pendingAmount > 0)
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 5);
  const worst = ranked.length > 0 ? ranked[0].pendingAmount : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {ranked.length > 0 ? (
        <MobileSectionCard
          title={t("pendingByClass")}
          action={
            <Link
              href={appendSessionParam("/protected/students", sessionLabel)}
              className="focus-ring inline-flex items-center gap-1 text-[11px] font-extrabold text-accent"
            >
              {t("seeAll")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          }
        >
          <ul className="flex flex-col gap-2.5">
            {ranked.map((row) => (
              <li key={row.classId}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="truncate font-bold">
                    {row.classLabel}{" "}
                    <span className="font-medium text-muted-foreground">
                      · {t("studentsCount", { count: row.studentsWithPending })}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-extrabold text-destructive">
                    {formatInr(row.pendingAmount, { compact: true })}
                  </span>
                </div>
                <MobileBar percent={(row.pendingAmount / worst) * 100} tone="warning" />
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      <MobileNote>
        <b className="text-foreground">{t("calmNoteTitle")}</b> {t("calmNoteBody")}
      </MobileNote>
    </div>
  );
}
