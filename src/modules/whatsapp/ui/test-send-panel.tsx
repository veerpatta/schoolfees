"use client";

import { useActionState, useState, type ChangeEvent, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import {
  sendTestReminderAction,
  type TestSendState,
} from "@/app/protected/admin-tools/whatsapp-reminders/actions";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import {
  renderReminderPreview,
  type ReminderTemplateValues,
} from "@/modules/whatsapp/domain/reminder-template";

/**
 * Send one message to a number the office controls, with every template slot
 * editable and the result shown raw.
 *
 * The raw result is the point: a rejected campaign name and a bad number both
 * read as "it didn't work", and only the HTTP status, the campaign echoed back,
 * and the provider's own error string tell them apart. Staff should not need
 * the AiSensy dashboard to know which one they are looking at.
 */

type Props = {
  sessionLabel: string;
  /** Deliberately NOT gated on the template deadline — see the action's comment. */
  canTest: boolean;
  campaignName: string | null;
  /** Top row of the current list, for pre-fill. Null when the list is empty. */
  sample: ReminderTemplateValues | null;
};

const IDLE_TEST: TestSendState = { status: "idle" };

/**
 * The server action's own fallbacks, mirrored here so the preview tells the
 * truth about what an empty field actually sends.
 */
const FALLBACKS = {
  parentName: "अभिभावक",
  studentName: "Test Student",
  studentClass: "Class 5",
  dueAmount: 9100,
} as const;

function valuesFrom(sample: ReminderTemplateValues | null) {
  return {
    testPhone: "",
    parentName: sample?.parentName ?? FALLBACKS.parentName,
    studentName: sample?.studentName ?? FALLBACKS.studentName,
    studentClass: sample?.studentClass ?? FALLBACKS.studentClass,
    dueAmount: String(sample?.dueAmount ?? FALLBACKS.dueAmount),
  };
}

export function TestSendPanel({ sessionLabel, canTest, campaignName, sample }: Props) {
  const [form, setForm] = useState(() => valuesFrom(sample));
  const [testState, testFormAction] = useActionState(sendTestReminderAction, IDLE_TEST);

  // No `refreshOnSuccess`: a test writes nothing, so re-running the audience
  // query would be churn — and it would wipe the typed-in fields' sibling
  // state on a screen whose whole point is iterating on the message.
  useActionFeedback(testState, {
    successTitle: "AiSensy accepted it",
    errorTitle: "AiSensy did not accept it",
    refreshOnSuccess: false,
  });

  const set =
    (key: keyof ReturnType<typeof valuesFrom>) => (event: ChangeEvent<HTMLInputElement>) =>
      setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const amount = Number(form.dueAmount);
  const preview = renderReminderPreview({
    sessionLabel,
    parentName: form.parentName.trim() || FALLBACKS.parentName,
    studentName: form.studentName.trim() || FALLBACKS.studentName,
    studentClass: form.studentClass.trim() || FALLBACKS.studentClass,
    dueAmount: Number.isFinite(amount) ? amount : 0,
  });

  const destination = toWhatsappDestination(form.testPhone);

  return (
    <form action={testFormAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="testParentName">Name on the message</Label>
          <Input
            id="testParentName"
            name="parentName"
            value={form.parentName}
            onChange={set("parentName")}
          />
          <p className="text-xs text-muted-foreground">
            Whatever the &ldquo;प्रिय …&rdquo; line should say. &ldquo;Ramesh ji&rdquo; is fine.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="testPhone">Send to</Label>
          <Input
            id="testPhone"
            name="testPhone"
            type="tel"
            placeholder="10-digit mobile"
            value={form.testPhone}
            onChange={set("testPhone")}
          />
          <p className="text-xs text-muted-foreground">
            {form.testPhone.trim() === "" ? (
              "Use a number the office controls."
            ) : destination ? (
              <>
                Will send to <span className="font-mono">{destination}</span>
              </>
            ) : (
              "Not a valid Indian mobile — AiSensy needs a country code."
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="testStudentName">Student name</Label>
          <Input
            id="testStudentName"
            name="studentName"
            value={form.studentName}
            onChange={set("studentName")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="testStudentClass">Class</Label>
          <Input
            id="testStudentClass"
            name="studentClass"
            value={form.studentClass}
            onChange={set("studentClass")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="testDueAmount">Amount the message quotes</Label>
          <Input
            id="testDueAmount"
            name="dueAmount"
            type="number"
            min={0}
            value={form.dueAmount}
            onChange={set("dueAmount")}
          />
        </div>
      </div>

      {/* Same renderer as the list preview, so the two can never disagree. */}
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="size-4" aria-hidden="true" />
          What will arrive
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
          {preview}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          A copy of the approved template for preview only — WhatsApp sends whatever Meta approved,
          not this text. The rest of the message carries the UPI link and office number.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Stays inside this <form>: useFormStatus reads the nearest ancestor
            form, and only from a descendant of it. */}
        <PendingSubmitButton
          variant="outline"
          idleLabel="Send test"
          pendingLabel="Sending…"
          disabled={!canTest || !destination}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!sample}
          onClick={() => setForm(valuesFrom(sample))}
        >
          Fill from top row
        </Button>
        <span className="text-xs text-muted-foreground">
          Never recorded against a family, so nobody drops out of the list above.
        </span>
      </div>

      {testState.status !== "idle" ? (
        <TestResult state={testState} campaignName={campaignName} />
      ) : null}
    </form>
  );
}

function Pair({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold">{label}</dt>
      <dd className={mono ? "min-w-0 break-all font-mono" : "min-w-0 break-words"}>{value}</dd>
    </div>
  );
}

function TestResult({
  state,
  campaignName,
}: {
  state: TestSendState;
  campaignName: string | null;
}) {
  const failed = state.status === "error";

  return (
    <Notice
      tone={failed ? "danger" : "success"}
      title={failed ? "AiSensy did not accept it" : "AiSensy accepted it"}
    >
      <p>{state.message}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {/* "never sent" is the diagnosis, not a missing value: the call was
            refused here before it ever reached the provider. */}
        <Pair label="HTTP status" value={state.httpStatus ?? "never sent"} />
        <Pair label="Campaign" value={state.campaignName ?? campaignName ?? "—"} mono />
        <Pair label="Destination" value={state.destination ?? "—"} mono />
        <Pair label="submitted_message_id" value={state.messageId ?? "—"} mono />
      </dl>
      {state.providerError ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 px-2 py-1.5 font-mono text-xs">
          {state.providerError}
        </pre>
      ) : null}
      {state.templateParams ? (
        <p className="mt-2 text-xs">
          Params sent: <span className="font-mono">{JSON.stringify(state.templateParams)}</span>
        </p>
      ) : null}
    </Notice>
  );
}
