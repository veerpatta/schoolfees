"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  BellOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  MessageSquare,
  Snowflake,
} from "lucide-react";

import { BulkRowCheckbox } from "@/components/defaulters/bulk-whatsapp-provider";
import { BehaviorBadge } from "@/components/defaulters/behavior-badge";
import { ContactNumbers } from "@/components/defaulters/contact-numbers";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { PromiseChip } from "@/components/defaulters/promise-chip";
import { FeeBreakdownPanel } from "@/components/defaulters/fee-breakdown-panel";
import { HeatChip } from "@/components/defaulters/heat-chip";
import { NoCallToggle } from "@/components/defaulters/no-call-toggle";
import { QuickLogButtons, type QuickLogKind } from "@/components/defaulters/quick-log-buttons";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { ContactPopover } from "@/components/defaulters/contact-popover";
import { buildStudentPhoneEntries, type PhoneEntry } from "@/components/students/phone-chooser";
import { Money } from "@/components/ui/money";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";
import {
  deriveCadence,
  tallyCadence,
  type Cadence,
  type CadenceCounts,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import { PAYMENT_BEHAVIORS, type PaymentBehavior } from "@/lib/defaulters/behavior";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type SortMode = "smart" | "dues";

/** How many cards to render before "Show more" (keeps the mobile DOM light). */
const RENDER_CHUNK = 60;
/** No-answer streak at which we nudge staff to switch to WhatsApp. */
const WHATSAPP_NUDGE_STREAK = 3;

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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [fullFormFor, setFullFormFor] = useState<DefaulterSummaryRow | null>(null);
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

  const withSession = useCallback(
    (href: string) => appendSessionParam(href, sessionLabel),
    [sessionLabel],
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
    setMobileDrawerOpen(true);
  }

  return (
    <div className="space-y-3">
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
          {/* ── Mobile card list (primary surface) ── */}
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

          {/* ── Desktop two-pane ── */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <ul className="divide-y divide-border/60">
                {pagedRows.map(({ row }) => {
                  const summary = effectiveSummaries[row.studentId] ?? null;
                  const isActive = activeStudentId === row.studentId;
                  return (
                    <li key={row.studentId}>
                      <button
                        type="button"
                        onClick={() => setActiveStudentId(row.studentId)}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors hover:bg-surface-2",
                          isActive && "bg-accent/10 ring-1 ring-inset ring-accent",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">
                              {row.fullName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t("studentMetaLine", {
                                classLabel: row.classLabel,
                                admissionNo: row.admissionNo,
                              })}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Money value={row.totalPending} size="sm" tone="warning" />
                            <div className="mt-1">
                              <HeatChip score={row.heat} iconOnly />
                            </div>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <ContactStatusChip summary={summary} />
                          <BehaviorBadge behavior={row.paymentBehavior} />
                          <PromiseChip status={row.promiseStatus} />
                          {effectiveNoCall(row) ? (
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
                })}
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

            <div className="rounded-xl border border-border bg-card p-5">
              {activeRow ? (
                <DesktopDetailPane
                  row={activeRow}
                  summary={activeSummary}
                  sessionLabel={sessionLabel}
                  canPostPayments={canPostPayments}
                  canManageNoCall={canManageNoCall}
                  noCall={effectiveNoCall(activeRow)}
                  withSession={withSession}
                  onOpenFullForm={() => setFullFormFor(activeRow)}
                  onOptimisticLog={(kind, defaultChannel, promisedDate) =>
                    handleQuickLog(activeRow.studentId, kind, defaultChannel, promisedDate)
                  }
                  onLogRevert={() => handleQuickLogRevert(activeRow.studentId)}
                  onNoCallChange={(next) => handleNoCallChange(activeRow.studentId, next)}
                  onNoCallRevert={(previous) => handleNoCallRevert(activeRow.studentId, previous)}
                />
              ) : (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
                  <ChevronRight className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {t("desktopPickStudent")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("desktopPickHint")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile drawer */}
      <WorklistDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        row={activeRow}
        sessionLabel={sessionLabel}
        contactSummary={activeSummary}
        canPostPayments={canPostPayments}
        canViewPaymentHistory={canViewPaymentHistory}
        canManageNoCall={canManageNoCall}
        noCall={activeRow ? effectiveNoCall(activeRow) : false}
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
    </div>
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
/* Desktop detail pane                                                          */
/* -------------------------------------------------------------------------- */

type DetailProps = {
  row: DefaulterSummaryRow;
  summary: DefaulterContactSummary | null;
  sessionLabel: string;
  canPostPayments: boolean;
  canManageNoCall: boolean;
  noCall: boolean;
  withSession: (href: string) => string;
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

function DesktopDetailPane({
  row,
  summary,
  sessionLabel,
  canPostPayments,
  canManageNoCall,
  noCall,
  withSession,
  onOpenFullForm,
  onOptimisticLog,
  onLogRevert,
  onNoCallChange,
  onNoCallRevert,
}: DetailProps) {
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
  // Re-default the active number when the selected student changes.
  useEffect(() => {
    setActiveLabel(defaultActiveEntry(entries, summary)?.label ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.studentId]);
  const activePhone = entries.find((e) => e.label === activeLabel)?.phone ?? null;

  return (
    <div className="flex h-full flex-col gap-5">
      <header className="border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">{row.fullName}</h3>
            <p className="text-sm text-muted-foreground">
              {t("studentMetaLine", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
            </p>
          </div>
          <HeatChip score={row.heat} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Money value={row.totalPending} size="xl" tone="warning" />
          {row.overdueAmount > 0 ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t("daysOverdueLabel", { count: row.daysOverdue })}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
      </header>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("drawerCallNumber")}
        </p>
        <ContactNumbers
          entries={entries}
          activeLabel={activeLabel}
          onSelect={(entry) => setActiveLabel(entry.label)}
          summary={summary}
          stopPropagation={false}
        />
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("drawerLogAttempt")}
        </p>
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
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link
          href={withSession(`/protected/students/${row.studentId}`)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center text-sm font-semibold text-foreground"
        >
          {t("viewAction")}
        </Link>
        {canPostPayments ? (
          <Link
            href={withSession(
              `/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`,
            )}
            className="rounded-lg border border-accent bg-accent px-3 py-2.5 text-center text-sm font-semibold text-accent-foreground"
          >
            {t("collectAction")}
          </Link>
        ) : null}
      </section>

      <section>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("tableFather")}</dt>
          <dd className="text-right text-foreground">{row.fatherName ?? "-"}</dd>
          <dt className="text-muted-foreground">{t("tableRoute")}</dt>
          <dd className="text-right text-foreground">{row.transportRouteLabel}</dd>
        </dl>
      </section>

      <FeeBreakdownPanel studentId={row.studentId} sessionLabel={sessionLabel} />
    </div>
  );
}
