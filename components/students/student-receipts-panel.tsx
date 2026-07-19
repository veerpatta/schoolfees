"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ReversedBadge } from "@/components/receipts/reversed-badge";
import { Section } from "@/components/ui/section";
import { formatShortDate } from "@/lib/helpers/date";
import { cn } from "@/lib/utils";

type ReceiptItem = {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  totalAmount: number;
  paymentModeLabel: string;
  referenceNumber: string | null;
  receivedBy: string | null;
  /** True when reversal adjustments cancel this receipt in full. */
  isReversed?: boolean;
};

type SessionGroup = {
  sessionLabel: string;
  receipts: ReceiptItem[];
};

type StudentReceiptsPanelProps = {
  receipts: ReceiptItem[];
  receiptsBySession: SessionGroup[];
  activeSessionLabel: string | null;
  canPrintReceipts: boolean;
  encodedReturnTo: string;
};

type ViewMode = "by-session" | "timeline";

export function StudentReceiptsPanel({
  receipts,
  receiptsBySession,
  activeSessionLabel,
  canPrintReceipts,
  encodedReturnTo,
}: StudentReceiptsPanelProps) {
  const [view, setView] = useState<ViewMode>("by-session");
  const timeline = useMemo(() => {
    return [...receipts].sort(
      (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    );
  }, [receipts]);

  const description =
    view === "timeline"
      ? "All receipts across every academic session, newest first."
      : "Receipts grouped by academic session for this student.";

  const actions = receipts.length > 0 ? (
    <div role="tablist" aria-label="Receipt view" className="inline-flex rounded-md border border-border bg-surface-2 p-0.5 text-xs">
      <button
        type="button"
        role="tab"
        aria-selected={view === "by-session"}
        onClick={() => setView("by-session")}
        className={cn(
          "rounded px-2.5 py-1 font-medium transition-colors",
          view === "by-session"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        By session
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "timeline"}
        onClick={() => setView("timeline")}
        className={cn(
          "rounded px-2.5 py-1 font-medium transition-colors",
          view === "timeline"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Timeline
      </button>
    </div>
  ) : null;

  return (
    <Section title="Receipts" description={description} actions={actions}>
      {receipts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
          <p className="font-semibold text-foreground">No receipts found</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            No receipt records exist for this student yet.
          </p>
        </div>
      ) : view === "timeline" ? (
        <TimelineView
          timeline={timeline}
          activeSessionLabel={activeSessionLabel}
          canPrintReceipts={canPrintReceipts}
          encodedReturnTo={encodedReturnTo}
        />
      ) : (
        <BySessionView
          receiptsBySession={receiptsBySession}
          activeSessionLabel={activeSessionLabel}
          canPrintReceipts={canPrintReceipts}
          encodedReturnTo={encodedReturnTo}
        />
      )}
    </Section>
  );
}

function BySessionView({
  receiptsBySession,
  activeSessionLabel,
  canPrintReceipts,
  encodedReturnTo,
}: {
  receiptsBySession: SessionGroup[];
  activeSessionLabel: string | null;
  canPrintReceipts: boolean;
  encodedReturnTo: string;
}) {
  return (
    <div className="space-y-3">
      {receiptsBySession.map((group, groupIndex) => {
        const totalAmount = group.receipts.reduce((sum, r) => sum + r.totalAmount, 0);
        const isActive = group.sessionLabel === activeSessionLabel;
        const defaultOpen = isActive || groupIndex === 0;
        return (
          <details
            key={group.sessionLabel}
            open={defaultOpen}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-2/80">
              <span className="flex items-center gap-2">
                Session {group.sessionLabel}
                {isActive ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-soft-foreground">
                    Current
                  </span>
                ) : null}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {group.receipts.length} receipt{group.receipts.length === 1 ? "" : "s"} ·{" "}
                <Money value={totalAmount} size="xs" />
              </span>
            </summary>

            <div className="md:hidden divide-y divide-border/60">
              {group.receipts.map((receipt) => (
                <div key={receipt.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-semibold text-sm">
                      {receipt.receiptNumber}
                      {receipt.isReversed ? <ReversedBadge /> : null}
                    </span>
                    <span className={receipt.isReversed ? "line-through opacity-60" : undefined}>
                      <Money value={receipt.totalAmount} size="sm" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatShortDate(receipt.paymentDate)}</span>
                    <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium">
                      {receipt.paymentModeLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    {receipt.referenceNumber ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        Ref: {receipt.referenceNumber}
                      </span>
                    ) : <span />}
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
                      <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}>
                        {canPrintReceipts ? "Print" : "Open"}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Received by</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {group.receipts.map((receipt) => (
                    <tr key={receipt.id} className="even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <span className="flex items-center gap-1.5">
                          {receipt.receiptNumber}
                          {receipt.isReversed ? <ReversedBadge /> : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{formatShortDate(receipt.paymentDate)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium text-muted-foreground">
                          {receipt.paymentModeLabel}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-mono tabular-nums font-semibold text-foreground",
                          receipt.isReversed && "line-through opacity-60",
                        )}
                      >
                        <Money value={receipt.totalAmount} size="sm" />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{receipt.referenceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{receipt.receivedBy || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}>
                            {canPrintReceipts ? "Print" : "Open"}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function TimelineView({
  timeline,
  activeSessionLabel,
  canPrintReceipts,
  encodedReturnTo,
}: {
  timeline: ReceiptItem[];
  activeSessionLabel: string | null;
  canPrintReceipts: boolean;
  encodedReturnTo: string;
}) {
  let lastYear = "";
  return (
    <ol className="relative ml-3 border-l border-border">
      {timeline.map((receipt) => {
        const year = new Date(receipt.paymentDate).getFullYear().toString();
        const showYear = year !== lastYear;
        lastYear = year;
        const isCurrent = activeSessionLabel?.startsWith(year);
        return (
          <li key={receipt.id} className="mb-4 ml-5 last:mb-0">
            <span
              className={cn(
                "absolute -left-[7px] mt-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-card",
                isCurrent ? "border-accent" : "border-border",
              )}
              aria-hidden="true"
            />
            {showYear ? (
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {year}
              </p>
            ) : null}
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {receipt.receiptNumber}
                    {receipt.isReversed ? <ReversedBadge /> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatShortDate(receipt.paymentDate)} ·{" "}
                    <span className="font-medium">{receipt.paymentModeLabel}</span>
                    {receipt.referenceNumber ? (
                      <>
                        {" · "}
                        <span className="font-mono">Ref {receipt.referenceNumber}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={receipt.isReversed ? "line-through opacity-60" : undefined}>
                    <Money value={receipt.totalAmount} size="sm" />
                  </span>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
                    <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}>
                      {canPrintReceipts ? "Print" : "Open"}
                    </Link>
                  </Button>
                </div>
              </div>
              {receipt.receivedBy ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Received by {receipt.receivedBy}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
