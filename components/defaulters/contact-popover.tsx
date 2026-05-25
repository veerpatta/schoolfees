"use client";

import { useActionState, useEffect } from "react";

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
};

const CHANNELS = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "in_person", label: "In person" },
  { value: "email", label: "Email" },
] as const;

const OUTCOMES = [
  { value: "reached", label: "Reached" },
  { value: "no_answer", label: "No answer" },
  { value: "promised_pay", label: "Promised to pay" },
  { value: "dispute", label: "Dispute / Query" },
  { value: "other", label: "Other" },
] as const;

const SNOOZE_OPTIONS = [
  { value: "", label: "No snooze" },
  { value: "2", label: "2 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
] as const;

const INITIAL_STATE: LogContactState = { status: "idle" };

export function ContactPopover({
  studentId,
  studentName,
  sessionLabel,
  open,
  onClose,
}: Props) {
  const [state, formAction, pending] = useActionState(
    logContactAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log contact"
      description={`Record a contact attempt for ${studentName}`}
      size="lg"
    >
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            Channel
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
                {ch.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            Outcome
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
                  defaultChecked={oc.value === "reached"}
                  className="accent-accent"
                />
                {oc.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label
            htmlFor={`snooze-${studentId}`}
            className="text-sm font-medium text-foreground"
          >
            Snooze follow-up
          </label>
          <select
            id={`snooze-${studentId}`}
            name="snoozeDays"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {SNOOZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            If set, this student moves to the &quot;This week&quot; or
            &quot;Snoozed&quot; tab.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor={`note-${studentId}`}
            className="text-sm font-medium text-foreground"
          >
            Note{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id={`note-${studentId}`}
            name="note"
            rows={3}
            placeholder="e.g. Will pay by 20th, needs installment breakdown…"
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
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            className="flex-1"
            disabled={pending}
          >
            {pending ? "Saving…" : "Log contact"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
