"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Label } from "@/ui/primitives/label";
import { Sheet } from "@/ui/primitives/sheet";
import { Textarea } from "@/ui/primitives/textarea";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

const FORM_ID = "send-reminder-form";

const selectClassName =
  "mt-1 flex h-11 w-full appearance-none rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Mirrors `SendRemindersState` from `src/app/protected/reminders/actions.ts`.
 *
 * Declared here rather than imported because `src/modules` may not import
 * `src/app` — `quality:architecture` counts every such edge and only lets the
 * count fall. The action itself arrives as a prop from the page for the same
 * reason.
 */
export type ReminderSendState = {
  status: "idle" | "success" | "partial" | "error";
  message?: string;
  sent?: number;
  failed?: number;
  alreadySentToday?: number;
  guards?: Array<{ code: string; message: string }>;
};

const IDLE: ReminderSendState = { status: "idle" };

export type SituationOption = { value: string; label: string };

type SendReminderSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Who gets the message. One id from a student page, many from the list. */
  studentIds: readonly string[];
  /** "KUSAM REGAR" or "12 students" — what the confirmation names. */
  audienceLabel: string;
  situationOptions: readonly SituationOption[];
  defaultSituation: string;
  defaultLanguage: string;
  action: (state: ReminderSendState, formData: FormData) => Promise<ReminderSendState>;
};

/**
 * Sends a WhatsApp fee reminder through the school's AiSensy number.
 *
 * It posts to the SAME server action the bulk send screen uses. That is the
 * point: `src/modules/whatsapp` owns one send path, and everything that makes
 * it safe — the quiet-hours and budget guards, the approved-template check, the
 * per-family grouping, the no-call flag, the claim-before-send that stops a
 * family being messaged twice, the run record and the contact log — lives
 * behind it. A second sender on the student page would have had none of that.
 *
 * Distinct from the "WhatsApp dues" chip beside it, which opens `wa.me` and
 * hands the typing to whoever is holding the phone. That one is free and
 * off-template; this one is a Meta-approved template sent from the school's own
 * number, and it is written down.
 */
