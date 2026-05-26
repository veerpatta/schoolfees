"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { VoiceNoteRecorder } from "@/components/defaulters/voice-note-recorder";
import {
  logContactAction,
  type LogContactState,
} from "@/app/protected/defaulters/actions";

type Props = {
  studentId: string;
  studentName: string;
  sessionLabel: string;
  open: boolean;
  onClose: () => void;
  /** Pre-select an outcome (e.g. when the user picked Dispute from the card). */
  initialOutcome?: "reached" | "no_answer" | "promised_pay" | "dispute" | "other";
};

const CHANNELS = [
  { value: "call", i18nKey: "channelCall" },
  { value: "whatsapp", i18nKey: "channelWhatsapp" },
  { value: "sms", i18nKey: "channelSms" },
  { value: "in_person", i18nKey: "channelInPerson" },
  { value: "email", i18nKey: "channelEmail" },
] as const;

const OUTCOMES = [
  { value: "reached", i18nKey: "outcomeReached" },
  { value: "no_answer", i18nKey: "outcomeNoAnswer" },
  { value: "promised_pay", i18nKey: "outcomePromisedPay" },
  { value: "dispute", i18nKey: "outcomeDispute" },
  { value: "other", i18nKey: "outcomeOther" },
] as const;

const SNOOZE_OPTIONS = [
  { value: "", i18nKey: "snoozeNone" },
  { value: "2", i18nKey: "snooze2Days" },
  { value: "7", i18nKey: "snooze1Week" },
  { value: "14", i18nKey: "snooze2Weeks" },
  { value: "30", i18nKey: "snooze1Month" },
] as const;

const INITIAL_STATE: LogContactState = { status: "idle" };

function isoDateToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\//g, "-");
}

export function ContactPopover({
  studentId,
  studentName,
  sessionLabel,
  open,
  onClose,
  initialOutcome = "reached",
}: Props) {
  const t = useTranslations("Defaulters");
  const [state, formAction, pending] = useActionState(
    logContactAction,
    INITIAL_STATE,
  );
  const [outcome, setOutcome] = useState<typeof OUTCOMES[number]["value"]>(initialOutcome);

  useEffect(() => {
    if (open) setOutcome(initialOutcome);
  }, [open, initialOutcome]);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("popoverTitle")}
      description={t("popoverDescription", { name: studentName })}
      size="lg"
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {t("popoverChannel")}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CHANNELS.map((ch) => (
              <label
                key={ch.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm text-foreground hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="channel"
                  value={ch.value}
                  defaultChecked={ch.value === "call"}
                  className="accent-accent"
                />
                {t(ch.i18nKey)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {t("popoverOutcome")}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OUTCOMES.map((oc) => (
              <label
                key={oc.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm text-foreground hover:bg-surface-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="outcome"
                  value={oc.value}
                  checked={outcome === oc.value}
                  onChange={() => setOutcome(oc.value)}
                  className="accent-accent"
                />
                {t(oc.i18nKey)}
              </label>
            ))}
          </div>
        </fieldset>

        {outcome === "promised_pay" ? (
          <div className="space-y-2 rounded-lg border border-success/40 bg-success-soft/40 p-3">
            <label
              htmlFor={`promised-${studentId}`}
              className="text-sm font-medium text-foreground"
            >
              {t("popoverPromisedDateLabel")}
            </label>
            <input
              id={`promised-${studentId}`}
              type="date"
              name="promisedDate"
              min={isoDateToday()}
              defaultValue={isoDateToday()}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
            <p className="text-xs text-muted-foreground">{t("popoverPromisedDateHint")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor={`snooze-${studentId}`}
              className="text-sm font-medium text-foreground"
            >
              {t("popoverSnoozeLabel")}
            </label>
            <select
              id={`snooze-${studentId}`}
              name="snoozeDays"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {SNOOZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.i18nKey)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("popoverSnoozeHint")}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label
            htmlFor={`note-${studentId}`}
            className="text-sm font-medium text-foreground"
          >
            {t("popoverNoteLabel")}{" "}
            <span className="font-normal text-muted-foreground">{t("popoverNoteOptional")}</span>
          </label>
          <textarea
            id={`note-${studentId}`}
            name="note"
            rows={3}
            placeholder={t("popoverNotePlaceholder")}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <VoiceNoteRecorder studentId={studentId} inputName="voiceNotePath" />

        {state.status === "error" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={pending}
          >
            {t("popoverCancel")}
          </Button>
          <Button
            type="submit"
            variant="accent"
            className="flex-1"
            disabled={pending}
          >
            {pending ? t("popoverSaving") : t("popoverSubmit")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
