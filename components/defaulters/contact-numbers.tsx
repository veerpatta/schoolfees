"use client";

import { useTranslations } from "next-intl";
import { Check, Clock3, Phone, PhoneOff, Sparkles } from "lucide-react";

import type { PhoneEntry } from "@/components/students/phone-chooser";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import { cn } from "@/lib/utils";

type Props = {
  entries: PhoneEntry[];
  /** Currently-active label ("Father"/"Mother") that outcomes attribute to. */
  activeLabel: string | null;
  /** Fired when a number is tapped — parent makes it the active number. */
  onSelect: (entry: PhoneEntry) => void;
  /** Contact summary for per-number stats + suggestion. */
  summary: DefaulterContactSummary | null;
  /** Stop card-level click handlers firing when tapping a number. */
  stopPropagation?: boolean;
};

/** Translate the canonical English label used as the storage key. */
function useLabelText() {
  const t = useTranslations("Defaulters");
  return (label: string) => {
    if (label === "Father") return t("phoneLabelFather");
    if (label === "Mother") return t("phoneLabelMother");
    return label;
  };
}

/**
 * Renders the parent phone numbers as tappable call chips. Tapping a number
 * dials it (tel:) AND marks it active so the quick-log buttons attribute the
 * next outcome to that number. A hint nudges staff toward the number most
 * likely to answer, learned from the contact log.
 */
export function ContactNumbers({
  entries,
  activeLabel,
  onSelect,
  summary,
  stopPropagation = true,
}: Props) {
  const t = useTranslations("Defaulters");
  const labelText = useLabelText();

  if (entries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <PhoneOff className="size-3" aria-hidden="true" />
        {t("drawerNoPhone")}
      </span>
    );
  }

  const suggested = summary?.suggestedPhoneLabel ?? null;
  const perNumber = summary?.perNumber;
  const handleClick = (event: React.MouseEvent, entry: PhoneEntry) => {
    if (stopPropagation) event.stopPropagation();
    onSelect(entry);
  };

  // Build a one-line hint: suggest a number, optionally citing why the other is cold.
  let hint: string | null = null;
  if (suggested && entries.length > 1) {
    const otherLabel = entries.find((e) => e.label !== suggested)?.label;
    const otherStreak = otherLabel ? perNumber?.[otherLabel]?.noAnswerStreak ?? 0 : 0;
    hint =
      otherStreak >= 2 && otherLabel
        ? t("bestNumberReason", {
            suggested: labelText(suggested),
            other: labelText(otherLabel),
            count: otherStreak,
          })
        : t("bestNumberSuggest", { label: labelText(suggested) });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5" data-row-action="true">
        {entries.map((entry) => {
          const isActive = activeLabel === entry.label;
          const stat = perNumber?.[entry.label];
          const isSuggested = suggested === entry.label;
          return (
            <a
              key={entry.phone}
              href={`tel:${entry.phone}`}
              onClick={(event) => handleClick(event, entry)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-accent bg-accent/10 text-foreground ring-1 ring-inset ring-accent"
                  : "border-border bg-surface-2 text-info-soft-foreground hover:bg-surface-3",
              )}
              aria-current={isActive ? "true" : undefined}
            >
              {isActive ? (
                <Check className="size-3 text-accent" aria-hidden="true" />
              ) : (
                <Phone className="size-3" aria-hidden="true" />
              )}
              <span className="font-semibold">{labelText(entry.label)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{entry.phone}</span>
              {isSuggested ? (
                <Sparkles className="size-3 text-success-soft-foreground" aria-label={t("bestNumberBadge")} />
              ) : stat && stat.noAnswerStreak >= 2 ? (
                <span className="rounded-full bg-warning-soft px-1 text-[10px] font-semibold text-warning-soft-foreground">
                  {t("bestNumberColdShort", { count: stat.noAnswerStreak })}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
      {hint ? (
        <p className="inline-flex items-center gap-1 text-[11px] font-medium text-success-soft-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          {hint}
        </p>
      ) : null}
      {summary?.bestCallWindow ? (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="size-3" aria-hidden="true" />
          {t("bestTimeLabel", { window: t(`callWindow_${summary.bestCallWindow}`) })}
        </p>
      ) : null}
    </div>
  );
}