export function SendReminderSheet({
  open,
  onClose,
  studentIds,
  audienceLabel,
  situationOptions,
  defaultSituation,
  defaultLanguage,
  action,
}: SendReminderSheetProps) {
  const fieldId = useId();
  const [situation, setSituation] = useState(defaultSituation);
  const [language, setLanguage] = useState(defaultLanguage);
  const [overrideReason, setOverrideReason] = useState("");
  const [state, formAction, pending] = useActionState(action, IDLE);

  // Toasts the outcome and refreshes the ledger underneath. "partial" is a
  // WARNING state in the hook, not a success — a run where four of twelve
  // messages failed must not announce itself in green. The sheet keeps the
  // detail on screen either way; the toast is for whoever has already looked
  // away.
  useActionFeedback(state, {
    successTitle: "Reminder sent",
    warningTitle: "Some reminders did not send",
    errorTitle: "Not sent",
  });

  useEffect(() => {
    if (open) {
      setSituation(defaultSituation);
      setLanguage(defaultLanguage);
      setOverrideReason("");
    }
  }, [open, defaultSituation, defaultLanguage]);

  // Guards that can be overridden come back on a refusal, each as its own
  // sentence. The office ticks them and says why; both land on the run record,
  // so "we sent during quiet hours because the parent was at the counter" is on
  // file rather than inferred later.
  const guards = state.guards ?? [];
  const needsOverride = state.status === "error" && guards.length > 0;
  const done = state.status === "success" || state.status === "partial";
  const canSubmit =
    studentIds.length > 0 &&
    (!needsOverride || overrideReason.trim().length >= 3);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
      }}
      title="Send fee reminder"
      description="A WhatsApp message from the school's number, using an approved template."
      size="full"
      /* Pinned outside the scroll body so the override reason's keyboard cannot
         bury the send button. */
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {done ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={FORM_ID} disabled={pending || !canSubmit}>
                {pending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Sending…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-4" aria-hidden="true" />
                    {needsOverride ? "Send anyway" : "Send"}
                  </span>
                )}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form id={FORM_ID} action={formAction} className="space-y-4 pb-2">
        {/*
          `studentId` is what the action sends to. `include` is what puts the
          family on the audience in the first place: a student named by hand
          joins the list whatever their cadence or snooze says, which is exactly
          what pressing this button means. Without it, a family already messaged
          this week would silently drop out and the button would report nothing
          to send.
        */}
        {studentIds.map((id) => (
          <input key={id} type="hidden" name="studentId" value={id} />
        ))}
        <input type="hidden" name="include" value={studentIds.join(",")} />

        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sending to</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{audienceLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Siblings on one number get a single message. A family who asked not to be called is
            never messaged, and nobody is messaged twice in a day.
          </p>
        </div>

        <div>
          <Label htmlFor={`${fieldId}-situation`}>Message</Label>
          <select
            id={`${fieldId}-situation`}
            name="situation"
            value={situation}
            onChange={(event) => setSituation(event.target.value)}
            className={selectClassName}
            disabled={pending || done}
          >
            {situationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            The amount is read from the ledger at send time, not from this screen.
          </p>
        </div>

        <div>
          <Label htmlFor={`${fieldId}-language`}>Language</Label>
          <select
            id={`${fieldId}-language`}
            name="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className={selectClassName}
            disabled={pending || done}
          >
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            A family who has stated a preference gets theirs, whatever is chosen here.
          </p>
        </div>

        {needsOverride ? (
          <div className="space-y-2 rounded-md bg-warning-soft px-3 py-2.5 text-xs text-warning-soft-foreground">
            <p className="font-semibold">{state.message}</p>
            <ul className="space-y-1.5">
              {guards.map((guard) => (
                <li key={guard.code} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="overrideGuard"
                    value={guard.code}
                    id={`${fieldId}-${guard.code}`}
                    defaultChecked
                    className="mt-0.5"
                  />
                  <label htmlFor={`${fieldId}-${guard.code}`}>{guard.message}</label>
                </li>
              ))}
            </ul>
            <div>
              <Label htmlFor={`${fieldId}-override`}>Why send anyway?</Label>
              <Textarea
                id={`${fieldId}-override`}
                name="overrideReason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={2}
                className="mt-1"
                placeholder="e.g. parent is at the counter asking for the amount"
                required
              />
            </div>
          </div>
        ) : null}

        {state.status === "error" && !needsOverride && state.message ? (
          <p
            role="alert"
            className="rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground"
          >
            {state.message}
          </p>
        ) : null}

        {done ? (
          <p
            role="status"
            className="rounded-md bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
          >
            {state.message ??
              `Sent ${state.sent ?? 0}.${state.alreadySentToday ? ` ${state.alreadySentToday} already had today's reminder.` : ""}`}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

type SendReminderTriggerProps = {
  studentId: string;
  studentLabel: string;
  situationOptions: readonly SituationOption[];
  defaultSituation: string;
  defaultLanguage: string;
  action: (state: ReminderSendState, formData: FormData) => Promise<ReminderSendState>;
  /**
   * The phone renders this in the fixed action bar beside Collect, where the
   * desk's 32px outline chip would be unhittable. One component, two shapes —
   * the sheet behind it is identical, and the student page mounts it in both
   * its trees.
   */
  surface?: "desk" | "phone";
};

/**
 * The one-tap fee reminder on a student's page.
 *
 * Rendered only when the student actually owes fees — a reminder to a family
 * who is clear is the fastest way to stop parents reading these messages.
 */
export function SendReminderTrigger({
  studentId,
  studentLabel,
  situationOptions,
  defaultSituation,
  defaultLanguage,
  action,
  surface = "desk",
}: SendReminderTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {surface === "phone" ? (
        // 56px tall, matching the Collect and WhatsApp buttons it sits beside.
        // `shrink-0` with a fixed width so a long student name in the row above
        // cannot squeeze it below a thumb's width.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-card text-[11px] font-extrabold text-foreground active:scale-[0.98]"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          <span>Remind</span>
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span>Send reminder</span>
        </Button>
      )}
      <SendReminderSheet
        open={open}
        onClose={() => setOpen(false)}
        studentIds={[studentId]}
        audienceLabel={studentLabel}
        situationOptions={situationOptions}
        defaultSituation={defaultSituation}
        defaultLanguage={defaultLanguage}
        action={action}
      />
    </>
  );
}
