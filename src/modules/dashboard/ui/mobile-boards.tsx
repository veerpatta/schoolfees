import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import {
  MobileDailyLine,
  MobileLegendRow,
  MobileMatrixGrid,
  MobileMeterRow,
  MobileRing,
  MobileWeekdayBars,
  type MatrixCell,
} from "@/modules/dashboard/ui/mobile-board-charts";
import {
  HeroMoney,
  MobileBar,
  MobileCard,
  MobileLabel,
  MobileNote,
  MobileSectionCard,
  MobileSplitBar,
} from "@/ui/mobile/mobile-kit";
import type { CollectionWindow, DashboardAnalytics, DashboardView } from "@/modules/dashboard/data/analytics";
import type { DashboardPageData } from "@/modules/dashboard/data/queries";
import {
  buildDailySeries,
  buildWeekdayAverages,
  summariseDailySeries,
} from "@/modules/dashboard/domain/mobile-derived";
import type { DashboardKpis } from "@/modules/dashboard/domain/summary";
import type { RepaymentDashboardSummary } from "@/modules/repayment-plans/data/queries";
import { formatInr } from "@/platform/helpers/currency";
import { appendSessionParam } from "@/platform/navigation/session-href";

/**
 * The five analytics boards, phone-shaped.
 *
 * Same `?view=` param, same five names and the same cached payload as the desk
 * boards in `boards.tsx` — a dashboard link opens the same board whichever
 * screen it is tapped on. What differs is the shape: a phone gets a single
 * column of cards, not a three-up grid of tiles.
 *
 * **These components fetch nothing.** `data` and `analytics` arrive as props
 * from `DashboardBelowFold`, which already loads both. `unstable_cache` does
 * not de-duplicate concurrent callers, so a second call site here would fire a
 * second Mumbai round trip alongside the first on every cold cache.
 *
 * Every money figure is fees-only unless its label says late fee.
 */

type BoardProps = {
  sessionLabel: string;
  kpis: DashboardKpis;
  data: DashboardPageData;
  analytics: DashboardAnalytics;
  emiSummary: RepaymentDashboardSummary | null;
  collectionWindowDays: CollectionWindow;
  todayIso: string;
};

type Translator = Awaited<ReturnType<typeof getTranslations<"MobileApp">>>;

/** Money on a phone card is compact — ₹31.2L, not ₹31,20,000. */
function short(value: number) {
  return formatInr(value, { compact: true });
}

function SeeAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="focus-ring inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold text-accent"
    >
      {label}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

/** The one-line explanation under a card. */
function CardFootnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-t border-border pt-2.5 text-[11px] font-semibold leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyBoardNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-medium text-muted-foreground">{children}</p>;
}

/* ── Overview ──────────────────────────────────────────────────────────── */

