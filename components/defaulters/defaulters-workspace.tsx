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
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Phone,
  Snowflake,
} from "lucide-react";

import { BulkRowCheckbox } from "@/components/defaulters/bulk-whatsapp-provider";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { FeeBreakdownPanel } from "@/components/defaulters/fee-breakdown-panel";
import { HeatChip } from "@/components/defaulters/heat-chip";
import { QuickLogButtons, type QuickLogKind } from "@/components/defaulters/quick-log-buttons";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { ContactPopover } from "@/components/defaulters/contact-popover";
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
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type Props = {
  rows: DefaulterSummaryRow[];
  sessionLabel: string;
  /** Map studentId → contact summary. Plain object for client serialization. */
  contactSummaries: Record<string, DefaulterContactSummary>;
  /** Initial active cadence from the URL on first render. */
  initialCadence: string;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
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
}: Props) {
  const t = useTranslations("Defaulters");
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [fullFormFor, setFullFormFor] = useState<DefaulterSummaryRow | null>(null);
  const [activeCadence, setActiveCadence] = useState<string>(initialCadence);

  /**
   * Local overlay on top of the server-supplied contact summaries — keyed by
   * studentId. When the officer taps a quick-log button we patch this
   * immediately so the card moves bucket without waiting for the server.
   */
  const [overlay, setOverlay] = useState<Record<string, DefaulterContactSummary>>({});

  // Reset overlay when the underlying server summaries change (page nav).
  useEffect(() => {
    setOverlay({});
  }, [contactSummaries]);

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

  const cadenceCounts: CadenceCounts = useMemo(
    () =>
      tallyCadence(
        rows.map((row) => effectiveSummaries[row.studentId] ?? DEFAULT_SUMMARY),
        today,
      ),
    [rows, effectiveSummaries, today],
  );

  const visibleRows = useMemo(
    () =>
      activeCadence === "all"
        ? rowsWithCadence
        : rowsWithCadence.filter((r) => r.cadence === activeCadence),
    [rowsWithCadence, activeCadence],
  );

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
        active={activeCadence}
        onSelect={handleCadenceChange}
      />

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
          {t("emptyDefaulters")}
        </p>
      ) : (
        <>
          {/* ── Mobile card list (primary surface) ── */}
          <div className="space-y-2 lg:hidden">
            {visibleRows.map(({ row }) => (
              <DefaulterCard
                key={row.studentId}
                row={row}
                summary={effectiveSummaries[row.studentId] ?? null}
                sessionLabel={sessionLabel}
                onOpenDrawer={() => openDrawer(row)}
                onOpenFullForm={() => setFullFormFor(row)}
                onOptimisticLog={(kind, defaultChannel, promisedDate) =>
                  handleQuickLog(row.studentId, kind, defaultChannel, promisedDate)
                }
                onLogRevert={() => handleQuickLogRevert(row.studentId)}
              />
            ))}
          </div>

          {/* ── Desktop two-pane ── */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <ul className="divide-y divide-border/60">
                {visibleRows.map(({ row }) => {
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
                        <div className="mt-1.5">
                          <ContactStatusChip summary={summary} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              {activeRow ? (
                <DesktopDetailPane
                  row={activeRow}
                  summary={activeSummary}
                  sessionLabel={sessionLabel}
                  canPostPayments={canPostPayments}
                  withSession={withSession}
                  onOpenFullForm={() => setFullFormFor(activeRow)}
                  onOptimisticLog={(kind, defaultChannel, promisedDate) =>
                    handleQuickLog(activeRow.studentId, kind, defaultChannel, promisedDate)
                  }
                  onLogRevert={() => handleQuickLogRevert(activeRow.studentId)}
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
        onOptimisticLog={(kind, defaultChannel, promisedDate) => {
          if (activeRow) {
            handleQuickLog(activeRow.studentId, kind, defaultChannel, promisedDate);
          }
        }}
        onLogRevert={() => {
          if (activeRow) handleQuickLogRevert(activeRow.studentId);
        }}
      />

      {fullFormFor ? (
        <ContactPopover
          studentId={fullFormFor.studentId}
          studentName={fullFormFor.fullName}
          sessionLabel={sessionLabel}
          open={Boolean(fullFormFor)}
          onClose={() => setFullFormFor(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cadence tabs — fully client-controlled, instant filter                      */
/* -------------------------------------------------------------------------- */

const CADENCE_TABS: { value: Cadence | "all"; i18nKey: string; Icon: typeof Flame }[] = [
  { value: "now", i18nKey: "triageTabNow", Icon: Flame },
  { value: "soon", i18nKey: "triageTabSoon", Icon: Clock },
  { value: "later", i18nKey: "triageTabLater", Icon: Snowflake },
  { value: "done", i18nKey: "triageTabDone", Icon: CheckCircle2 },
  { value: "all", i18nKey: "triageTabAll", Icon: Flame },
];

const CADENCE_TONE: Record<Cadence | "all", { active: string; inactive: string; badge: string }> = {
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
};

function CadenceTabs({
  counts,
  active,
  onSelect,
}: {
  counts: CadenceCounts;
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
        const count = tab.value === "all" ? total : counts[tab.value as Cadence] ?? 0;
        const isActive =
          active === tab.value ||
          (tab.value === "now" && (active === "all" || active === ""));
        const tone = CADENCE_TONE[tab.value as Cadence | "all"];
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
/* Mobile card                                                                  */
/* -------------------------------------------------------------------------- */

type CardProps = {
  row: DefaulterSummaryRow;
  summary: DefaulterContactSummary | null;
  sessionLabel: string;
  onOpenDrawer: () => void;
  onOpenFullForm: () => void;
  onOptimisticLog: (
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: () => void;
};

function DefaulterCard({
  row,
  summary,
  sessionLabel,
  onOpenDrawer,
  onOpenFullForm,
  onOptimisticLog,
  onLogRevert,
}: CardProps) {
  const t = useTranslations("Defaulters");
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";

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
            {row.fatherPhone ? (
              <a
                href={`tel:${row.fatherPhone}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-info-soft-foreground hover:underline"
                data-row-action="true"
              >
                <Phone className="size-3" aria-hidden="true" />
                {row.fatherPhone}
              </a>
            ) : null}
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

      <div className="mt-2">
        <ContactStatusChip summary={summary} />
      </div>

      <div className="mt-3">
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
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
  withSession: (href: string) => string;
  onOpenFullForm: () => void;
  onOptimisticLog: (
    kind: QuickLogKind,
    defaultChannel: DefaulterContactSummary["lastChannel"],
    promisedDate: string | null,
  ) => void;
  onLogRevert: () => void;
};

function DesktopDetailPane({
  row,
  summary,
  sessionLabel,
  canPostPayments,
  withSession,
  onOpenFullForm,
  onOptimisticLog,
  onLogRevert,
}: DetailProps) {
  const t = useTranslations("Defaulters");
  const defaultChannel =
    (summary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ?? "call";

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

        <div className="mt-3">
          <ContactStatusChip summary={summary} />
        </div>
      </header>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("drawerLogAttempt")}
        </p>
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
          onOpenFullForm={onOpenFullForm}
          onOptimisticLog={onOptimisticLog}
          onLogRevert={onLogRevert}
        />
      </section>

      <section className="grid grid-cols-3 gap-2">
        {row.fatherPhone ? (
          <a
            href={`tel:${row.fatherPhone}`}
            className="rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-center text-sm font-semibold text-success-soft-foreground"
          >
            {t("drawerCall")} · {row.fatherPhone}
          </a>
        ) : (
          <span className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center text-sm text-muted-foreground">
            {t("drawerNoPhone")}
          </span>
        )}
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
