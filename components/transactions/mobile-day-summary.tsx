"use client";

import { HeroMoney, InkCard, MobileLabel } from "@/components/mobile-app/mobile-kit";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

import type { TodaySnapshot } from "./transactions-client-shell";

/**
 * Phone day summary (mobile v2, Transactions).
 *
 * The desk strip lays the day out horizontally — label, count, total, four
 * mode figures — which on a phone wraps into six fragments with no hierarchy.
 * Here the total IS the screen: display serif on ink, receipt count under it,
 * and the mode split as one proportional bar, so a cash-heavy morning is
 * obvious without reading four separate numbers.
 *
 * Reads the same `todaySnapshot` the desk strip does — no extra query, and no
 * figure that the desk view doesn't already show.
 */
export function MobileDaySummary({
  snapshot,
  labels,
  className,
}: {
  snapshot: TodaySnapshot;
  /** Pre-translated, so this stays a presentational component. */
  labels: {
    prefix: string;
    receipts: string;
    cash: string;
    upi: string;
    bank: string;
    cheque: string;
  };
  className?: string;
}) {
  const modes = [
    { key: "cash", label: labels.cash, value: snapshot.cashTotal, tone: "bg-success" },
    { key: "upi", label: labels.upi, value: snapshot.upiTotal, tone: "bg-info" },
    { key: "bank", label: labels.bank, value: snapshot.bankTotal, tone: "bg-accent" },
    { key: "cheque", label: labels.cheque, value: snapshot.chequeTotal, tone: "bg-warning" },
  ].filter((mode) => mode.value > 0);

  return (
    <InkCard className={cn("md:hidden", className)}>
      <MobileLabel tone="ink">{labels.prefix}</MobileLabel>
      <HeroMoney value={snapshot.total} className="mt-1.5" />
      <p className="tabular mt-1.5 text-[11.5px] text-nav-muted">{labels.receipts}</p>

      {snapshot.total > 0 && modes.length > 0 ? (
        <>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-nav-surface">
            {modes.map((mode) => (
              <span
                key={mode.key}
                className={cn("h-full", mode.tone)}
                style={{ width: `${(mode.value / snapshot.total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {modes.map((mode) => (
              <li key={mode.key} className="flex items-center gap-1.5 text-[11px]">
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", mode.tone)}
                />
                <span className="truncate text-nav-muted">{mode.label}</span>
                <b className="tabular ml-auto text-nav-foreground">{formatInr(mode.value)}</b>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </InkCard>
  );
}

