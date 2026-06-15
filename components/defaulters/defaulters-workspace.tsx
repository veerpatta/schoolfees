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
import { HeatChip } from "@/components/defaulters/heat-chip";
import { NoCallToggle } from "@/components/defaulters/no-call-toggle";
import { PromiseChip } from "@/components/defaulters/promise-chip";
import { QuickLogButtons, type QuickLogKind } from "@/components/defaulters/quick-log-buttons";
import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { buildStudentPhoneEntries, type PhoneEntry } from "@/components/students/phone-chooser";
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
    () => callQueue.find((entry) => entry.row.studentId === selectedStudentId) ?? callQueue[0] ?? null,
    [callQueue, selectedStudentId],
  );
  const selectedRow = selectedEntry?.row ?? null;
  const selectedSummary = selectedRow ? effectiveSummaries[selectedRow.studentId] ?? null : null;
  const selectedIndex = selectedEntry
    ? Math.max(0, callQueue.findIndex((entry) => entry.row.studentId === selectedEntry.row.studentId))
    : -1;

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
    },
    [contactSummaries],
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

  return (
    <div className="space-y-4">
      <CallQueueHeader
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

      {bulkMode ? (
        <div className="rounded-lg border border-info-soft bg-info-soft px-3 py-2 text-sm font-medium text-info-soft-foreground">
          {t("callQueueWhatsappModeHint")}
        </div>
      ) : null}

      {callQueue.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("callQueueEmpty")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
            <section className="rounded-xl border border-border bg-card">
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

            <SelectedStudentPanel
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
          </div>

          <MobileNextBar
            selectedIndex={selectedIndex}
            total={callQueue.length}
            onPrevious={() => moveSelection(-1)}
            onNext={() => moveSelection(1)}
            hasPrevious={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < callQueue.length - 1}
          />
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
}: {
  activeCount: number;
  pendingAmount: number;
  promiseDueCount: number;
  exportHref: string;
  bulkMode: boolean;
  onStart: () => void;
  onToggleBulk: () => void;
}) {
  const t = useTranslations("Defaulters");
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid grid-cols-3 gap-2">
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
            <Link href={exportHref}>
              <Download className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("callQueueDownloadList")}</span>
              <span className="sm:hidden">{t("callQueueDownloadShort")}</span>
            </Link>
          </Button>
        </div>
      </div>
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
      <aside className="hidden rounded-xl border border-border bg-card p-5 lg:block">
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
    <aside className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4 lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-start justify-between gap-3">
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
        <HeatChip score={row.heat} />
      </div>

      <div className="mt-4 rounded-lg border border-warning-soft-foreground/20 bg-warning-soft/70 p-3">
        <p className="text-xs font-semibold uppercase text-warning-soft-foreground">
          {t("drawerOutstandingLabel")}
        </p>
        <div className="mt-1">
          <Money value={row.totalPending} size="display" tone="warning" />
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

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          asChild
          variant="accent"
          size="mobile"
          fullWidth
          aria-label={activeEntry ? t("collectorModeCall") : t("collectorModeNoPhone")}
        >
          <a href={activeEntry ? `tel:${activeEntry.phone}` : "#"}>
            <PhoneCall className="size-4" aria-hidden="true" />
            {t("collectorModeCall")}
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

function MobileNextBar({
  selectedIndex,
  total,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  selectedIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const t = useTranslations("Defaulters");
  return (
    <div className="sticky bottom-[calc(var(--mobile-safe-area-bottom)+72px)] z-20 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur lg:hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Button type="button" variant="outline" onClick={onPrevious} disabled={!hasPrevious}>
          {t("collectorModePrevious")}
        </Button>
        <span className="px-1 text-xs font-semibold text-muted-foreground">
          {t("callQueuePosition", { position: selectedIndex + 1, total })}
        </span>
        <Button type="button" variant="accent" onClick={onNext} disabled={!hasNext}>
          {t("callQueueNextStudent")}
        </Button>
      </div>
    </div>
  );
}