function OverviewBoard({ t, kpis, data, sessionLabel }: BoardProps & { t: Translator }) {
  const expected = kpis.currentYearExpected ?? 0;
  const collected = kpis.currentYearCollected ?? 0;
  const pending = kpis.currentYearPending ?? 0;
  // "Not due yet" is always the remainder, never a stored number, so the three
  // segments add up to the expected total by construction.
  const notDueYet = Math.max(0, expected - collected - pending);
  const pctOf = (value: number) => (expected > 0 ? (value / expected) * 100 : 0);
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  // This year's installments only; carry-forward rows carry a pseudo number in
  // the 90s and belong to old balance.
  const track = data.installmentSummary
    .filter((row) => !row.isCarryForward && row.installmentNo < 90 && row.expectedAmount > 0)
    .slice(0, 6);

  // All four labels, because they partition the roster and anything less lies
  // about its size.
  const rosterTotal =
    data.paidStudents + data.partlyPaidStudents + data.overdueStudents + data.notStartedStudents;
  const rosterPct = (value: number) => (rosterTotal > 0 ? (value / rosterTotal) * 100 : 0);

  return (
    <>
      <MobileCard>
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <MobileLabel>{t("expectedThisYear")}</MobileLabel>
            <HeroMoney value={expected} compact className="mt-1 text-3xl text-foreground" />
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
            { key: "collected", percent: pctOf(collected), tone: "success" },
            { key: "pending", percent: pctOf(pending), tone: "danger" },
            { key: "notdue", percent: pctOf(notDueYet), tone: "neutral" },
          ]}
        />

        <ul className="mt-3 flex flex-col gap-2">
          <MobileLegendRow tone="success" label={t("collected")} value={short(collected)} />
          <MobileLegendRow tone="danger" label={t("pending")} value={short(pending)} />
          <MobileLegendRow tone="neutral" label={t("notDueYet")} value={short(notDueYet)} />
        </ul>

        {data.currentInstallment?.label ? (
          <CardFootnote>
            {t("installmentLine", {
              label: data.currentInstallment.label,
              pending: formatInr(pending),
              notDue: formatInr(notDueYet),
            })}
          </CardFootnote>
        ) : null}
      </MobileCard>

      {track.length > 0 ? (
        <MobileSectionCard title={t("installmentTrack")}>
          <ul className="flex flex-col gap-3">
            {track.map((row) => (
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
                    collected: short(row.collectedAmount),
                    expected: short(row.expectedAmount),
                  })}
                  {row.dueDate ? ` · ${row.dueDate}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      {rosterTotal > 0 ? (
        <MobileSectionCard
          title={t("recoveryFunnel")}
          action={
            <SeeAllLink
              href={appendSessionParam("/protected/students", sessionLabel)}
              label={t("seeAll")}
            />
          }
        >
          <p className="tabular -mt-1 mb-2 text-[11px] font-semibold text-muted-foreground">
            {t("studentsCount", { count: rosterTotal })}
          </p>
          <MobileSplitBar
            segments={[
              { key: "paid", percent: rosterPct(data.paidStudents), tone: "success" },
              { key: "part", percent: rosterPct(data.partlyPaidStudents), tone: "warning" },
              { key: "overdue", percent: rosterPct(data.overdueStudents), tone: "danger" },
              { key: "none", percent: rosterPct(data.notStartedStudents), tone: "neutral" },
            ]}
          />
          <ul className="mt-3 flex flex-col gap-2">
            <MobileLegendRow tone="success" label={t("funnelPaid")} value={data.paidStudents} />
            <MobileLegendRow tone="warning" label={t("funnelPart")} value={data.partlyPaidStudents} />
            <MobileLegendRow tone="danger" label={t("funnelOverdue")} value={data.overdueStudents} />
            <MobileLegendRow tone="neutral" label={t("funnelNone")} value={data.notStartedStudents} />
          </ul>
        </MobileSectionCard>
      ) : null}
    </>
  );
}

/* ── Collection ────────────────────────────────────────────────────────── */

const MODE_KEYS = {
  cash: "modeCash",
  upi: "modeUpi",
  bank_transfer: "modeBankTransfer",
  cheque: "modeCheque",
  discount: "modeDiscount",
} as const;

const MODE_TONES = ["accent", "info", "success", "warning", "neutral"] as const;

const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
] as const;

function CollectionBoard({
  t,
  data,
  analytics,
  sessionLabel,
  collectionWindowDays,
  todayIso,
}: BoardProps & { t: Translator }) {
  const series = buildDailySeries(data.collectionHeatmap, todayIso, collectionWindowDays);
  const summary = summariseDailySeries(series);
  const weekdayAverages = buildWeekdayAverages(data.collectionHeatmap, todayIso);

  const modeTotals = (analytics.monthlyCollection ?? []).reduce<Record<string, number>>(
    (accumulator, month) => {
      for (const [mode, amount] of Object.entries(month.byMode ?? {})) {
        accumulator[mode] = (accumulator[mode] ?? 0) + amount;
      }
      return accumulator;
    },
    {},
  );
  const modeRows = Object.entries(modeTotals)
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1]);
  const modeTotal = modeRows.reduce((sum, [, amount]) => sum + amount, 0);

  const windowHref = (days: number) =>
    `/protected/dashboard?session=${encodeURIComponent(sessionLabel)}&view=collection&days=${days}`;

  return (
    <>
      <MobileCard>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13.5px] font-extrabold text-foreground">{t("dailyCollection")}</h2>
          {/* Links, not a toggle: the dashboard is server-rendered under a hard
              gzip ceiling, and `days` belongs in the URL next to `view` anyway.
              `scroll={false}` keeps the reader on the chart they just tapped. */}
          <div className="flex shrink-0 gap-1 rounded-full bg-surface-2 p-1">
            {[14, 30].map((days) => {
              const active = collectionWindowDays === days;
              return (
                <Link
                  key={days}
                  href={windowHref(days)}
                  prefetch
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "focus-ring rounded-full bg-card px-3 py-1 text-[11px] font-extrabold text-foreground shadow-sm"
                      : "focus-ring rounded-full px-3 py-1 text-[11px] font-extrabold text-muted-foreground"
                  }
                >
                  {t(days === 14 ? "range14Days" : "range30Days")}
                </Link>
              );
            })}
          </div>
        </div>

        {series.length > 0 ? (
          <>
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              {t("dailySummary", {
                average: short(summary.average),
                best: short(summary.best),
                zeroDays: summary.zeroDays,
              })}
            </p>
            <MobileDailyLine
              points={series}
              average={summary.average}
              startLabel={series[0].date}
              endLabel={t("today")}
              ariaLabel={t("dailyCollectionAria", {
                days: series.length,
                average: short(summary.average),
                best: short(summary.best),
              })}
            />
            <CardFootnote>{t("dailyCollectionNote")}</CardFootnote>
          </>
        ) : (
          <p className="mt-2">
            <EmptyBoardNote>{t("boardNoCollections")}</EmptyBoardNote>
          </p>
        )}
      </MobileCard>

      <MobileCard>
        <h2 className="text-[13.5px] font-extrabold text-foreground">{t("whichDaysPay")}</h2>
        <p className="mb-3 mt-1 text-[11px] font-semibold text-muted-foreground">
          {t("whichDaysPaySub")}
        </p>
        <MobileWeekdayBars
          ariaLabel={t("whichDaysPayAria")}
          bars={weekdayAverages.map((average, index) => ({
            key: WEEKDAY_KEYS[index],
            label: t(WEEKDAY_KEYS[index]),
            value: average,
            display: average > 0 ? short(average) : "—",
          }))}
        />
      </MobileCard>

      {modeRows.length > 0 ? (
        <MobileSectionCard title={t("howTheyPay")}>
          <MobileSplitBar
            className="h-3"
            segments={modeRows.map(([mode, amount], index) => ({
              key: mode,
              percent: modeTotal > 0 ? (amount / modeTotal) * 100 : 0,
              tone: MODE_TONES[index % MODE_TONES.length],
            }))}
          />
          <ul className="mt-3 flex flex-col gap-2.5">
            {modeRows.map(([mode, amount], index) => (
              <MobileLegendRow
                key={mode}
                tone={MODE_TONES[index % MODE_TONES.length]}
                label={
                  mode in MODE_KEYS ? t(MODE_KEYS[mode as keyof typeof MODE_KEYS]) : mode
                }
                meta={`${modeTotal > 0 ? Math.round((amount / modeTotal) * 100) : 0}%`}
                value={short(amount)}
              />
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}
    </>
  );
}

/* ── Recovery ──────────────────────────────────────────────────────────── */

const AGE_BUCKET_KEYS = {
  "0-30": "ageBucket0to30",
  "31-60": "ageBucket31to60",
  "61-90": "ageBucket61to90",
  "90+": "ageBucket90Plus",
} as const;

function RecoveryBoard({ t, kpis, analytics, emiSummary, sessionLabel }: BoardProps & { t: Translator }) {
  const debtAge = analytics.debtAge ?? [];
  const agedTotal = debtAge.reduce((sum, bucket) => sum + bucket.feesPending, 0);
  const worstBucket = Math.max(...debtAge.map((bucket) => bucket.feesPending), 1);
  const stale = debtAge.find((bucket) => bucket.bucket === "90+");

  const carriedIn = kpis.previousYearOriginal ?? 0;
  const recovered = kpis.previousYearCollected ?? 0;
  const stillOpen = kpis.previousYearPending ?? 0;
  const recoveredPct = carriedIn > 0 ? Math.round((recovered / carriedIn) * 100) : 0;

  const emiExpected = emiSummary?.expectedThisMonth ?? 0;
  const emiCollected = emiSummary?.collectedThisMonth ?? 0;

  return (
    <>
      {debtAge.length > 0 ? (
        <MobileSectionCard
          title={t("duesAging")}
          action={
            <SeeAllLink
              href={appendSessionParam("/protected/defaulters", sessionLabel)}
              label={t("callList")}
            />
          }
        >
          <p className="tabular -mt-1 mb-3 text-[11px] font-semibold text-muted-foreground">
            {t("duesAgingSub", { amount: short(agedTotal) })}
          </p>
          <ul className="flex flex-col gap-3">
            {debtAge.map((bucket) => (
              <MobileMeterRow
                key={bucket.bucket}
                label={t(AGE_BUCKET_KEYS[bucket.bucket] ?? "ageBucket90Plus")}
                meta={t("studentsCount", { count: bucket.students })}
                amount={short(bucket.feesPending)}
                percent={(bucket.feesPending / worstBucket) * 100}
                tone={
                  bucket.bucket === "90+"
                    ? "danger"
                    : bucket.bucket === "61-90"
                      ? "warning"
                      : "accent"
                }
              />
            ))}
          </ul>
          {stale && agedTotal > 0 ? (
            <CardFootnote>
              {t("duesAgingNote", {
                percent: Math.round((stale.feesPending / agedTotal) * 100),
                students: stale.students,
              })}
            </CardFootnote>
          ) : null}
        </MobileSectionCard>
      ) : null}

      {carriedIn > 0 ? (
        <MobileSectionCard title={t("oldBalanceRecovery")}>
          <div className="flex items-center gap-4">
            <MobileRing
              percent={recoveredPct}
              centreLabel={`${recoveredPct}%`}
              ariaLabel={t("percentRecovered", { percent: recoveredPct })}
            />
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              <li className="flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-muted-foreground">
                {t("oldBalanceCarriedIn")}
                <b className="tabular text-[12.5px] font-extrabold text-foreground">
                  {short(carriedIn)}
                </b>
              </li>
              <li className="flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-muted-foreground">
                {t("oldBalanceRecovered")}
                <b className="tabular text-[12.5px] font-extrabold text-success">
                  {short(recovered)}
                </b>
              </li>
              <li className="flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-muted-foreground">
                {t("oldBalanceStillOpen")}
                <b className="tabular text-[12.5px] font-extrabold text-destructive">
                  {short(stillOpen)}
                </b>
              </li>
            </ul>
          </div>
          {/* Students who left owing are a segment of the roster, not a figure
              in any dashboard payload — one tap to the real list beats a
              number this screen cannot stand behind. */}
          <div className="mt-3 border-t border-border pt-2.5">
            <SeeAllLink
              href={appendSessionParam("/protected/students?seg=leftOwing", sessionLabel)}
              label={t("leftStudentsLink")}
            />
          </div>
        </MobileSectionCard>
      ) : null}

      {emiSummary && emiSummary.activePlans > 0 ? (
        <MobileSectionCard
          title={t("emiHealth")}
          action={
            <SeeAllLink
              href={appendSessionParam("/protected/students?seg=onEmi", sessionLabel)}
              label={t("emiPlansCount", { count: emiSummary.activePlans })}
            />
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-success-soft p-2.5">
              <p className="tabular text-[19px] font-extrabold text-success-soft-foreground">
                {emiSummary.onTrack}
              </p>
              <p className="text-[10px] font-bold text-success-soft-foreground">{t("emiOnTrack")}</p>
            </div>
            <div className="rounded-xl bg-warning-soft p-2.5">
              <p className="tabular text-[19px] font-extrabold text-warning-soft-foreground">
                {emiSummary.dueNow}
              </p>
              <p className="text-[10px] font-bold text-warning-soft-foreground">{t("emiDueNow")}</p>
            </div>
            <div className="rounded-xl bg-destructive-soft p-2.5">
              <p className="tabular text-[19px] font-extrabold text-destructive-soft-foreground">
                {emiSummary.missed}
              </p>
              <p className="text-[10px] font-bold text-destructive-soft-foreground">
                {t("emiMissed")}
              </p>
            </div>
          </div>
          {emiExpected > 0 ? (
            <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {t("emiThisMonth")}
                </span>
                <span className="tabular text-[12px] font-extrabold text-foreground">
                  {t("installmentCollectedOf", {
                    collected: short(emiCollected),
                    expected: short(emiExpected),
                  })}
                </span>
              </div>
              <MobileBar
                className="mt-2"
                percent={(emiCollected / emiExpected) * 100}
                tone="accent"
              />
              <p className="mt-2 text-[10.5px] font-semibold leading-relaxed text-muted-foreground">
                {t("emiRemaining", {
                  remaining: short(emiSummary.remainingTotal),
                  catchUp: short(emiSummary.catchUpTotal),
                })}
              </p>
            </div>
          ) : null}
        </MobileSectionCard>
      ) : null}
    </>
  );
}

/* ── Classes ───────────────────────────────────────────────────────────── */

function ClassesBoard({ t, data, analytics, sessionLabel }: BoardProps & { t: Translator }) {
  const rankedClasses = [...data.classSummary]
    .filter((row) => row.pendingAmount > 0)
    .sort((left, right) => right.pendingAmount - left.pendingAmount)
    .slice(0, 6);
  // Bars are relative to the worst class, so the top row always fills the track
  // and the rest read as a proportion of it.
  const worstClass = rankedClasses.length > 0 ? rankedClasses[0].pendingAmount : 1;

  const routes = [...(analytics.routeRecovery ?? [])]
    .filter((row) => row.pendingAmount > 0)
    .sort((left, right) => right.pendingAmount - left.pendingAmount)
    .slice(0, 6);

  const matrixRows = data.classInstallmentMatrix.slice(0, 8);
  const matrixColumns = (matrixRows[0]?.installments ?? []).slice(0, 5);
  const worstCell = Math.max(
    ...matrixRows.flatMap((row) => row.installments.map((cell) => cell.pendingAmount)),
    1,
  );

  return (
    <>
      {rankedClasses.length > 0 ? (
        <MobileSectionCard
          title={t("pendingByClass")}
          action={
            <SeeAllLink
              href={appendSessionParam("/protected/students", sessionLabel)}
              label={t("seeAll")}
            />
          }
        >
          <ul className="flex flex-col gap-3">
            {rankedClasses.map((row) => (
              <MobileMeterRow
                key={row.classId}
                label={row.classLabel}
                meta={t("studentsCount", { count: row.studentsWithPending })}
                amount={short(row.pendingAmount)}
                percent={(row.pendingAmount / worstClass) * 100}
                tone="warning"
              />
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      {routes.length > 0 ? (
        <MobileSectionCard title={t("transportRoutes")}>
          <p className="-mt-1 mb-3 text-[11px] font-semibold text-muted-foreground">
            {t("transportRoutesSub")}
          </p>
          <ul className="flex flex-col gap-2.5">
            {routes.map((route) => (
              <li key={route.routeId ?? route.routeLabel} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="min-w-0 truncate text-[12.5px] font-bold text-foreground">
                    {route.routeLabel}
                  </span>
                  <span
                    className={
                      route.collectionRate >= 65
                        ? "tabular shrink-0 rounded-lg bg-success-soft px-2 py-0.5 text-[11.5px] font-extrabold text-success-soft-foreground"
                        : route.collectionRate >= 40
                          ? "tabular shrink-0 rounded-lg bg-warning-soft px-2 py-0.5 text-[11.5px] font-extrabold text-warning-soft-foreground"
                          : "tabular shrink-0 rounded-lg bg-destructive-soft px-2 py-0.5 text-[11.5px] font-extrabold text-destructive-soft-foreground"
                    }
                  >
                    {route.collectionRate}%
                  </span>
                </div>
                <MobileBar className="mt-2 h-1.5" percent={route.collectionRate} tone="accent" />
                <div className="mt-2 flex justify-between text-[10.5px] font-medium text-muted-foreground">
                  <span>
                    {t("pending")}{" "}
                    <b className="tabular text-foreground">{short(route.pendingAmount)}</b>
                  </span>
                  <span>{t("studentsCount", { count: route.studentCount })}</span>
                </div>
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}

      {matrixRows.length > 0 && matrixColumns.length > 0 ? (
        <MobileSectionCard title={t("classInstallment")}>
          <p className="-mt-1 mb-3 text-[11px] font-semibold text-muted-foreground">
            {t("classInstallmentSub")}
          </p>
          <MobileMatrixGrid
            legendLow={t("matrixLegendClear")}
            legendHigh={t("matrixLegendMost")}
            columns={matrixColumns.map((installment) => ({
              key: `${installment.installmentNo}-${installment.installmentLabel}`,
              // Column heads get a two-character slot; the full label is on the
              // Overview board's installment track.
              label: installment.isCarryForward
                ? t("matrixOldColumn")
                : String(installment.installmentNo),
            }))}
            rows={matrixRows.map((row) => ({
              key: row.classId,
              label: row.classLabel,
              cells: row.installments.slice(0, matrixColumns.length).map<MatrixCell>((cell) => ({
                key: `${cell.installmentNo}-${cell.installmentLabel}`,
                intensity: cell.pendingAmount / worstCell,
                label: cell.pendingAmount > 0 ? short(cell.pendingAmount) : "—",
              })),
            }))}
          />
        </MobileSectionCard>
      ) : null}
    </>
  );
}

/* ── Late fee ──────────────────────────────────────────────────────────── */

const WAIVER_SOURCE_KEYS = {
  grandfather: "waiverGrandfather",
  migration: "waiverMigration",
  manual: "waiverManual",
  payment_desk: "waiverPaymentDesk",
  repayment_plan: "waiverRepaymentPlan",
} as const;

function DiscountsBoard({ t, analytics, sessionLabel }: BoardProps & { t: Translator }) {
  // Defaulted at the read, like every board here: a payload cached by an
  // earlier build can be missing this whole block.
  const discounts = analytics.discounts ?? {
    totalDiscount: 0,
    conventionalDiscount: 0,
    manualDiscount: 0,
    studentsWithDiscount: 0,
    byPolicy: [],
    closeouts: { amount: 0, students: 0 },
  };
  const closeouts = discounts.closeouts ?? { amount: 0, students: 0 };
  const byPolicy = (discounts.byPolicy ?? []).filter((policy) => policy.amount > 0);
  const total = discounts.totalDiscount;
  const maxPolicyAmount = Math.max(1, ...byPolicy.map((policy) => policy.amount));

  if (total === 0 && closeouts.amount === 0) {
    return (
      <MobileCard>
        <EmptyBoardNote>{t("discountsNone")}</EmptyBoardNote>
      </MobileCard>
    );
  }

  return (
    <>
      <MobileSectionCard
        title={t("discountsTitle")}
        action={
          <SeeAllLink
            href={appendSessionParam("/protected/students?segments=hasDiscount", sessionLabel)}
            label={t("discountsSeeStudents")}
          />
        }
      >
        <HeroMoney value={total} className="text-3xl" />
        <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
          {t("studentsCount", { count: discounts.studentsWithDiscount })}
        </p>
        <MobileSplitBar
          className="mt-3"
          segments={[
            {
              key: "conventional",
              percent: total > 0 ? (discounts.conventionalDiscount / total) * 100 : 0,
              tone: "accent",
            },
            {
              key: "manual",
              percent: total > 0 ? (discounts.manualDiscount / total) * 100 : 0,
              tone: "info",
            },
          ]}
        />
        <CardFootnote>
          {t("discountsSplitNote", {
            conventional: formatInr(discounts.conventionalDiscount),
            manual: formatInr(discounts.manualDiscount),
          })}
        </CardFootnote>
      </MobileSectionCard>

      {byPolicy.length > 0 ? (
        <MobileSectionCard title={t("discountsByPolicy")}>
          <div className="space-y-2.5">
            {byPolicy.map((policy) => (
              <div key={policy.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] font-bold text-foreground">
                    {policy.label}
                  </span>
                  <span className="tabular shrink-0 text-[12.5px] font-extrabold">
                    {formatInr(policy.amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <MobileBar
                    percent={(policy.amount / maxPolicyAmount) * 100}
                    tone="accent"
                    className="h-[7px] flex-1"
                  />
                  <span className="shrink-0 text-[10.5px] font-semibold text-muted-foreground">
                    {t("studentsCount", { count: policy.students })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <CardFootnote>{t("discountsPolicyNote")}</CardFootnote>
        </MobileSectionCard>
      ) : null}

      {closeouts.amount > 0 ? (
        <MobileSectionCard title={t("discountsCloseouts")}>
          <HeroMoney value={closeouts.amount} className="text-2xl" />
          <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
            {t("studentsCount", { count: closeouts.students })}
          </p>
          <CardFootnote>{t("discountsCloseoutNote")}</CardFootnote>
        </MobileSectionCard>
      ) : null}
    </>
  );
}

function LateFeeBoard({ t, analytics, sessionLabel }: BoardProps & { t: Translator }) {
  const lateFee = analytics.lateFee;
  const charged = lateFee.charged;
  const waived = lateFee.waived;
  const pending = lateFee.pending;
  // Whatever is neither waived nor still owed was actually paid. Derived, not
  // stored — and never added to any fees figure.
  const paid = Math.max(0, charged - waived - pending);
  const waiverSources = (lateFee.byWaiverSource ?? []).filter((source) => source.amount > 0);
  const nextAccrual = lateFee.nextAccrual;

  if (charged === 0 && pending === 0) {
    return (
      <MobileCard>
        <EmptyBoardNote>{t("lateFeeNone")}</EmptyBoardNote>
      </MobileCard>
    );
  }

  return (
    <>
      <MobileSectionCard title={t("lateFeeTitle")}>
        <div className="flex items-end gap-3.5">
          <div className="min-w-0 flex-1">
            <MobileLabel>{t("lateFeeCharged")}</MobileLabel>
            <p className="tabular mb-1.5 mt-1 text-[17px] font-extrabold text-foreground">
              {formatInr(charged)}
            </p>
            <MobileBar percent={100} tone="accent" className="h-2" />
          </div>
          <div className="min-w-0 flex-1">
            <MobileLabel>{t("lateFeeWaived")}</MobileLabel>
            <p className="tabular mb-1.5 mt-1 text-[17px] font-extrabold text-warning">
              {formatInr(waived)}
            </p>
            <MobileBar
              percent={charged > 0 ? (waived / charged) * 100 : 0}
              tone="warning"
              className="h-2"
            />
          </div>
        </div>
        <CardFootnote>
          {t("lateFeeSplitNote", { paid: formatInr(paid), pending: formatInr(pending) })}
        </CardFootnote>
      </MobileSectionCard>

      <MobileSectionCard
        title={t("lateFeeStillOwed")}
        action={
          <SeeAllLink
            href={appendSessionParam("/protected/defaulters", sessionLabel)}
            label={t("callList")}
          />
        }
      >
        <HeroMoney value={pending} className="text-3xl text-destructive" />
        <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
          {t("studentsCount", { count: lateFee.studentsWithPending })}
        </p>
        {nextAccrual.amount > 0 && nextAccrual.dueDate ? (
          <CardFootnote>
            {t("lateFeeNextAccrual", {
              amount: formatInr(nextAccrual.amount),
              date: nextAccrual.dueDate,
              installments: nextAccrual.installments,
            })}
          </CardFootnote>
        ) : null}
      </MobileSectionCard>

      {waiverSources.length > 0 ? (
        <MobileSectionCard title={t("lateFeeWaiverSources")}>
          <ul className="flex flex-col gap-2.5">
            {waiverSources.map((source) => (
              <li key={source.source} className="flex items-baseline justify-between gap-2.5">
                <span className="min-w-0 text-[11.5px] font-semibold text-muted-foreground">
                  {source.source in WAIVER_SOURCE_KEYS
                    ? t(WAIVER_SOURCE_KEYS[source.source as keyof typeof WAIVER_SOURCE_KEYS])
                    : source.source}
                </span>
                <span className="tabular shrink-0 text-[12.5px] font-extrabold text-foreground">
                  {formatInr(source.amount)}
                </span>
              </li>
            ))}
          </ul>
        </MobileSectionCard>
      ) : null}
    </>
  );
}

/* ── switchboard ───────────────────────────────────────────────────────── */

export async function MobileDashboardBoards({
  view,
  ...props
}: BoardProps & { view: DashboardView }) {
  const t = await getTranslations("MobileApp");
  const boardProps = { ...props, t };

  return (
    <div className="flex flex-col gap-2.5">
      {view === "overview" ? <OverviewBoard {...boardProps} /> : null}
      {view === "collection" ? <CollectionBoard {...boardProps} /> : null}
      {view === "recovery" ? <RecoveryBoard {...boardProps} /> : null}
      {view === "classes" ? <ClassesBoard {...boardProps} /> : null}
      {view === "latefee" ? <LateFeeBoard {...boardProps} /> : null}
      {view === "discounts" ? <DiscountsBoard {...boardProps} /> : null}

      {/* Under every board, because it is true of every board: this screen is a
          read model. Corrections happen at the Payment Desk. */}
      <MobileNote>
        <b className="text-foreground">{t("boardsReadOnlyTitle")}</b> {t("boardsReadOnlyBody")}
      </MobileNote>
    </div>
  );
}
