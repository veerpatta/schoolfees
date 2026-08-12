import Link from "next/link";

import { CountUp } from "@/components/ui/count-up";
import { Money } from "@/components/ui/money";
import { formatInr } from "@/lib/helpers/currency";
import type { KpiDelta } from "@/lib/dashboard/kpi-delta";
import { cn } from "@/lib/utils";

/**
 * The four numbers that are true on every board, so they never move.
 *
 * Replaces the old HeroKpis + DesktopSecondaryKpis + MorningBrief + ActivityStrip
 * stack -- four cards, a sentence and a pill row that between them said the
 * same things three times.
 *
 * Fees pending and Late fee pending are deliberately adjacent and deliberately
 * separate. That adjacency is the whole point of the late-fee split: they are
 * both money owed, they behave nothing alike, and adding them up is what the
 * app used to do.
 */

type BandItem = {
  key: string;
  label: string;
  value: number;
  href?: string;
  hint?: string;
  tone?: "default" | "warning";
};

function DeltaLine({ delta }: { delta: KpiDelta | null }) {
  if (!delta || delta.deltaPct === null) return null;
  return (
    <span className="mt-1 block text-[11px] text-nav-muted">
      {delta.deltaPct > 0 ? "▲" : delta.deltaPct < 0 ? "▼" : "•"} {Math.abs(delta.deltaPct)}%{" "}
      {delta.comparator}
    </span>
  );
}

export function MoneyBand({
  collectedToday,
  collectedThisYear,
  expectedThisYear,
  feesPending,
  lateFeePending,
  receiptsToday,
  todayDelta,
  sessionLabel,
  labels,
}: {
  collectedToday: number;
  collectedThisYear: number;
  /** The fee book's target for the year. Never includes a late fee. */
  expectedThisYear: number;
  feesPending: number;
  lateFeePending: number;
  receiptsToday: number;
  todayDelta: KpiDelta | null;
  sessionLabel: string;
  labels: {
    today: string;
    thisYear: string;
    expectedThisYear: string;
    feesPending: string;
    lateFeePending: string;
    receipts: string;
    lateFeeHint: string;
  };
}) {
  const withSession = (href: string) => `${href}?session=${encodeURIComponent(sessionLabel)}`;
  const collectionRate =
    expectedThisYear > 0
      ? Math.min(100, Math.round((collectedThisYear / expectedThisYear) * 100))
      : 0;

  const rest: BandItem[] = [
    {
      key: "fees",
      label: labels.feesPending,
      value: feesPending,
      href: withSession("/protected/defaulters"),
    },
    {
      key: "latefee",
      label: labels.lateFeePending,
      value: lateFeePending,
      hint: labels.lateFeeHint,
      tone: "warning",
    },
  ];

  return (
    <div className="rounded-2xl bg-nav px-5 py-5 text-nav-foreground shadow-md print:hidden">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-nav-muted">
            {labels.today}
          </p>
          <CountUp
            value={collectedToday}
            className="mt-1 block font-display-money text-3xl leading-none"
          />
          <span className="mt-1 block text-[11px] text-nav-muted">
            {receiptsToday} {labels.receipts}
          </span>
          <DeltaLine delta={todayDelta} />
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-nav-muted">
            {labels.thisYear}
          </p>
          <Money
            value={collectedThisYear}
            className="mt-1 block font-display-money text-2xl leading-none text-nav-foreground"
          />
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-nav-surface"
            role="progressbar"
            aria-label={`${labels.thisYear} ${collectionRate}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={collectionRate}
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${collectionRate}%` }}
            />
          </div>
          <span className="mt-1 block text-[11px] text-nav-muted">
            {collectionRate}% {labels.expectedThisYear} {formatInr(expectedThisYear)}
          </span>
        </div>

        {rest.map((item) => {
          const body = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-nav-muted">
                {item.label}
              </p>
              <Money
                value={item.value}
                className={cn(
                  "mt-1 block font-display-money text-2xl leading-none",
                  item.tone === "warning" ? "text-warning" : "text-nav-foreground",
                )}
              />
              {item.hint ? (
                <span className="mt-1 block text-[11px] leading-snug text-nav-muted">
                  {item.hint}
                </span>
              ) : null}
            </>
          );

          return item.href ? (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-lg transition-opacity hover:opacity-80"
            >
              {body}
            </Link>
          ) : (
            <div key={item.key}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
