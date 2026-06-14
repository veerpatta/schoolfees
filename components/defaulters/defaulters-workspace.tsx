"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  MessageSquare,
  PhoneCall,
  PhoneOff,
  Snowflake,
  Users,
  X,
} from "lucide-react";

import { BulkRowCheckbox } from "@/components/defaulters/bulk-whatsapp-provider";
import { BehaviorBadge } from "@/components/defaulters/behavior-badge";
import { ContactNumbers } from "@/components/defaulters/contact-numbers";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { PromiseChip } from "@/components/defaulters/promise-chip";
import { HeatChip } from "@/components/defaulters/heat-chip";
import { NoCallToggle } from "@/components/defaulters/no-call-toggle";
import { QuickLogButtons, type QuickLogKind } from "@/components/defaulters/quick-log-buttons";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { ContactPopover } from "@/components/defaulters/contact-popover";
import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";
import { buildStudentPhoneEntries, type PhoneEntry } from "@/components/students/phone-chooser";
import { Money } from "@/components/ui/money";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";
import { buildCollectorSession, type CollectorSession } from "@/lib/defaulters/collector";
import {
  deriveCadence,
  tallyCadence,
  type Cadence,
  type CadenceCounts,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import {
  buildRecoveryDesk,
  type RecoveryDesk,
  type RecoveryDeskEntry,
  type RecoveryLaneId,
} from "@/lib/defaulters/recovery";
import {
  buildPreDueReminderList,
  type PreDueReminderEntry,
  type PreDueReminderList,
} from "@/lib/defaulters/pre-due";
import { PAYMENT_BEHAVIORS, type PaymentBehavior } from "@/lib/defaulters/behavior";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type SortMode = "smart" | "dues";

/** How many cards to render before "Show more" (keeps the mobile DOM light). */
const RENDER_CHUNK = 60;
/** No-answer streak at which we nudge staff to switch to WhatsApp. */
const WHATSAPP_NUDGE_STREAK = 3;

/** Detect lg breakpoint (≥1024px) for side-sheet selection. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/** Pick the active phone entry for a row, defaulting to the suggested number. */
function defaultActiveEntry(
  entries: PhoneEntry[],
  summary: DefaulterContactSummary | null,
): PhoneEntry | null {
  if (entries.length === 0) return null;
  const suggested = summary?.suggestedPhoneLabel;
  if (suggested) {
    const match = entries.find((e) => e.label === suggested);
    if (match) return match;
  }
  return entries[0];
}

type Props = {
  rows: DefaulterSummaryRow[];
  sessionLabel: string;
  /** Map studentId → contact summary. Plain object for client serialization. */
  contactSummaries: Record<string, DefaulterContactSummary>;
  /** Initial active cadence from the URL on first render. */
  initialCadence: string;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
  /** Admin-only: can toggle the per-session no-call flag. */
  canManageNoCall: boolean;
};

const DEFAULT_SUMMARY: DefaulterContactSummary = {
  snoozeUntil: null,
  lastContactedAt: null,
};

/** Quick-log outcome → optimistic summary patch applied to the local overlay. */
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
  initialCadence,
  canPostPayments,
  canViewPaymentHistory,
  canManageNoCall,
}: Props) {
  const t = useTranslations("Defaulters");
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullFormFor, setFullFormFor] = useState<DefaulterSummaryRow | null>(null);
  const [whatsAppFor, setWhatsAppFor] = useState<DefaulterSummaryRow | null>(null);
  const [collectorOpen, setCollectorOpen] = useState(false);
  const [collectorStudentId, setCollectorStudentId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const [activeCadence, setActiveCadence] = useState<string>(initialCadence);
  const [behaviorFilter, setBehaviorFilter] = useState<PaymentBehavior | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  /** Optimistic overrides for the no-call flag, keyed by studentId. */
  const [noCallOverlay, setNoCallOverlay] = useState<Record<string, boolean>>({});

  /**
   * Local overlay on top of the server-supplied contact summaries — keyed by
   * studentId. When the officer taps a quick-log button we patch this
   * immediately so the card moves bucket without waiting for the server.
   */
  const [overlay, setOverlay] = useState<Record<string, DefaulterContactSummary>>({});

  // Reset overlays when the underlying server data changes (page nav).
  useEffect(() => {
    setOverlay({});
    setNoCallOverlay({});
  }, [contactSummaries, rows]);

  const effectiveNoCall = useCallback(
    (row: DefaulterSummaryRow) => noCallOverlay[row.studentId] ?? row.noCall ?? false,
    [noCallOverlay],
  );

  const handleNoCallChange = useCallback((studentId: string, noCall: boolean) => {
    setNoCallOverlay((prev) => ({ ...prev, [studentId]: noCall }));
  }, []);

  const handleNoCallRevert = useCallback((studentId: string, previous: boolean) => {
    setNoCallOverlay((prev) => ({ ...prev, [studentId]: previous }));
  }, []);

  const effectiveSummaries: Record<string, DefaulterContactSummary> = useMemo(() => {
    const merged: Record<string, DefaulterContactSummary> = { ...contactSummaries };
    for (const [id, patch] of Object.entries(overlay)) {
      merged[id] = patch;
    }
    return merged;
  }, [contactSummaries, overlay]);

  // Compute cadence + counts purely on the client.
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
  const collectorSession = useMemo(
    () => buildCollectorSession(recoveryDesk.nextBestRows, collectorStudentId),
    [recoveryDesk.nextBestRows, collectorStudentId],
  );
  const preDueReminders = useMemo(
    () =>
      buildPreDueReminderList({
        rows: recoveryRows,
        today,
        windowDays: 14,
      }),
    [recoveryRows, today],
  );
  const rowsWithCadence: { row: DefaulterSummaryRow; cadence: Cadence }[] = useMemo(
    () =>
      rows.map((row) => ({
        row,
        cadence: deriveCadence(effectiveSummaries[row.studentId] ?? DEFAULT_SUMMARY, today),
      })),
    [rows, effectiveSummaries, today],
  );

  // No-call students are kept out of the active call buckets and counted under
  // their own segment, so the office never rings a parent the admin exempted.
  const cadenceCounts: CadenceCounts = useMemo(
    () =>
      tallyCadence(
        rows
          .filter((row) => !effectiveNoCall(row))
          .map((row) => effectiveSummaries[row.studentId] ?? DEFAULT_SUMMARY),
        today,
      ),
    [rows, effectiveSummaries, effectiveNoCall, today],
  );

  const noCallCount = useMemo(
    () => rows.filter((row) => effectiveNoCall(row)).length,
    [rows, effectiveNoCall],
  );

  const visibleRows = useMemo(() => {
    const bySegment =
      activeCadence === "noCall"
        ? rowsWithCadence.filter(({ row }) => effectiveNoCall(row))
        : rowsWithCadence
            .filter(({ row }) => !effectiveNoCall(row))
            .filter(({ cadence }) => activeCadence === "all" || cadence === activeCadence);

    const byBehavior =
      behaviorFilter === "all"
        ? bySegment
        : bySegment.filter(({ row }) => row.paymentBehavior === behaviorFilter);

    if (sortMode === "dues") {
      return [...byBehavior].sort((a, b) => {
        if (b.row.totalPending !== a.row.totalPending) {
          return b.row.totalPending - a.row.totalPending;
        }
        return a.row.fullName.localeCompare(b.row.fullName);
      });
    }
    // "smart" preserves the server-supplied heat ordering.
    return byBehavior;
  }, [rowsWithCadence, activeCadence, behaviorFilter, sortMode, effectiveNoCall]);

  // Client-side incremental rendering: the server returns the whole list so
  // filters stay list-wide, but we only paint a chunk at a time.
  const [renderLimit, setRenderLimit] = useState(RENDER_CHUNK);
  useEffect(() => {
    setRenderLimit(RENDER_CHUNK);
  }, [activeCadence, behaviorFilter, sortMode]);
  const pagedRows = useMemo(
    () => visibleRows.slice(0, renderLimit),
    [visibleRows, renderLimit],
  );
  const hasMore = visibleRows.length > renderLimit;

  // Persist cadence to URL via shallow history update — no server re-render.
  const handleCadenceChange = useCallback((next: string) => {
    setActiveCadence(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "now") {
      url.searchParams.delete("cadence");
    } else {
      url.searchParams.set("cadence", next);
    }
    url.searchParams.delete("page");
    window.history.replaceState(null, "", url.toString());
  }, []);

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

  const handleQuickLogRevert = useCallback(
    (studentId: string) => {
      setOverlay((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    },
    [],
  );

  const activeRow = useMemo(
    () => rows.find((row) => row.studentId === activeStudentId) ?? null,
    [rows, activeStudentId],
  );
  const activeSummary = activeRow
    ? effectiveSummaries[activeRow.studentId] ?? null
    : null;

  function openDrawer(row: DefaulterSummaryRow) {
    setActiveStudentId(row.studentId);
    setDrawerOpen(true);
  }

  function openCollector() {
    setCollectorStudentId(recoveryDesk.nextBestRows[0]?.row.studentId ?? null);
    setCollectorOpen(true);
  }

  return (
    <div className="space-y-3">
      <RecoveryDeskPanel
        desk={recoveryDesk}
        onOpenStudent={openDrawer}
        onStartCollector={openCollector}
      />
      {collectorOpen ? (
        <CollectorModePanel
          session={collectorSession}
          sessionLabel={sessionLabel}
          summaries={effectiveSummaries}
          onClose={() => setCollectorOpen(false)}
          onPrevious={(studentId) => setCollectorStudentId(studentId)}
          onNext={(studentId) => setCollectorStudentId(studentId)}
          onOpenStudent={openDrawer}
          onOpenFullForm={setFullFormFor}
          onOpenWhatsApp={setWhatsAppFor}
          onOptimisticLog={(studentId, kind, defaultChannel, promisedDate) => {
            handleQuickLog(studentId, kind, defaultChannel, promisedDate);
            if (collectorSession.nextStudentId) {
              setCollectorStudentId(collectorSession.nextStudentId);
            }
          }}
          onLogRevert={handleQuickLogRevert}
        />
      ) : null}
      <PreDueReminderPanel reminders={preDueReminders} onOpenStudent={openDrawer} />

      <CadenceTabs
        counts={cadenceCounts}
        noCallCount={noCallCount}
        active={activeCadence}
        onSelect={handleCadenceChange}
      />

      <ControlBar
        behaviorFilter={behaviorFilter}
        onBehaviorChange={setBehaviorFilter}
        sortMode={sortMode}
        onSortChange={setSortMode}
      />

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
          {t("emptyDefaulters")}
        </p>
      ) : (
        <>
          {/* ── Mobile card list ── */}
          <div className="space-y-2 lg:hidden">
            {pagedRows.map(({ row }) => (
              <DefaulterCard
                key={row.studentId}
                row={row}
                summary={effectiveSummaries[row.studentId] ?? null}
                sessionLabel={sessionLabel}
                canManageNoCall={canManageNoCall}
                noCall={effectiveNoCall(row)}
                onOpenDrawer={() => openDrawer(row)}
                onOpenFullForm={() => setFullFormFor(row)}
                onOptimisticLog={(kind, defaultChannel, promisedDate) =>
                  handleQuickLog(row.studentId, kind, defaultChannel, promisedDate)
                }
                onLogRevert={() => handleQuickLogRevert(row.studentId)}
                onNoCallChange={(next) => handleNoCallChange(row.studentId, next)}
                onNoCallRevert={(previous) => handleNoCallRevert(row.studentId, previous)}
              />
            ))}
            {hasMore ? (
              <button
                type="button"
                onClick={() => setRenderLimit((n) => n + RENDER_CHUNK)}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface-3"
              >
                {t("showMore", { count: visibleRows.length - renderLimit })}
              </button>
            ) : null}
          </div>

          {/* ── Desktop compact list — click row to open detail sheet ── */}
          <div className="hidden rounded-xl border border-border bg-card overflow-hidden lg:block">
            <ul className="divide-y divide-border/60">
              {pagedRows.map(({ row }) => (
                <DesktopListRow
                  key={row.studentId}
                  row={row}
                  summary={effectiveSummaries[row.studentId] ?? null}
                  sessionLabel={sessionLabel}
                  noCall={effectiveNoCall(row)}
                  onClick={() => openDrawer(row)}
                />
              ))}
            </ul>
            {hasMore ? (
              <button
                type="button"
                onClick={() => setRenderLimit((n) => n + RENDER_CHUNK)}
                className="w-full border-t border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface-2"
              >
                {t("showMore", { count: visibleRows.length - renderLimit })}
              </button>
            ) : null}
          </div>
        </>
      )}

      <WorklistDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        row={activeRow}
        sessionLabel={sessionLabel}
        contactSummary={activeSummary}
        canPostPayments={canPostPayments}
        canViewPaymentHistory={canViewPaymentHistory}
        canManageNoCall={canManageNoCall}
        noCall={activeRow ? effectiveNoCall(activeRow) : false}
        side={isDesktop ? "right" : "bottom"}
        onOptimisticLog={(kind, defaultChannel, promisedDate) => {
          if (activeRow) {
            handleQuickLog(activeRow.studentId, kind, defaultChannel, promisedDate);
          }
        }}
        onLogRevert={() => {
          if (activeRow) handleQuickLogRevert(activeRow.studentId);
        }}
        onNoCallChange={(next) => {
          if (activeRow) handleNoCallChange(activeRow.studentId, next);
        }}
        onNoCallRevert={(previous) => {
          if (activeRow) handleNoCallRevert(activeRow.studentId, previous);
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

/* -------------------------------------------------------------------------- */
/* Pre-due reminders                                                           */
/* -------------------------------------------------------------------------- */

function PreDueReminderPanel({
  reminders,
  onOpenStudent,
}: {
  reminders: PreDueReminderList;
  onOpenStudent: (row: DefaulterSummaryRow) => void;
}) {
  const t = useTranslations("Defaulters");
  const previewRows = reminders.entries.slice(0, 5);

  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("preDueTitle")}</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            {t("preDueDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("preDueMetricTotal")}
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {reminders.metrics.totalRows}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-4">
        <RecoveryMetric
          label={t("preDueMetricToday")}
          value={reminders.metrics.dueTodayRows.toString()}
        />
        <RecoveryMetric
          label={t("preDueMetric7Days")}
          value={reminders.metrics.next7DaysRows.toString()}
        />
        <RecoveryMetric
          label={t("preDueMetric14Days")}
          value={reminders.metrics.next14DaysRows.toString()}
        />
        <RecoveryMetric
          label={t("preDueMetricAmount")}
          value={formatInr(reminders.metrics.totalAmount)}
        />
      </div>

      {previewRows.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          {t("preDueEmpty")}
        </p>
      ) : (
        <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {previewRows.map((entry) => (
            <PreDueReminderRow
              key={entry.row.studentId}
              entry={entry}
              onOpen={() => onOpenStudent(entry.row)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PreDueReminderRow({
  entry,
  onOpen,
}: {
  entry: PreDueReminderEntry;
  onOpen: () => void;
}) {
  const t = useTranslations("Defaulters");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-h-28 rounded-lg border border-border bg-surface-2 p-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{entry.row.fullName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("studentMetaLine", {
              classLabel: entry.row.classLabel,
              admissionNo: entry.row.admissionNo,
            })}
          </p>
        </div>
        <Money value={entry.row.nextDueAmount ?? 0} size="sm" tone="neutral" />
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        {entry.daysUntilDue === 0
          ? t("preDueDueToday")
          : t("preDueDueInDays", { count: entry.daysUntilDue })}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-foreground">
        {t("preDueRowAction")}
      </p>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Daily recovery desk                                                         */
/* -------------------------------------------------------------------------- */

const RECOVERY_LANES: { id: RecoveryLaneId; i18nKey: string; Icon: typeof Flame }[] = [
  { id: "brokenPromise", i18nKey: "recoveryLaneBrokenPromise", Icon: AlertTriangle },
  { id: "promiseDue", i18nKey: "recoveryLanePromiseDue", Icon: Clock },
  { id: "notResponding", i18nKey: "recoveryLaneNotResponding", Icon: PhoneOff },
  { id: "highExposure", i18nKey: "recoveryLaneHighExposure", Icon: Flame },
  { id: "familyExposure", i18nKey: "recoveryLaneFamilyExposure", Icon: Users },
];

function RecoveryDeskPanel({
  desk,
  onOpenStudent,
  onStartCollector,
}: {
  desk: RecoveryDesk;
  onOpenStudent: (row: DefaulterSummaryRow) => void;
  onStartCollector: () => void;
}) {
  const t = useTranslations("Defaulters");
  const previewRows = desk.nextBestRows.slice(0, 5);

  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("recoveryDeskTitle")}</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            {t("recoveryDeskDescription")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStartCollector}
            disabled={desk.nextBestRows.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PhoneCall className="size-4" aria-hidden="true" />
            {t("collectorModeStart")}
          </button>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("recoveryMetricActive")}
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground">
              {desk.metrics.activeRecoveryRows}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 grid-cols-3">
        <RecoveryMetric
          label={t("recoveryMetricPromiseDue")}
          value={desk.metrics.promiseDueRows.toString()}
        />
        <RecoveryMetric
          label={t("recoveryMetricNoAnswer")}
          value={desk.metrics.notRespondingRows.toString()}
        />
        <RecoveryMetric
          label={t("recoveryMetricNoCall")}
          value={desk.metrics.noCallRows.toString()}
        />
      </div>

      <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
        <RecoveryMetric
          label={t("recoveryMetricRecoveryRate")}
          value={t("recoveryRateValue", { rate: desk.metrics.recoveryRate })}
        />
        <RecoveryMetric
          label={t("recoveryMetricPromiseKeptRate")}
          value={
            desk.metrics.promiseKeptRate === null
              ? t("recoveryNoPromiseHistory")
              : t("recoveryRateValue", { rate: desk.metrics.promiseKeptRate })
          }
        />
        <RecoveryMetric
          label={t("recoveryAging030")}
          value={formatInr(desk.metrics.agingBuckets.currentTo30.pendingAmount)}
          detail={t("recoveryAgingRows", {
            count: desk.metrics.agingBuckets.currentTo30.rows,
          })}
        />
        <RecoveryMetric
          label={t("recoveryAging3160")}
          value={formatInr(desk.metrics.agingBuckets.days31To60.pendingAmount)}
          detail={t("recoveryAgingRows", {
            count: desk.metrics.agingBuckets.days31To60.rows,
          })}
        />
        <RecoveryMetric
          label={t("recoveryAging6190")}
          value={formatInr(desk.metrics.agingBuckets.days61To90.pendingAmount)}
          detail={t("recoveryAgingRows", {
            count: desk.metrics.agingBuckets.days61To90.rows,
          })}
        />
        <RecoveryMetric
          label={t("recoveryAging91Plus")}
          value={formatInr(desk.metrics.agingBuckets.days91Plus.pendingAmount)}
          detail={t("recoveryAgingRows", {
            count: desk.metrics.agingBuckets.days91Plus.rows,
          })}
        />
      </div>

      <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {RECOVERY_LANES.map(({ id, i18nKey, Icon }) => {
          const lane = desk.lanes[id];
          return (
            <div key={id} className="rounded-lg border border-border bg-surface-2 p-2">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  {t(i18nKey)}
                </p>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                  {lane.rows.length}
                </span>
              </div>
              <div className="mt-2">
                <Money value={lane.totalPending} size="sm" tone="warning" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t("recoveryNextBestTitle")}</h3>
          <span className="text-xs text-muted-foreground">
            {formatInr(desk.metrics.activePendingAmount)}
          </span>
        </div>
        {previewRows.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
            {t("recoveryNextBestEmpty")}
          </p>
        ) : (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {previewRows.map((entry) => (
              <RecoveryRow
                key={entry.row.studentId}
                entry={entry}
                onOpen={() => onOpenStudent(entry.row)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Collector mode                                                              */
/* -------------------------------------------------------------------------- */

function CollectorModePanel({
  session,
  sessionLabel,
  summaries,
  onClose,
  onPrevious,
  onNext,
  onOpenStudent,
  onOpenFullForm,
  onOpenWhatsApp,
  onOptimisticLog,
  onLogRevert,
}: {
  session: CollectorSession;
  sessionLabel: string;
  summaries: Record<string, DefaulterContactSummary>;
  onClose: () => void;
  onPrevious: (studentId: string) => void;
  onNext: (studentId: string) => void;
  onOpenStudent: (row: DefaulterSummaryRow) => void;
  onOpenFullForm: (row: DefaulterSummaryRow) => void;
  onOpenWhatsApp: (row: DefaulterSummaryRow) => void;
  onOptimisticLog: (
    studentId: string,
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: (studentId: string) => void;
}) {
  const t = useTranslations("Defaulters");
  const current = session.current;
  const row = current?.row ?? null;
  const summary = row ? summaries[row.studentId] ?? null : null;
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";
  const entries = useMemo(
    () =>
      buildStudentPhoneEntries({
        fatherPhone: row?.fatherPhone ?? null,
        motherPhone: row?.motherPhone ?? null,
      }),
    [row?.fatherPhone, row?.motherPhone],
  );
  const [activeLabel, setActiveLabel] = useState<string | null>(
    () => defaultActiveEntry(entries, summary)?.label ?? null,
  );

  useEffect(() => {
    setActiveLabel(defaultActiveEntry(entries, summary)?.label ?? null);
  }, [entries, summary, row?.studentId]);

  const activePhone = entries.find((entry) => entry.label === activeLabel)?.phone ?? null;

  return (
    <section className="rounded-lg border border-accent/40 bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{t("collectorModeTitle")}</h2>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
              {t("collectorModeProgress", {
                position: session.position,
                total: session.total,
              })}
            </span>
          </div>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            {t("collectorModeDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-surface-3"
        >
          <X className="size-4" aria-hidden="true" />
          {t("collectorModeClose")}
        </button>
      </div>

      {!row || !current ? (
        <p className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          {t("collectorModeEmpty")}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">{row.fullName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("studentMetaLine", {
                    classLabel: row.classLabel,
                    admissionNo: row.admissionNo,
                  })}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ContactStatusChip summary={summary} />
                  <BehaviorBadge behavior={row.paymentBehavior} />
                  <PromiseChip status={row.promiseStatus} />
                  <HeatChip score={row.heat} />
                </div>
              </div>
              <div className="shrink-0 text-left md:text-right">
                <Money value={row.totalPending} size="lg" tone="warning" />
                {row.overdueAmount > 0 ? (
                  <p className="text-xs font-medium text-destructive">
                    {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <ContactNumbers
                entries={entries}
                activeLabel={activeLabel}
                onSelect={(entry) => setActiveLabel(entry.label)}
                summary={summary}
              />
            </div>

            {current.reasons.length > 0 ? (
              <div className="mt-3 rounded-md border border-border bg-card px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("collectorModeReasons")}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {current.reasons.slice(0, 3).join(" / ")}
                </p>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {activePhone ? (
                <a
                  href={`tel:${activePhone}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
                >
                  <PhoneCall className="size-4" aria-hidden="true" />
                  {t("collectorModeCall")}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground"
                >
                  <PhoneOff className="size-4" aria-hidden="true" />
                  {t("collectorModeNoPhone")}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenWhatsApp(row)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-3"
              >
                <MessageSquare className="size-4" aria-hidden="true" />
                {t("collectorModeWhatsapp")}
              </button>
              <button
                type="button"
                onClick={() => onOpenStudent(row)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-3"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
                {t("collectorModeOpenDetails")}
              </button>
            </div>

            <div className="mt-3">
              <QuickLogButtons
                studentId={row.studentId}
                sessionLabel={sessionLabel}
                defaultChannel={defaultChannel}
                activePhone={activePhone}
                activeLabel={activeLabel}
                onOpenFullForm={() => onOpenFullForm(row)}
                onOptimisticLog={(kind, channel, promisedDate) =>
                  onOptimisticLog(row.studentId, kind, channel, promisedDate)
                }
                onLogRevert={() => onLogRevert(row.studentId)}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-44 lg:grid-cols-1">
            <button
              type="button"
              disabled={!session.previousStudentId}
              onClick={() => {
                if (session.previousStudentId) onPrevious(session.previousStudentId);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t("collectorModePrevious")}
            </button>
            <button
              type="button"
              disabled={!session.nextStudentId}
              onClick={() => {
                if (session.nextStudentId) onNext(session.nextStudentId);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("collectorModeNext")}
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RecoveryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground sm:text-xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function RecoveryRow({ entry, onOpen }: { entry: RecoveryDeskEntry; onOpen: () => void }) {
  const t = useTranslations("Defaulters");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-h-28 rounded-lg border border-border bg-surface-2 p-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{entry.row.fullName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("studentMetaLine", {
              classLabel: entry.row.classLabel,
              admissionNo: entry.row.admissionNo,
            })}
          </p>
        </div>
        <Money value={entry.row.totalPending} size="sm" tone="warning" />
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        {t("recoveryPriorityScore", { score: entry.priorityScore })}
      </p>
      {entry.reasons.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-xs text-foreground">
          {entry.reasons.slice(0, 3).join(" / ")}
        </p>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Cadence tabs — fully client-controlled, instant filter                      */
/* -------------------------------------------------------------------------- */

type TabValue = Cadence | "all" | "noCall";

const CADENCE_TABS: { value: TabValue; i18nKey: string; Icon: typeof Flame }[] = [
  { value: "now", i18nKey: "triageTabNow", Icon: Flame },
  { value: "soon", i18nKey: "triageTabSoon", Icon: Clock },
  { value: "later", i18nKey: "triageTabLater", Icon: Snowflake },
  { value: "done", i18nKey: "triageTabDone", Icon: CheckCircle2 },
  { value: "all", i18nKey: "triageTabAll", Icon: Flame },
  { value: "noCall", i18nKey: "triageTabNoCall", Icon: BellOff },
];

const CADENCE_TONE: Record<TabValue, { active: string; inactive: string; badge: string }> = {
  now: {
    active: "bg-destructive text-destructive-foreground shadow-sm",
    inactive: "text-destructive hover:bg-destructive/10",
    badge: "bg-destructive/20 text-destructive",
  },
  soon: {
    active: "bg-warning-soft text-warning-soft-foreground shadow-sm",
    inactive: "text-warning-soft-foreground hover:bg-warning-soft/60",
    badge: "bg-warning/30 text-warning-soft-foreground",
  },
  later: {
    active: "bg-info-soft text-info-soft-foreground shadow-sm",
    inactive: "text-info-soft-foreground hover:bg-info-soft/60",
    badge: "bg-info-soft text-info-soft-foreground",
  },
  done: {
    active: "bg-success text-success-foreground shadow-sm",
    inactive: "text-success-soft-foreground hover:bg-success-soft",
    badge: "bg-success-soft text-success-soft-foreground",
  },
  all: {
    active: "bg-card text-foreground shadow-sm",
    inactive: "text-muted-foreground hover:bg-card/60 hover:text-foreground",
    badge: "bg-muted text-muted-foreground",
  },
  noCall: {
    active: "bg-muted text-foreground shadow-sm",
    inactive: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

function CadenceTabs({
  counts,
  noCallCount,
  active,
  onSelect,
}: {
  counts: CadenceCounts;
  noCallCount: number;
  active: string;
  onSelect: (next: string) => void;
}) {
  const t = useTranslations("Defaulters");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div
      className="-mx-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1 px-4 no-scrollbar md:mx-0 md:px-1"
      role="tablist"
      aria-label={t("triageNavLabel")}
    >
      {CADENCE_TABS.map((tab) => {
        // Hide the No-call tab entirely when no parent is exempted.
        if (tab.value === "noCall" && noCallCount === 0) return null;
        const count =
          tab.value === "all"
            ? total
            : tab.value === "noCall"
              ? noCallCount
              : counts[tab.value as Cadence] ?? 0;
        const isActive =
          active === tab.value ||
          (tab.value === "now" && (active === "all" || active === ""));
        const tone = CADENCE_TONE[tab.value as TabValue];
        const Icon = tab.Icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? tone.active : tone.inactive,
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {t(tab.i18nKey)}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                isActive ? "bg-card/30 text-current" : tone.badge,
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Control bar — behavior filter + sort toggle (client-side, instant)           */
/* -------------------------------------------------------------------------- */

const BEHAVIOR_CHIPS: { value: PaymentBehavior | "all"; i18nKey: string }[] = [
  { value: "all", i18nKey: "behaviorChipAll" },
  ...PAYMENT_BEHAVIORS.map((b) => ({
    value: b,
    i18nKey:
      b === "reliable"
        ? "behaviorReliable"
        : b === "delays_but_pays"
          ? "behaviorDelaysButPays"
          : b === "chronic"
            ? "behaviorChronic"
            : b === "non_responsive"
              ? "behaviorNonResponsive"
              : "behaviorNew",
  })),
];

function ControlBar({
  behaviorFilter,
  onBehaviorChange,
  sortMode,
  onSortChange,
}: {
  behaviorFilter: PaymentBehavior | "all";
  onBehaviorChange: (next: PaymentBehavior | "all") => void;
  sortMode: SortMode;
  onSortChange: (next: SortMode) => void;
}) {
  const t = useTranslations("Defaulters");
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {BEHAVIOR_CHIPS.map((chip) => {
          const isActive = behaviorFilter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onBehaviorChange(chip.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface-2 text-foreground hover:bg-surface-3",
              )}
            >
              {t(chip.i18nKey)}
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-start rounded-lg border border-border bg-surface-2 p-0.5 md:self-auto">
        <span className="px-1.5 text-[11px] font-medium text-muted-foreground">{t("sortLabel")}</span>
        {(["smart", "dues"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onSortChange(mode)}
            aria-pressed={sortMode === mode}
            title={mode === "smart" ? t("sortSmartHint") : t("sortDuesHint")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              sortMode === mode
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "smart" ? t("sortSmart") : t("sortDues")}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile card                                                                  */
/* -------------------------------------------------------------------------- */

type CardProps = {
  row: DefaulterSummaryRow;
  summary: DefaulterContactSummary | null;
  sessionLabel: string;
  canManageNoCall: boolean;
  noCall: boolean;
  onOpenDrawer: () => void;
  onOpenFullForm: () => void;
  onOptimisticLog: (
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: () => void;
  onNoCallChange: (noCall: boolean) => void;
  onNoCallRevert: (previous: boolean) => void;
};

function DefaulterCard({
  row,
  summary,
  sessionLabel,
  canManageNoCall,
  noCall,
  onOpenDrawer,
  onOpenFullForm,
  onOptimisticLog,
  onLogRevert,
  onNoCallChange,
  onNoCallRevert,
}: CardProps) {
  const t = useTranslations("Defaulters");
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";
  const entries = useMemo(
    () => buildStudentPhoneEntries({ fatherPhone: row.fatherPhone, motherPhone: row.motherPhone }),
    [row.fatherPhone, row.motherPhone],
  );
  const [activeLabel, setActiveLabel] = useState<string | null>(
    () => defaultActiveEntry(entries, summary)?.label ?? null,
  );
  const activePhone = entries.find((e) => e.label === activeLabel)?.phone ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDrawer}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDrawer();
        }
      }}
      className="cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-1"
            data-row-action="true"
            onClick={(event) => event.stopPropagation()}
          >
            <BulkRowCheckbox
              studentId={row.studentId}
              ariaLabel={t("selectAriaLabel", { name: row.fullName })}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{row.fullName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("studentMetaLine", {
                classLabel: row.classLabel,
                admissionNo: row.admissionNo,
              })}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Money value={row.totalPending} size="lg" tone="warning" />
          {row.overdueAmount > 0 ? (
            <p className="text-[11px] font-medium text-destructive">
              {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
            </p>
          ) : null}
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <HeatChip score={row.heat} />
          </div>
        </div>
      </div>

      {/* Tappable parent numbers + best-number suggestion */}
      <div className="mt-2.5">
        <ContactNumbers
          entries={entries}
          activeLabel={activeLabel}
          onSelect={(entry) => setActiveLabel(entry.label)}
          summary={summary}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ContactStatusChip summary={summary} />
        <BehaviorBadge behavior={row.paymentBehavior} />
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

      {(summary?.noAnswerStreak ?? 0) >= WHATSAPP_NUDGE_STREAK ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-success-soft/60 px-2 py-1 text-[11px] font-medium text-success-soft-foreground">
          <MessageSquare className="size-3" aria-hidden="true" />
          {t("whatsappNudge", { count: summary?.noAnswerStreak ?? 0 })}
        </p>
      ) : null}

      <div className="mt-3">
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
          activePhone={activePhone}
          activeLabel={activeLabel}
          onOpenFullForm={onOpenFullForm}
          onOptimisticLog={onOptimisticLog}
          onLogRevert={onLogRevert}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop compact list row                                                     */
/* -------------------------------------------------------------------------- */

type DesktopListRowProps = {
  row: DefaulterSummaryRow;
  summary: DefaulterContactSummary | null;
  sessionLabel: string;
  noCall: boolean;
  onClick: () => void;
};

function DesktopListRow({ row, summary, sessionLabel, noCall, onClick }: DesktopListRowProps) {
  const t = useTranslations("Defaulters");
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <div className="flex items-center gap-4">
          {/* Checkbox — stop propagation so it doesn't open the drawer */}
          <span
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <BulkRowCheckbox
              studentId={row.studentId}
              ariaLabel={t("selectAriaLabel", { name: row.fullName })}
            />
          </span>

          {/* Student identity */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{row.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t("studentMetaLine", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
            </p>
          </div>

          {/* Status chips — hidden on smaller desktop, shown at xl */}
          <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
            <ContactStatusChip summary={summary} />
            <BehaviorBadge behavior={row.paymentBehavior} />
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

          {/* Amount + heat */}
          <div className="shrink-0 text-right">
            <Money value={row.totalPending} size="sm" tone="warning" />
            {row.overdueAmount > 0 ? (
              <p className="text-[11px] font-medium text-destructive">
                {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
              </p>
            ) : null}
            <div className="mt-1">
              <HeatChip score={row.heat} iconOnly />
            </div>
          </div>

          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        {/* Chips row for lg–xl (below xl they're hidden above) */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8 xl:hidden">
          <ContactStatusChip summary={summary} />
          <BehaviorBadge behavior={row.paymentBehavior} />
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
      </button>
    </li>
  );
}
