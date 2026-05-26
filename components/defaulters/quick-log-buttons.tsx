"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, HandshakeIcon, Loader2, PhoneOff, PhoneCall } from "lucide-react";

import { quickLogContact } from "@/app/protected/defaulters/actions";
import { cn } from "@/lib/utils";

export type QuickLogKind = "no_answer" | "reached" | "promised";

type Channel = "call" | "whatsapp" | "sms" | "in_person" | "email";

type Props = {
  studentId: string;
  sessionLabel: string;
  /** Inferred from the last attempt; defaults to "call". */
  defaultChannel?: Channel;
  /** Open the full-form sheet (for Dispute / Other / add note). */
  onOpenFullForm: () => void;
  /** Compact icon-only buttons (for desktop table cells). */
  compact?: boolean;
  /**
   * Optimistic UI hook — fired synchronously when the user taps.
   * Parent should merge the implied summary patch into its local state so the
   * row jumps to the correct bucket without a server roundtrip.
   */
  onOptimisticLog?: (
    kind: QuickLogKind,
    defaultChannel: Channel,
    promisedDate: string | null,
  ) => void;
  /** Called when the server save fails — parent should revert overlay. */
  onLogRevert?: () => void;
};

/**
 * One-tap log buttons. Optimistic by design: parent UI updates *instantly*
 * via onOptimisticLog; the server insert fires in the background and the
 * button only flashes a checkmark long enough to acknowledge the press.
 * Dispute / Other / add note open the full sheet via onOpenFullForm.
 */
export function QuickLogButtons({
  studentId,
  sessionLabel,
  defaultChannel = "call",
  onOpenFullForm,
  compact = false,
  onOptimisticLog,
  onLogRevert,
}: Props) {
  const t = useTranslations("Defaulters");
  const [pending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<QuickLogKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPromiseOptions, setShowPromiseOptions] = useState(false);

  function submit(
    kind: QuickLogKind,
    promisedDate: string | null,
    args: Parameters<typeof quickLogContact>[0],
  ) {
    // Optimistic: fire the parent patch immediately.
    onOptimisticLog?.(kind, defaultChannel, promisedDate);
    setPendingKind(kind);
    setError(null);
    setShowPromiseOptions(false);

    startTransition(async () => {
      const result = await quickLogContact(args);
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        onLogRevert?.();
      }
      setPendingKind(null);
    });
  }

  function handleNoAnswer() {
    submit("no_answer", null, {
      studentId,
      sessionLabel,
      outcome: "no_answer",
      channel: defaultChannel,
    });
  }

  function handleReached() {
    submit("reached", null, {
      studentId,
      sessionLabel,
      outcome: "reached",
      channel: defaultChannel,
    });
  }

  function handlePromised(promisedDate: string) {
    submit("promised", promisedDate, {
      studentId,
      sessionLabel,
      outcome: "promised_pay",
      channel: defaultChannel,
      promisedDate,
    });
  }

  const isoToday = isoDate(new Date());
  const isoTomorrow = isoDate(new Date(Date.now() + 86_400_000));
  const isoNextWeek = isoDate(new Date(Date.now() + 7 * 86_400_000));

  const btnBase = compact
    ? "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
    : "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-active";

  return (
    <div className="space-y-2">
      {showPromiseOptions ? (
        <div
          className="rounded-lg border border-success/40 bg-success-soft/60 p-2 anim-fade-in"
          data-row-action="true"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mb-2 text-xs font-medium text-success-soft-foreground">
            {t("quickPromisedWhen")}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => handlePromised(isoToday)}
              className="rounded-md border border-success/40 bg-card px-2 py-2 text-xs font-semibold text-foreground hover:bg-success-soft"
            >
              {t("quickPromisedToday")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handlePromised(isoTomorrow)}
              className="rounded-md border border-success/40 bg-card px-2 py-2 text-xs font-semibold text-foreground hover:bg-success-soft"
            >
              {t("quickPromisedTomorrow")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handlePromised(isoNextWeek)}
              className="rounded-md border border-success/40 bg-card px-2 py-2 text-xs font-semibold text-foreground hover:bg-success-soft"
            >
              {t("quickPromised1Week")}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <span>{t("quickPromisedPickLabel")}</span>
              <input
                type="date"
                disabled={pending}
                min={isoToday}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                onChange={(event) => {
                  if (event.target.value) handlePromised(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowPromiseOptions(false)}
              className="text-xs font-medium text-muted-foreground underline"
            >
              {t("quickPromisedCancel")}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex gap-2",
            compact ? "flex-wrap" : "flex-row items-stretch",
          )}
          data-row-action="true"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={pending}
            onClick={handleNoAnswer}
            className={cn(
              btnBase,
              "border border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground active:scale-[0.98]",
            )}
            aria-label={t("quickNoAnswerAria")}
          >
            {pendingKind === "no_answer" ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <PhoneOff className="size-4" aria-hidden="true" />
            )}
            <span>{compact ? t("quickNoAnswerShort") : t("quickNoAnswer")}</span>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={handleReached}
            className={cn(
              btnBase,
              "border border-info-soft bg-info-soft text-info-soft-foreground active:scale-[0.98]",
            )}
            aria-label={t("quickReachedAria")}
          >
            {pendingKind === "reached" ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <PhoneCall className="size-4" aria-hidden="true" />
            )}
            <span>{compact ? t("quickReachedShort") : t("quickReached")}</span>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => setShowPromiseOptions(true)}
            className={cn(
              btnBase,
              "border border-success/40 bg-success-soft text-success-soft-foreground active:scale-[0.98]",
            )}
            aria-label={t("quickPromisedAria")}
          >
            {pendingKind === "promised" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <HandshakeIcon className="size-4" aria-hidden="true" />
            )}
            <span>{compact ? t("quickPromisedShort") : t("quickPromised")}</span>
          </button>
        </div>
      )}

      {!compact ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenFullForm();
          }}
          className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
          data-row-action="true"
        >
          {t("quickAddDetails")}
        </button>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function isoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
}
