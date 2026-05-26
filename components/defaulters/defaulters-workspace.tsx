"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Phone } from "lucide-react";

import { BulkRowCheckbox } from "@/components/defaulters/bulk-whatsapp-provider";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { HeatChip } from "@/components/defaulters/heat-chip";
import { QuickLogButtons } from "@/components/defaulters/quick-log-buttons";
import { WorklistDrawer } from "@/components/defaulters/worklist-drawer";
import { ContactPopover } from "@/components/defaulters/contact-popover";
import { Money } from "@/components/ui/money";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { cn } from "@/lib/utils";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type Props = {
  rows: DefaulterSummaryRow[];
  sessionLabel: string;
  /** Map studentId → contact summary. Plain object for client serialization. */
  contactSummaries: Record<string, DefaulterContactSummary>;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
};

export function DefaultersWorkspace({
  rows,
  sessionLabel,
  contactSummaries,
  canPostPayments,
  canViewPaymentHistory,
}: Props) {
  const t = useTranslations("Defaulters");
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [fullFormFor, setFullFormFor] = useState<DefaulterSummaryRow | null>(null);

  const withSession = useCallback(
    (href: string) => appendSessionParam(href, sessionLabel),
    [sessionLabel],
  );

  const activeRow = useMemo(
    () => rows.find((row) => row.studentId === activeStudentId) ?? null,
    [rows, activeStudentId],
  );
  const activeSummary = activeRow ? contactSummaries[activeRow.studentId] ?? null : null;

  function openDrawer(row: DefaulterSummaryRow) {
    setActiveStudentId(row.studentId);
    setMobileDrawerOpen(true);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
        {t("emptyDefaulters")}
      </p>
    );
  }

  return (
    <>
      {/* ── Mobile card list (primary surface) ── */}
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <DefaulterCard
            key={row.studentId}
            row={row}
            summary={contactSummaries[row.studentId] ?? null}
            sessionLabel={sessionLabel}
            onOpenDrawer={() => openDrawer(row)}
            onOpenFullForm={() => setFullFormFor(row)}
          />
        ))}
      </div>

      {/* ── Desktop two-pane (list left, detail right) ── */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ul className="divide-y divide-border/60">
            {rows.map((row) => {
              const summary = contactSummaries[row.studentId] ?? null;
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
              canViewPaymentHistory={canViewPaymentHistory}
              withSession={withSession}
              onOpenFullForm={() => setFullFormFor(activeRow)}
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

      {/* Mobile drawer (full-screen sheet) */}
      <WorklistDrawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        row={activeRow}
        sessionLabel={sessionLabel}
        contactSummary={activeSummary}
        canPostPayments={canPostPayments}
        canViewPaymentHistory={canViewPaymentHistory}
      />

      {/* Full-form sheet for advanced outcomes / note / voice note */}
      {fullFormFor ? (
        <ContactPopover
          studentId={fullFormFor.studentId}
          studentName={fullFormFor.fullName}
          sessionLabel={sessionLabel}
          open={Boolean(fullFormFor)}
          onClose={() => setFullFormFor(null)}
        />
      ) : null}
    </>
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
};

function DefaulterCard({ row, summary, sessionLabel, onOpenDrawer, onOpenFullForm }: CardProps) {
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
      {/* Top row: select + name + outstanding */}
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

      {/* Contact status */}
      <div className="mt-2">
        <ContactStatusChip summary={summary} />
      </div>

      {/* One-tap quick log */}
      <div className="mt-3">
        <QuickLogButtons
          studentId={row.studentId}
          sessionLabel={sessionLabel}
          defaultChannel={defaultChannel}
          onOpenFullForm={onOpenFullForm}
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
  canViewPaymentHistory: boolean;
  withSession: (href: string) => string;
  onOpenFullForm: () => void;
};

function DesktopDetailPane({
  row,
  summary,
  sessionLabel,
  canPostPayments,
  canViewPaymentHistory,
  withSession,
  onOpenFullForm,
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
          <dt className="text-muted-foreground">{t("tableOldestDue")}</dt>
          <dd className="text-right text-foreground">
            {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
          </dd>
          <dt className="text-muted-foreground">{t("tableLateFee")}</dt>
          <dd className="text-right text-foreground">{formatInr(row.lateFee)}</dd>
          <dt className="text-muted-foreground">{t("tableRoute")}</dt>
          <dd className="text-right text-foreground">{row.transportRouteLabel}</dd>
          {canViewPaymentHistory ? (
            <>
              <dt className="text-muted-foreground">{t("tableLastPayment")}</dt>
              <dd className="text-right text-foreground">
                {row.lastPaymentDate ? formatShortDate(row.lastPaymentDate) : "-"}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <DesktopTimeline studentId={row.studentId} sessionLabel={sessionLabel} />
    </div>
  );
}

const OUTCOME_I18N: Record<string, string> = {
  reached: "outcomeReached",
  no_answer: "outcomeNoAnswer",
  promised_pay: "outcomePromisedPay",
  dispute: "outcomeDisputeLog",
  other: "outcomeOther",
};

function DesktopTimeline({ studentId, sessionLabel }: { studentId: string; sessionLabel: string }) {
  const t = useTranslations("Defaulters");
  const [entries, setEntries] = useState<
    Array<{
      contactedAt: string;
      channel: string | null;
      outcome: string | null;
      note: string | null;
      snoozeUntil: string | null;
    }> | null
  >(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setLoading(true);
    fetch(
      `/protected/defaulters/contact-log?studentId=${encodeURIComponent(studentId)}&sessionLabel=${encodeURIComponent(sessionLabel)}`,
      { headers: { accept: "application/json" } },
    )
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data: { entries?: typeof entries }) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, sessionLabel]);

  return (
    <section className="border-t border-border pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("drawerTimelineHeading")}
      </p>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("logLoading")}</p>
      ) : null}
      {entries !== null && entries.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-3 text-center text-xs text-muted-foreground">
          {t("logEmpty")}
        </p>
      ) : null}
      <ul className="mt-2 space-y-1.5">
        {entries?.slice(0, 6).map((entry, index) => {
          const outcomeKey = entry.outcome ? OUTCOME_I18N[entry.outcome] : null;
          return (
            <li
              key={`${entry.contactedAt}-${index}`}
              className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs"
            >
              <div>
                <span className="font-medium text-foreground">
                  {outcomeKey ? t(outcomeKey) : entry.outcome ?? t("logLogged")}
                </span>
                <span className="text-muted-foreground"> · {entry.channel ?? t("logChannelUnknown")}</span>
                {entry.note ? <p className="mt-0.5 text-foreground">{entry.note}</p> : null}
              </div>
              <span className="shrink-0 text-muted-foreground">
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(entry.contactedAt),
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
