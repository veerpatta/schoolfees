"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, HandshakeIcon, Loader2, PhoneOff, PhoneCall } from "lucide-react";

import { quickLogContact } from "@/app/protected/defaulters/actions";
import { cn } from "@/lib/utils";

type Props = {
  studentId: string;
  sessionLabel: string;
  /** Inferred from the last attempt; defaults to "call". */
  defaultChannel?: "call" | "whatsapp" | "sms" | "in_person" | "email";
  /** Open the full-form sheet (for Dispute / Other / add note). */
  onOpenFullForm: () => void;
  /** Compact icon-only buttons (for desktop table cells). */
  compact?: boolean;
};

type PendingKind = "no_answer" | "reached" | "promised" | null;

/**
 * One-tap log buttons. No modal, no form. The Promised button expands inline
 * to a tiny date picker (Today / Tomorrow / Pick date). Anything more complex
 * (Dispute, Other, add note, voice note) opens the full sheet via onOpenFullForm.
 */
export function QuickLogButtons({
  studentId,
  sessionLabel,
  defaultChannel = "call",
  onOpenFullForm,
  compact = false,
}: Props) {
  const t = useTranslations("Defaulters");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<PendingKind>(null);
  const [confirmed, setConfirmed] = useState<PendingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPromiseOptions, setShowPromiseOptions] = useState(false);

  function submit(
    kind: PendingKind,
    args: Parameters<typeof quickLogContact>[0],
  ) {
    setPendingKind(kind);
    setError(null);
    startTransition(async () => {
      const result = await quickLogContact(args);
      if (result.ok) {
        setConfirmed(kind);
        setShowPromiseOptions(false);
        // Brief acknowledgement, then refresh the worklist.
        window.setTimeout(() => {
          setConfirmed(null);
          router.refresh();
        }, 700);
      } else {
        setError(result.message ?? "Could not save.");
      }
      setPendingKind(null);
    });
  }

  function handleNoAnswer() {
    submit("no_answer", {
      studentId,
      sessionLabel,
      outcome: "no_answer",
      channel: defaultChannel,
    });
  }

  function handleReached() {
    submit("reached", {
      studentId,
      sessionLabel,
      outcome: "reached",
      channel: defaultChannel,
    });
  }

  function handlePromised(promisedDate: string) {
    submit("promised", {
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
              confirmed === "no_answer"
                ? "border-success bg-success text-success-foreground"
                : "border border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground hover:bg-warning-soft/80",
            )}
            aria-label={t("quickNoAnswerAria")}
          >
            {pendingKind === "no_answer" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : confirmed === "no_answer" ? (
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
              confirmed === "reached"
                ? "border-success bg-success text-success-foreground"
                : "border border-info-soft bg-info-soft text-info-soft-foreground hover:bg-info-soft/80",
            )}
            aria-label={t("quickReachedAria")}
          >
            {pendingKind === "reached" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : confirmed === "reached" ? (
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
              confirmed === "promised"
                ? "border-success bg-success text-success-foreground"
                : "border border-success/40 bg-success-soft text-success-soft-foreground hover:bg-success-soft/80",
            )}
            aria-label={t("quickPromisedAria")}
          >
            {confirmed === "promised" ? (
              <Check className="size-4" aria-hidden="true" />
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
