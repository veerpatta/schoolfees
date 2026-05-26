"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Loader2, MessageSquare, Phone, Receipt } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Money } from "@/components/ui/money";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { ContactPopover } from "@/components/defaulters/contact-popover";
import { FeeBreakdownPanel } from "@/components/defaulters/fee-breakdown-panel";
import { HeatChip } from "@/components/defaulters/heat-chip";
import { QuickLogButtons } from "@/components/defaulters/quick-log-buttons";
import { VoiceNotePlayer } from "@/components/defaulters/voice-note-player";
import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

type ContactEntry = {
  contactedAt: string;
  channel: string | null;
  outcome: string | null;
  note: string | null;
  voiceNotePath: string | null;
  snoozeUntil: string | null;
};

const CHANNEL_I18N: Record<string, string> = {
  call: "channelCall",
  whatsapp: "channelWhatsapp",
  sms: "channelSms",
  in_person: "channelInPerson",
  email: "channelEmail",
};

const OUTCOME_I18N: Record<string, string> = {
  reached: "outcomeReached",
  no_answer: "outcomeNoAnswer",
  promised_pay: "outcomePromisedPay",
  dispute: "outcomeDisputeLog",
  other: "outcomeOther",
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type Props = {
  open: boolean;
  onClose: () => void;
  row: DefaulterSummaryRow | null;
  sessionLabel: string;
  contactSummary?: DefaulterContactSummary | null;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
};

export function WorklistDrawer({
  open,
  onClose,
  row,
  sessionLabel,
  contactSummary,
  canPostPayments,
  canViewPaymentHistory,
}: Props) {
  const t = useTranslations("Defaulters");
  const [entries, setEntries] = useState<ContactEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFullForm, setShowFullForm] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    setLoading(true);
    fetch(
      `/protected/defaulters/contact-log?studentId=${encodeURIComponent(row.studentId)}&sessionLabel=${encodeURIComponent(sessionLabel)}`,
      { headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t("logLoadStatus", { status: response.status }));
        }
        return (await response.json()) as { entries: ContactEntry[] };
      })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
      })
      .catch((caught: Error) => {
        if (cancelled) return;
        setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, row, sessionLabel, t]);

  if (!row) return null;

  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  const defaultChannel =
    (contactSummary?.lastChannel as "call" | "whatsapp" | "sms" | "in_person" | "email" | null) ??
    "call";

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={row.fullName}
        description={t("studentMetaLine", {
          classLabel: row.classLabel,
          admissionNo: row.admissionNo,
        })}
        size="full"
      >
        <div className="space-y-5">
          {/* Dues + heat summary */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("drawerOutstandingLabel")}
                </p>
                <div className="mt-1">
                  <Money value={row.totalPending} size="xl" tone="warning" />
                </div>
                {row.overdueAmount > 0 ? (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
                  </p>
                ) : null}
                {row.lateFee > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("lateFeeChip", { amount: formatInr(row.lateFee) })}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <HeatChip score={row.heat} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("daysOverdueLabel", { count: row.daysOverdue })}
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">{t("tableFather")}</dt>
              <dd className="text-right text-foreground">{row.fatherName ?? "-"}</dd>
              <dt className="text-muted-foreground">{t("tablePhone")}</dt>
              <dd className="text-right text-foreground">
                {row.fatherPhone ? (
                  <a href={`tel:${row.fatherPhone}`} className="text-info-soft-foreground hover:underline">
                    {row.fatherPhone}
                  </a>
                ) : (
                  "-"
                )}
              </dd>
              <dt className="text-muted-foreground">{t("tableOldestDue")}</dt>
              <dd className="text-right text-foreground">
                {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
              </dd>
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

            <div className="mt-3">
              <ContactStatusChip summary={contactSummary ?? null} />
            </div>
          </div>

          {/* Primary actions */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t("drawerLogAttempt")}
            </p>
            <QuickLogButtons
              studentId={row.studentId}
              sessionLabel={sessionLabel}
              defaultChannel={defaultChannel}
              onOpenFullForm={() => setShowFullForm(true)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {row.fatherPhone ? (
              <a
                href={`tel:${row.fatherPhone}`}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-success/30 bg-success-soft px-2 py-3 text-xs font-semibold text-success-soft-foreground"
              >
                <Phone className="size-4" aria-hidden="true" />
                {t("drawerCall")}
              </a>
            ) : (
              <span className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-3 text-xs font-medium text-muted-foreground">
                <Phone className="size-4" aria-hidden="true" />
                {t("drawerNoPhone")}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowWhatsApp(true)}
              className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-success/30 bg-success-soft/60 px-2 py-3 text-xs font-semibold text-success-soft-foreground hover:bg-success-soft"
            >
              <MessageSquare className="size-4" aria-hidden="true" />
              {t("drawerWhatsApp")}
            </button>
            {canPostPayments ? (
              <Link
                href={withSession(
                  `/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`,
                )}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-accent bg-accent px-2 py-3 text-xs font-semibold text-accent-foreground"
              >
                <Receipt className="size-4" aria-hidden="true" />
                {t("collectAction")}
              </Link>
            ) : (
              <Link
                href={withSession(`/protected/students/${row.studentId}`)}
                className="inline-flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-3 text-xs font-semibold text-foreground"
              >
                <Receipt className="size-4" aria-hidden="true" />
                {t("viewAction")}
              </Link>
            )}
          </div>

          {/* Full fee breakdown — installments + recent receipts + adjustments */}
          <FeeBreakdownPanel
            studentId={row.studentId}
            sessionLabel={sessionLabel}
          />

          {/* Timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <History className="size-3.5" aria-hidden="true" /> {t("drawerTimelineHeading")}
              </p>
              {entries && entries.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t("drawerTimelineCount", { count: entries.length })}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("logLoading")}
              </div>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {entries !== null && entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-6 text-center text-sm text-muted-foreground">
                {t("logEmpty")}
              </p>
            ) : null}

            <ul className="space-y-2">
              {entries?.map((entry, index) => {
                const outcomeKey = entry.outcome ? OUTCOME_I18N[entry.outcome] : null;
                const channelKey = entry.channel ? CHANNEL_I18N[entry.channel] : null;
                const promisedDateLabel =
                  entry.outcome === "promised_pay" && entry.snoozeUntil
                    ? t("drawerPromisedOn", { date: formatShortDate(entry.snoozeUntil) })
                    : null;
                return (
                  <li
                    key={`${entry.contactedAt}-${index}`}
                    className="rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-foreground">
                        {outcomeKey ? t(outcomeKey) : entry.outcome ?? t("logLogged")}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.contactedAt)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {channelKey ? t(channelKey) : entry.channel ?? t("logChannelUnknown")}
                      {promisedDateLabel ? ` · ${promisedDateLabel}` : ""}
                    </p>
                    {entry.note ? <p className="mt-2 text-sm text-foreground">{entry.note}</p> : null}
                    {entry.voiceNotePath ? (
                      <div className="mt-2">
                        <VoiceNotePlayer path={entry.voiceNotePath} label={t("voiceNotePlay")} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Sheet>

      <ContactPopover
        open={showFullForm}
        onClose={() => setShowFullForm(false)}
        studentId={row.studentId}
        studentName={row.fullName}
        sessionLabel={sessionLabel}
      />

      <WhatsAppDraftModal
        row={row}
        sessionLabel={sessionLabel}
        autoLogStudentId={row.studentId}
        open={showWhatsApp}
        onClose={() => setShowWhatsApp(false)}
      />
    </>
  );
}
