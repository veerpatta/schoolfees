"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronRight,
  Download,
  ListChecks,
  MessageSquare,
  Phone,
  PhoneCall,
} from "lucide-react";

import { BulkRowCheckbox } from "@/components/defaulters/bulk-whatsapp-provider";
import { ContactNumbers } from "@/components/defaulters/contact-numbers";
import { ContactPopover } from "@/components/defaulters/contact-popover";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { NoCallToggle } from "@/components/defaulters/no-call-toggle";
import { PromiseChip } from "@/components/defaulters/promise-chip";
import { QuickLogButtons, type QuickLogKind } from "@/components/defaulters/quick-log-buttons";
import { OldBalanceChip } from "@/components/shared/old-balance-chip";
import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { buildStudentPhoneEntries, type PhoneEntry } from "@/components/students/phone-chooser";
import { DownloadAnchor } from "@/components/ui/download-anchor";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { formatInr } from "@/lib/helpers/currency";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";
import { type DefaulterContactSummary } from "@/lib/defaulters/cadence";
import {
  buildRecoveryDesk,
  type RecoveryDeskEntry,
} from "@/lib/defaulters/recovery";
import {
  buildDefaulterCallProgress,
  getRecoveryQueuePosition,
  getSelectedRecoveryEntry,
} from "@/lib/defaulters/workspace";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type Props = {
  rows: DefaulterSummaryRow[];
  sessionLabel: string;
  contactSummaries: Record<string, DefaulterContactSummary>;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
  canManageNoCall: boolean;
  exportHref: string;
};

const DEFAULT_SUMMARY: DefaulterContactSummary = {
  snoozeUntil: null,
  lastContactedAt: null,
};

/** Long enough for the optimistic outcome chip to register, short enough to
 *  keep the calling rhythm. */
const AUTO_ADVANCE_DELAY_MS = 450;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

function initialsOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`;
}

/**
 * How long the money has been late, in days.
 *
 * Replaces the raw heat score on the call card. Heat is a 0-100 ranking input
 * built from amount, age and contact history — useful for ordering the queue,
 * meaningless to read aloud. Days overdue is the fact the parent can be told,
 * and the tone still escalates so the card reads at a glance.
 */
function DaysOverdueChip({ days }: { days: number }) {
  const t = useTranslations("Defaulters");
  if (days <= 0) return null;

  const tone =
    days >= 60
      ? "border-destructive/60 bg-destructive/15 text-destructive"
      : days >= 30
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums",
        tone,
      )}
    >
      {t("daysOverdueLabel", { count: days })}
    </span>
  );
}

function defaultActiveEntry(
  entries: PhoneEntry[],
  summary: DefaulterContactSummary | null,
): PhoneEntry | null {
  if (entries.length === 0) return null;
  const suggested = summary?.suggestedPhoneLabel;
  if (suggested) {
    const match = entries.find((entry) => entry.label === suggested);
    if (match) return match;
  }
  return entries[0];
}

function patchForQuickLog(
  kind: QuickLogKind,
  defaultChannel: DefaulterContactSummary["lastChannel"],
  promisedDate: string | null,
  previous: DefaulterContactSummary,
): DefaulterContactSummary {
  const now = new Date().toISOString();
  switch (kind) {
    case "no_answer":
      return {
        ...previous,
        lastContactedAt: now,
        lastOutcome: "no_answer",
        lastChannel: defaultChannel ?? "call",
        noAnswerStreak: (previous.noAnswerStreak ?? 0) + 1,
        totalAttempts: (previous.totalAttempts ?? 0) + 1,
      };
    case "reached":
      return {
        ...previous,
        lastContactedAt: now,
        lastOutcome: "reached",
        lastChannel: defaultChannel ?? "call",
        noAnswerStreak: 0,
        totalAttempts: (previous.totalAttempts ?? 0) + 1,
      };
    case "promised":
      return {
        ...previous,
        lastContactedAt: now,
        lastOutcome: "promised_pay",
        lastChannel: defaultChannel ?? "call",
        snoozeUntil: promisedDate ?? previous.snoozeUntil,
        noAnswerStreak: 0,
        totalAttempts: (previous.totalAttempts ?? 0) + 1,
      };
  }
}

export function DefaultersWorkspace({
  rows,
  sessionLabel,
  contactSummaries,
  canPostPayments,
  canViewPaymentHistory,
  canManageNoCall,
  exportHref,
}: Props) {
  const t = useTranslations("Defaulters");
  const isDesktop = useIsDesktop();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullFormFor, setFullFormFor] = useState<DefaulterSummaryRow | null>(null);
  const [whatsAppFor, setWhatsAppFor] = useState<DefaulterSummaryRow | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [noCallOverlay, setNoCallOverlay] = useState<Record<string, boolean>>({});
  const [overlay, setOverlay] = useState<Record<string, DefaulterContactSummary>>({});
  /** Student ids in the order outcomes were logged this session (newest first). */
  const [loggedOrder, setLoggedOrder] = useState<string[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(true);
  /** Mobile call mode shows one family at a time; this reveals the queue. */
  const [mobileListOpen, setMobileListOpen] = useState(false);

  useEffect(() => {
    setOverlay({});
    setNoCallOverlay({});
  }, [contactSummaries, rows]);

  const effectiveNoCall = useCallback(
    (row: DefaulterSummaryRow) => noCallOverlay[row.studentId] ?? row.noCall ?? false,
    [noCallOverlay],
  );

  const effectiveSummaries = useMemo(() => {
    const merged: Record<string, DefaulterContactSummary> = { ...contactSummaries };
    for (const [id, patch] of Object.entries(overlay)) {
      merged[id] = patch;
    }
    return merged;
  }, [contactSummaries, overlay]);

  const today = useMemo(() => new Date(), []);
  const recoveryRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        noCall: effectiveNoCall(row),
      })),
    [rows, effectiveNoCall],
  );
  const recoveryDesk = useMemo(
    () =>
      buildRecoveryDesk({
        rows: recoveryRows,
        contactSummaries: effectiveSummaries,
        today,
      }),
    [recoveryRows, effectiveSummaries, today],
  );
  const callQueue = recoveryDesk.nextBestRows;

  useEffect(() => {
    if (selectedStudentId && callQueue.some((entry) => entry.row.studentId === selectedStudentId)) {
      return;
    }
    setSelectedStudentId(callQueue[0]?.row.studentId ?? null);
  }, [callQueue, selectedStudentId]);

  const selectedEntry = useMemo(
    () => getSelectedRecoveryEntry(callQueue, selectedStudentId),
    [callQueue, selectedStudentId],
  );
  const selectedRow = selectedEntry?.row ?? null;
  const selectedSummary = selectedRow ? effectiveSummaries[selectedRow.studentId] ?? null : null;
  const selectedIndex = getRecoveryQueuePosition(
    callQueue,
    selectedEntry?.row.studentId ?? null,
  );

  const handleQuickLog = useCallback(
    (
      studentId: string,
      kind: QuickLogKind,
      defaultChannel: DefaulterContactSummary["lastChannel"],
      promisedDate: string | null,
    ) => {
      setOverlay((prev) => {
        const previous = prev[studentId] ?? contactSummaries[studentId] ?? DEFAULT_SUMMARY;
        return {
          ...prev,
          [studentId]: patchForQuickLog(kind, defaultChannel, promisedDate, previous),
        };
      });

      // Remember the order outcomes were logged in, so the progress panel can
      // show a "Recent" feed without a round trip.
      setLoggedOrder((prev) => [studentId, ...prev.filter((id) => id !== studentId)]);

      // Call mode: logging an outcome for the family currently on screen moves
      // to the next one. Without this the 40-call list never advances itself
      // and the clerk has to hunt for their place after every call.
      if (autoAdvance && studentId === selectedStudentId) {
        // Let the optimistic chip land first so the outcome is visibly
        // recorded before the card changes underneath them.
        window.setTimeout(() => {
          setSelectedStudentId((current) => {
            if (current !== studentId) return current;
            const index = callQueue.findIndex((entry) => entry.row.studentId === studentId);
            if (index < 0) return current;
            return callQueue[index + 1]?.row.studentId ?? current;
          });
        }, AUTO_ADVANCE_DELAY_MS);
      }
    },
    [autoAdvance, callQueue, contactSummaries, selectedStudentId],
  );

  const handleQuickLogRevert = useCallback((studentId: string) => {
    setOverlay((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  }, []);

  const selectEntry = useCallback((entry: RecoveryDeskEntry) => {
    setSelectedStudentId(entry.row.studentId);
  }, []);

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (callQueue.length === 0) return;
      const current = selectedIndex >= 0 ? selectedIndex : 0;
      const next = Math.min(callQueue.length - 1, Math.max(0, current + direction));
      setSelectedStudentId(callQueue[next]?.row.studentId ?? null);
    },
    [callQueue, selectedIndex],
  );

  /** The next few families, so the clerk can see what's coming. */
  const upNext = useMemo(
    () => (selectedIndex >= 0 ? callQueue.slice(selectedIndex + 1, selectedIndex + 4) : []),
    [callQueue, selectedIndex],
  );

  /**
   * Progress for the phone hour. "Logged" counts families in today's queue
   * that now carry an outcome — from this session's optimistic overlay or
   * from a contact already recorded today.
   */
  const callProgress = useMemo(() => {
    return buildDefaulterCallProgress({
      queue: callQueue,
      summaries: effectiveSummaries,
      loggedOrder,
    });
  }, [callQueue, effectiveSummaries, loggedOrder]);

  const callPct =
    callProgress.total > 0
      ? Math.min(100, Math.round((callProgress.logged / callProgress.total) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Phone header (mobile app v2 §CALLS) ─────────────────────────
          The design puts the count and the progress bar in the header so the
          card being worked is the first thing under it. Everything that used
          to sit above it here — the page title, the standing office notice,
          the desk metric row, the progress panel with its "recent" list and
          auto-advance checkbox — is desk furniture, and on a 375px screen it
          pushed the one card this screen exists for below the fold. */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground">
              {t("callQueueTitle")}
            </h1>
            <p className="text-[11.5px] font-semibold text-muted-foreground">
              {t("callQueueListHint")}
            </p>
          </div>
          <p className="tabular shrink-0 text-sm font-extrabold text-foreground">
            {callProgress.logged}
            <span className="font-semibold text-muted-foreground">/{callProgress.total}</span>
          </p>
        </div>
        <div
          className="h-[7px] overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label={t("callProgressTitle")}
          aria-valuenow={callPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* Saffron, not green — this tracks calls made, and a call made is
              not money collected. Same reasoning as the desk panel. */}
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-expo"
            style={{ width: `${callPct}%` }}
          />
        </div>
      </div>

      {/* Actions drop below the card on a phone — the design opens on the
          family being called, not on a metric row. */}
      <CallQueueHeader
        className="max-md:order-3"
        activeCount={callQueue.length}
        pendingAmount={recoveryDesk.metrics.activePendingAmount}
        promiseDueCount={recoveryDesk.metrics.promiseDueRows}
        exportHref={exportHref}
        bulkMode={bulkMode}
        onStart={() => {
          if (callQueue[0]) {
            selectEntry(callQueue[0]);
            setDrawerOpen(false);
          }
        }}
        onToggleBulk={() => setBulkMode((current) => !current)}
      />

      {/* WhatsApp green, and on screen BEFORE anything is selected — the design
          treats "you can message this whole list" as standing information, not
          a consequence of already having ticked a row. An info-blue hint that
          only appeared after the first tick told the clerk something they had
          by then worked out for themselves. */}
      {bulkMode ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm font-medium text-success-soft-foreground max-md:order-4">
          <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
          <span>{t("callQueueWhatsappModeHint")}</span>
        </div>
      ) : null}

      {callQueue.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("callQueueEmpty")}
        </p>
      ) : (
        <>
          {/* [&>*]:min-w-0 — grid items default to min-width:auto, so a child
              whose min-content is wider than the phone (the call card's metric
              row) blew the implicit track out to 421px and gave the whole
              Calls screen 63px of sideways scroll. */}
          <div className="grid gap-4 [&>*]:min-w-0 max-md:order-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
            {/* Mobile is call mode: one family at a time. The full queue is
                one tap away but does not compete with the card being worked. */}
            <section
              className={cn(
                "rounded-xl border border-border bg-card",
                // `md`, not `lg`: the shell swaps to desktop chrome at 768,
                // and a screen that kept phone call-mode until 1024 gave
                // tablets desktop navigation over a phone layout.
                mobileListOpen ? "" : "hidden md:block",
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{t("callQueueListTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("callQueueListHint")}</p>
                </div>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {t("callQueuePosition", {
                    position: selectedIndex + 1,
                    total: callQueue.length,
                  })}
                </span>
              </div>
              <ul className="divide-y divide-border/70">
                {callQueue.map((entry) => (
                  <CallQueueRow
                    key={entry.row.studentId}
                    entry={entry}
                    summary={effectiveSummaries[entry.row.studentId] ?? null}
                    selected={selectedRow?.studentId === entry.row.studentId}
                    sessionLabel={sessionLabel}
                    bulkMode={bulkMode}
                    canManageNoCall={canManageNoCall}
                    noCall={effectiveNoCall(entry.row)}
                    onSelect={() => selectEntry(entry)}
                    onOpenWhatsapp={() => setWhatsAppFor(entry.row)}
                    onOpenFullForm={() => setFullFormFor(entry.row)}
                    onOptimisticLog={(kind, channel, promisedDate) =>
                      handleQuickLog(entry.row.studentId, kind, channel, promisedDate)
                    }
                    onLogRevert={() => handleQuickLogRevert(entry.row.studentId)}
                    onNoCallChange={(next) =>
                      setNoCallOverlay((prev) => ({ ...prev, [entry.row.studentId]: next }))
                    }
                    onNoCallRevert={(previous) =>
                      setNoCallOverlay((prev) => ({ ...prev, [entry.row.studentId]: previous }))
                    }
                  />
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-4">
            <CallProgressPanel
              className="max-md:order-2"
              logged={callProgress.logged}
              total={callProgress.total}
              promises={callProgress.promises}
              recent={callProgress.recent}
              autoAdvance={autoAdvance}
              onToggleAutoAdvance={() => setAutoAdvance((prev) => !prev)}
              mobileListOpen={mobileListOpen}
              onToggleMobileList={() => setMobileListOpen((prev) => !prev)}
            />

            <SelectedStudentPanel
              className="max-md:order-1"
              entry={selectedEntry}
              summary={selectedSummary}
              sessionLabel={sessionLabel}
              canPostPayments={canPostPayments}
              canManageNoCall={canManageNoCall}
              noCall={selectedRow ? effectiveNoCall(selectedRow) : false}
              onOpenDrawer={() => setDrawerOpen(true)}
              onOpenWhatsapp={() => {
                if (selectedRow) setWhatsAppFor(selectedRow);
              }}
              onOpenFullForm={() => {
                if (selectedRow) setFullFormFor(selectedRow);
              }}
              onPrevious={() => moveSelection(-1)}
              onNext={() => moveSelection(1)}
              hasPrevious={selectedIndex > 0}
              hasNext={selectedIndex >= 0 && selectedIndex < callQueue.length - 1}
              onOptimisticLog={(kind, channel, promisedDate) => {
                if (selectedRow) handleQuickLog(selectedRow.studentId, kind, channel, promisedDate);
              }}
              onLogRevert={() => {
                if (selectedRow) handleQuickLogRevert(selectedRow.studentId);
              }}
              onNoCallChange={(next) => {
                if (selectedRow) {
                  setNoCallOverlay((prev) => ({ ...prev, [selectedRow.studentId]: next }));
                }
              }}
              onNoCallRevert={(previous) => {
                if (selectedRow) {
                  setNoCallOverlay((prev) => ({ ...prev, [selectedRow.studentId]: previous }));
                }
              }}
            />

            {/* order 3: without it this defaults to 0 and lands above the
                card being worked, which is the opposite of "up next". */}
            <UpNextPanel
              className="max-md:order-3"
              entries={upNext}
              onSelect={(entry) => selectEntry(entry)}
              onSkip={() => moveSelection(1)}
              canSkip={selectedIndex >= 0 && selectedIndex < callQueue.length - 1}
            />
            </div>
          </div>
        </>
      )}

      <WorklistDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        row={selectedRow}
        sessionLabel={sessionLabel}
        contactSummary={selectedSummary}
        canPostPayments={canPostPayments}
        canViewPaymentHistory={canViewPaymentHistory}
        canManageNoCall={canManageNoCall}
        noCall={selectedRow ? effectiveNoCall(selectedRow) : false}
        side={isDesktop ? "right" : "bottom"}
        onOptimisticLog={(kind, channel, promisedDate) => {
          if (selectedRow) handleQuickLog(selectedRow.studentId, kind, channel, promisedDate);
        }}
        onLogRevert={() => {
          if (selectedRow) handleQuickLogRevert(selectedRow.studentId);
        }}
        onNoCallChange={(next) => {
          if (selectedRow) setNoCallOverlay((prev) => ({ ...prev, [selectedRow.studentId]: next }));
        }}
        onNoCallRevert={(previous) => {
          if (selectedRow) setNoCallOverlay((prev) => ({ ...prev, [selectedRow.studentId]: previous }));
        }}
      />

      {fullFormFor ? (
        <ContactPopover
          studentId={fullFormFor.studentId}
          studentName={fullFormFor.fullName}
          sessionLabel={sessionLabel}
          open={Boolean(fullFormFor)}
          onClose={() => setFullFormFor(null)}
          phoneEntries={buildStudentPhoneEntries({
            fatherPhone: fullFormFor.fatherPhone,
            motherPhone: fullFormFor.motherPhone,
          })}
          defaultPhoneLabel={effectiveSummaries[fullFormFor.studentId]?.suggestedPhoneLabel ?? null}
        />
      ) : null}

      {whatsAppFor ? (
        <WhatsAppDraftModal
          row={whatsAppFor}
          open={Boolean(whatsAppFor)}
          onClose={() => setWhatsAppFor(null)}
          sessionLabel={sessionLabel}
          autoLogStudentId={whatsAppFor.studentId}
        />
      ) : null}
    </div>
  );
}

function CallQueueHeader({
  activeCount,
  pendingAmount,
  promiseDueCount,
  exportHref,
  bulkMode,
  onStart,
  onToggleBulk,
  className,
}: {
  activeCount: number;
  pendingAmount: number;
  promiseDueCount: number;
  exportHref: string;
  bulkMode: boolean;
  onStart: () => void;
  onToggleBulk: () => void;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  return (
    <section className={cn("rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4", className)}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="hidden grid-cols-3 gap-2 md:grid">
          <QueueMetric label={t("callQueueMetricCallFirst")} value={String(activeCount)} />
          <QueueMetric
            label={t("callQueueMetricPending")}
            value={<Money value={pendingAmount} size="lg" tone="warning" compact />}
          />
          <QueueMetric label={t("callQueueMetricPromiseDue")} value={String(promiseDueCount)} />
        </div>
        <div className="grid grid-cols-3 gap-2 md:min-w-[440px]">
          <Button
            type="button"
            variant="accent"
            size="mobile"
            onClick={onStart}
            disabled={activeCount === 0}
            className="px-2"
          >
            <PhoneCall className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("callQueueStartCalling")}</span>
            <span className="sm:hidden">{t("callQueueStartShort")}</span>
          </Button>
          <Button
            type="button"
            variant={bulkMode ? "primary" : "outline"}
            size="mobile"
            onClick={onToggleBulk}
            className="px-2"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">
              {bulkMode ? t("callQueueWhatsappModeOff") : t("callQueueWhatsappDrafts")}
            </span>
            <span className="sm:hidden">WhatsApp</span>
          </Button>
          <Button asChild variant="outline" size="mobile" className="px-2">
            <DownloadAnchor href={exportHref} download>
              <Download className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("callQueueDownloadList")}</span>
              <span className="sm:hidden">{t("callQueueDownloadShort")}</span>
            </DownloadAnchor>
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Turns the phone hour into a finishable list: how many of today's families
 * carry an outcome, how many promised to pay, and what was just logged.
 */
function CallProgressPanel({
  logged,
  total,
  promises,
  recent,
  autoAdvance,
  onToggleAutoAdvance,
  mobileListOpen,
  onToggleMobileList,
  className,
}: {
  logged: number;
  total: number;
  promises: number;
  recent: Array<{ entry: RecoveryDeskEntry; summary: DefaulterContactSummary | null }>;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  mobileListOpen: boolean;
  onToggleMobileList: () => void;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  const pct = total > 0 ? Math.min(100, Math.round((logged / total) * 100)) : 0;

  return (
    <section className={cn("rounded-xl border border-border bg-card p-3 sm:p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("callProgressTitle")}</h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("callProgressLogged", { done: logged, total })}
          {promises > 0 ? ` · ${t("callProgressPromises", { count: promises })}` : ""}
        </p>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label={t("callProgressTitle")}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          /* Saffron, not green. Green reads as "resolved" — this bar tracks
             calls made, and a call made is not money collected. */
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-expo"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("callProgressRecent")}
        </p>
        {recent.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("callProgressEmpty")}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {recent.map(({ entry, summary }) => (
              <li
                key={entry.row.studentId}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {entry.row.fullName}
                </span>
                <ContactStatusChip summary={summary} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-border-strong"
            checked={autoAdvance}
            onChange={onToggleAutoAdvance}
          />
          <span>
            {t("callQueueAutoAdvance")}
            <span className="block text-[11px] text-muted-foreground">
              {t("callQueueAutoAdvanceHint")}
            </span>
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto md:hidden"
          onClick={onToggleMobileList}
        >
          {mobileListOpen ? t("callQueueHideFullList") : t("callQueueShowFullList")}
        </Button>
      </div>
    </section>
  );
}

/** The next few families in the queue, plus an explicit way to pass on one. */
function UpNextPanel({
  entries,
  onSelect,
  onSkip,
  canSkip,
  className,
}: {
  entries: RecoveryDeskEntry[];
  onSelect: (entry: RecoveryDeskEntry) => void;
  onSkip: () => void;
  canSkip: boolean;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  if (entries.length === 0) return null;

  return (
    <section className={cn("rounded-xl border border-border bg-card p-3 sm:p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("callQueueUpNext")}</h2>
        {canSkip ? (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            {t("callQueueSkipForNow")} →
          </Button>
        ) : null}
      </div>
      <ul className="mt-2 divide-y divide-border/70">
        {entries.map((entry) => (
          <li key={entry.row.studentId}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {entry.row.fullName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {entry.row.classLabel}
                </span>
              </span>
              <Money value={entry.row.totalPending} size="sm" tone="warning" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QueueMetric({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function CallQueueRow({
  entry,
  summary,
  selected,
  sessionLabel,
  bulkMode,
  canManageNoCall,
  noCall,
  onSelect,
  onOpenWhatsapp,
  onOpenFullForm,
  onOptimisticLog,
  onLogRevert,
  onNoCallChange,
  onNoCallRevert,
}: {
  entry: RecoveryDeskEntry;
  summary: DefaulterContactSummary | null;
  selected: boolean;
  sessionLabel: string;
  bulkMode: boolean;
  canManageNoCall: boolean;
  noCall: boolean;
  onSelect: () => void;
  onOpenWhatsapp: () => void;
  onOpenFullForm: () => void;
  onOptimisticLog: (
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: () => void;
  onNoCallChange: (noCall: boolean) => void;
  onNoCallRevert: (previous: boolean) => void;
}) {
  const t = useTranslations("Defaulters");
  const row = entry.row;
  const entries = useMemo(
    () => buildStudentPhoneEntries({ fatherPhone: row.fatherPhone, motherPhone: row.motherPhone }),
    [row.fatherPhone, row.motherPhone],
  );
  const activeEntry = defaultActiveEntry(entries, summary);
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";

  return (
    <li
      className={cn(
        "grid gap-3 px-3 py-3 transition-colors sm:px-4 xl:grid-cols-[minmax(0,1fr)_auto]",
        selected ? "bg-accent-soft/70" : "bg-card hover:bg-surface-2/70",
      )}
      /* The call queue is server-paginated but uncapped, and each row is
         heavy (phone chips, heat/promise badges, quick-log buttons). Skipping
         render work for off-screen rows is the same dependency-free technique
         already proven on the desktop student table. The intrinsic size keeps
         the scrollbar honest so there is no layout shift while scrolling. */
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 132px" } as React.CSSProperties}
    >
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2">
            {bulkMode ? (
              <span
                className="mt-1 shrink-0"
                onClick={(event) => event.stopPropagation()}
              >
                <BulkRowCheckbox
                  studentId={row.studentId}
                  ariaLabel={t("selectAriaLabel", { name: row.fullName })}
                />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                {row.fullName}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("studentMetaLine", {
                  classLabel: row.classLabel,
                  admissionNo: row.admissionNo,
                })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <ContactStatusChip summary={summary} />
                <PromiseChip status={row.promiseStatus} />
                <OldBalanceChip amount={row.prevYearDuesAmount} label={t("oldBalanceLabel")} />
                {noCall ? (
                  <NoCallToggle
                    studentId={row.studentId}
                    sessionLabel={sessionLabel}
                    noCall
                    canManage={false}
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <Money value={row.totalPending} size="lg" tone="warning" />
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              {entry.reasons[0] ?? t("callQueueReasonDefault")}
            </p>
          </div>
        </div>
      </button>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr] xl:w-[420px] xl:grid-cols-[auto_1fr] xl:items-start">
        <div className="flex flex-wrap gap-1.5">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={activeEntry ? t("collectorModeCall") : t("collectorModeNoPhone")}
          >
            <a href={activeEntry ? `tel:${activeEntry.phone}` : "#"}>
              <Phone className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={onOpenWhatsapp}
            aria-label={t("drawerWhatsApp")}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
          </Button>
          {canManageNoCall ? (
            <NoCallToggle
              studentId={row.studentId}
              sessionLabel={sessionLabel}
              noCall={noCall}
              canManage={canManageNoCall}
              onOptimisticChange={onNoCallChange}
              onRevert={onNoCallRevert}
            />
          ) : null}
        </div>
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
          activePhone={activeEntry?.phone ?? null}
          activeLabel={activeEntry?.label ?? null}
          compact
          onOpenFullForm={onOpenFullForm}
          onOptimisticLog={onOptimisticLog}
          onLogRevert={onLogRevert}
        />
      </div>
    </li>
  );
}

function SelectedStudentPanel({
  entry,
  summary,
  sessionLabel,
  canPostPayments,
  canManageNoCall,
  noCall,
  onOpenDrawer,
  onOpenWhatsapp,
  onOpenFullForm,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onOptimisticLog,
  onLogRevert,
  onNoCallChange,
  onNoCallRevert,
  className,
}: {
  entry: RecoveryDeskEntry | null;
  summary: DefaulterContactSummary | null;
  sessionLabel: string;
  canPostPayments: boolean;
  canManageNoCall: boolean;
  noCall: boolean;
  onOpenDrawer: () => void;
  onOpenWhatsapp: () => void;
  onOpenFullForm: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onOptimisticLog: (
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: () => void;
  onNoCallChange: (noCall: boolean) => void;
  onNoCallRevert: (previous: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  const row = entry?.row ?? null;
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const phoneEntries = useMemo(
    () =>
      row
        ? buildStudentPhoneEntries({ fatherPhone: row.fatherPhone, motherPhone: row.motherPhone })
        : [],
    [row],
  );

  useEffect(() => {
    if (!row) return;
    setActiveLabel(defaultActiveEntry(phoneEntries, summary)?.label ?? null);
  }, [row, phoneEntries, summary]);

  if (!row || !entry) {
    return (
      <aside className={cn("hidden rounded-xl border border-border bg-card p-5 lg:block", className)}>
        <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-surface-2 p-6 text-center">
          <div>
            <ListChecks className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-semibold text-foreground">{t("desktopPickStudent")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("desktopPickHint")}</p>
          </div>
        </div>
      </aside>
    );
  }

  const activeEntry = phoneEntries.find((entry) => entry.label === activeLabel) ?? null;
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";
  const paymentHref = appendSessionParam(
    `/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`,
    sessionLabel,
  );

  return (
    <aside className={cn("rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 lg:sticky lg:top-4 lg:self-start", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Initials circle, as on every other person row in the app. */}
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold uppercase text-accent-soft-foreground"
          >
            {initialsOf(row.fullName)}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {t("callQueueSelectedTitle")}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{row.fullName}</h2>
            <p className="text-sm text-muted-foreground">
              {t("studentMetaLine", {
                classLabel: row.classLabel,
                admissionNo: row.admissionNo,
              })}
            </p>
          </div>
        </div>
        {/* Days overdue, not the 0-100 heat score. The score is an internal
            ranking input; "41 days" is the number a clerk can say out loud on
            the call. Heat still orders the queue, it just stopped being the
            thing on screen. */}
        <DaysOverdueChip days={row.daysOverdue} />
      </div>

      <div className="mt-4 rounded-lg border border-warning-soft-foreground/20 bg-warning-soft/70 p-3">
        <p className="text-xs font-semibold uppercase text-warning-soft-foreground">
          {t("drawerOutstandingLabel")}
        </p>
        <div className="mt-1">
          {/* font-display-money: every other hero figure in the app is set in
              the display face, and this one was the odd sans-serif out. */}
          <Money
            value={row.totalPending}
            size="display"
            tone="warning"
            className="font-display-money"
          />
        </div>
        {row.overdueAmount > 0 ? (
          <p className="mt-1 text-sm font-medium text-destructive">
            {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <ContactStatusChip summary={summary} />
        <PromiseChip status={row.promiseStatus} />
        <OldBalanceChip amount={row.prevYearDuesAmount} label={t("oldBalanceLabel")} />
        <NoCallToggle
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          noCall={noCall}
          canManage={canManageNoCall}
          onOptimisticChange={onNoCallChange}
          onRevert={onNoCallRevert}
        />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">
          {t("drawerCallNumber")}
        </p>
        <ContactNumbers
          entries={phoneEntries}
          activeLabel={activeLabel}
          onSelect={(entry) => setActiveLabel(entry.label)}
          summary={summary}
          stopPropagation={false}
        />
      </div>

      {/* 1.45fr / 1fr, per the design: calling is the job, WhatsApp is the
          fallback when nobody picks up. Equal halves said they were equals. */}
      <div className="mt-4 grid grid-cols-[1.45fr_1fr] gap-2">
        <Button
          asChild
          variant="accent"
          size="mobile"
          fullWidth
          aria-label={activeEntry ? t("collectorModeCall") : t("collectorModeNoPhone")}
        >
          <a href={activeEntry ? `tel:${activeEntry.phone}` : "#"}>
            <PhoneCall className="size-4" aria-hidden="true" />
            {/* The number itself, per the design: a clerk reads it back to the
                parent, and it is the confirmation that the right one of two
                numbers is selected before the call is placed. */}
            <span className="truncate">{activeEntry?.phone ?? t("collectorModeCall")}</span>
          </a>
        </Button>
        <Button type="button" variant="outline" size="mobile" fullWidth onClick={onOpenWhatsapp}>
          <MessageSquare className="size-4" aria-hidden="true" />
          {t("drawerWhatsApp")}
        </Button>
      </div>

      <div className="mt-3">
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
          activePhone={activeEntry?.phone ?? null}
          activeLabel={activeEntry?.label ?? null}
          onOpenFullForm={onOpenFullForm}
          onOptimisticLog={onOptimisticLog}
          onLogRevert={onLogRevert}
        />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {t("callQueueWhy")}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {(entry.reasons.length > 0 ? entry.reasons : [t("callQueueReasonDefault")]).slice(0, 4).map((reason) => (
            <li key={reason} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={onOpenDrawer} fullWidth>
          {t("callQueueOpenDetails")}
        </Button>
        {canPostPayments ? (
          <Button asChild variant="outline" fullWidth>
            <Link href={paymentHref}>{t("collectAction")}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" fullWidth>
            <Link href={appendSessionParam(`/protected/students/${row.studentId}`, sessionLabel)}>
              {t("viewAction")}
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-3 hidden grid-cols-2 gap-2 lg:grid">
        <Button type="button" variant="ghost" onClick={onPrevious} disabled={!hasPrevious}>
          {t("collectorModePrevious")}
        </Button>
        <Button type="button" variant="ghost" onClick={onNext} disabled={!hasNext}>
          {t("collectorModeNext")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
