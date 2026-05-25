"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, MessageCircle, Phone, PhoneOff, AlertTriangle } from "lucide-react";

import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import { cn } from "@/lib/utils";

type ContactStatusChipProps = {
  summary: DefaulterContactSummary | null;
  /** Iso-date "now" for days-since calculation. Defaults to actual today. */
  today?: Date;
  className?: string;
};

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

type OutcomeKey = Exclude<DefaulterContactSummary["lastOutcome"], null | undefined>;

const OUTCOME_STYLE: Record<
  OutcomeKey,
  { i18nKey: string; cls: string; Icon: typeof Phone }
> = {
  reached: {
    i18nKey: "chipOutcomeReached",
    cls: "border-info-soft bg-info-soft text-info-soft-foreground",
    Icon: Phone,
  },
  promised_pay: {
    i18nKey: "chipOutcomePromised",
    cls: "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground",
    Icon: CheckCircle2,
  },
  no_answer: {
    i18nKey: "chipOutcomeNoAnswer",
    cls: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
    Icon: PhoneOff,
  },
  dispute: {
    i18nKey: "chipOutcomeDispute",
    cls: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  other: {
    i18nKey: "chipOutcomeLogged",
    cls: "border-border bg-surface-2 text-muted-foreground",
    Icon: MessageCircle,
  },
};

export function ContactStatusChip({
  summary,
  today = new Date(),
  className,
}: ContactStatusChipProps) {
  const t = useTranslations("Defaulters");

  if (!summary || !summary.lastContactedAt) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <Clock className="size-3" aria-hidden="true" />
        {t("chipNeverContacted")}
      </span>
    );
  }

  const days = daysSince(summary.lastContactedAt, today) ?? 0;
  const outcomeStyle = summary.lastOutcome ? OUTCOME_STYLE[summary.lastOutcome] : OUTCOME_STYLE.other;
  const Icon = outcomeStyle.Icon;
  const isEscalation = (summary.noAnswerStreak ?? 0) >= 5;
  const whenLabel =
    days === 0
      ? t("chipWhenToday")
      : days === 1
        ? t("chipWhenYesterday")
        : t("chipWhenDaysAgo", { count: days });
  const shortWhen = days === 0 ? t("chipDaysToday") : t("chipDaysShort", { count: days });

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          outcomeStyle.cls,
        )}
        title={t("chipLastContactedTitle", {
          when: whenLabel,
          channel: summary.lastChannel ?? t("chipChannelUnknown"),
        })}
      >
        <Icon className="size-3" aria-hidden="true" />
        {t("chipOutcomeWithDays", {
          outcome: t(outcomeStyle.i18nKey),
          when: shortWhen,
        })}
      </span>
      {isEscalation ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive"
          title={t("chipEscalateTitle", { count: summary.noAnswerStreak ?? 0 })}
        >
          <AlertTriangle className="size-3" aria-hidden="true" />
          {t("chipEscalate", { count: summary.noAnswerStreak ?? 0 })}
        </span>
      ) : null}
    </span>
  );
}
