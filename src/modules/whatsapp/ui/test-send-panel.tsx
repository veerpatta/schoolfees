"use client";

import { useActionState, useState, type ChangeEvent, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import {
  sendTestReminderAction,
  type TestSendState,
} from "@/app/protected/reminders/actions";
import {
  campaignFor,
  NOTICE_SITUATIONS,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

/**
 * Send one message to a number the office controls, for whichever of the six
 * notices is selected.
 *
 * The fields are driven by that campaign's `slotOrder`, so the panel can test a
 * 6-slot notice and a 5-slot one without knowing anything about either. The raw
 * result is the point: a rejected campaign name and a bad number both read as
 * "it didn't work", and only the HTTP status, the campaign echoed back and the
 * provider's own error string tell them apart.
 */

type SampleCandidate = {
  parentName: string;
  studentName: string;
  studentClass: string;
  dueAmount: number;
  totalPaid: number;
  balanceDue: number;
  prevYearBalance: number;
  prevSessionLabel: string | null;
};

type Props = {
  /** Deliberately NOT gated on the date guard — see the action's comment. */
  canTest: boolean;
  situation: NoticeSituation;
  language: NoticeLanguage;
  lastDate: string;
  installmentPhrase: string;
  /** Already composed by `domain/late-fee.ts` from the screen's amount + basis. */
  lateFeePhrase: string;
  /** Top row of the current list, for pre-fill. Null when the list is empty. */
  sample: SampleCandidate | null;
};

const IDLE_TEST: TestSendState = { status: "idle" };

/** Human labels for the slot names the registry declares. */
/**
 * All six campaigns share one 7-slot skeleton, so the labels are per-slot-name
 * and the SITUATION decides what slots 4-6 are called.
 */
const SLOT_LABELS: Record<string, string> = {
  parentName: "Name on the message",
  studentName: "Student name",
  studentClass: "Class",
  contextLine: "Context",
  amount: "Amount",
  date: "Date (DD-MM-YYYY)",
  lateFeePhrase: "Late fee phrase",
  // `late_fee_applied` is the one notice off the shared skeleton: three money
  // slots and no date, because the fee is charged rather than threatened.
  feesPending: "Fees pending",
  lateFeeApplied: "Late fee applied",
  totalToPay: "Total to pay",
};

/** What slots 4, 5 and 6 actually mean, per notice. */
const SITUATION_SLOT_LABELS: Record<NoticeSituation, Record<string, string>> = {
  upcoming: { contextLine: "Installment", amount: "Amount due", date: "Last date (DD-MM-YYYY)" },
  upcoming_final: { contextLine: "Installment", amount: "Amount payable", date: "Last date (DD-MM-YYYY)" },
  fee_due: { contextLine: "Installment", amount: "Amount due", date: "Last date (DD-MM-YYYY)" },
  balance: { contextLine: "Received so far", amount: "Balance due", date: "Next date (DD-MM-YYYY)" },
  late_fee_applied: { contextLine: "Installment" },
  promise_lapsed: { contextLine: "Date given (DD-MM-YYYY)", amount: "Amount pending", date: "New date (DD-MM-YYYY)" },
  prevyear: { contextLine: "Session", amount: "Balance", date: "Settle by (DD-MM-YYYY)" },
};

/** Slot 4 is money on `balance` only; on the other two it is text. */
const MONEY_SLOT_BY_SITUATION: Record<NoticeSituation, ReadonlySet<string>> = {
  upcoming: new Set(["amount"]),
  upcoming_final: new Set(["amount"]),
  fee_due: new Set(["amount"]),
  balance: new Set(["contextLine", "amount"]),
  // All three of its money slots, and its context line is the installment text.
  late_fee_applied: new Set(["feesPending", "lateFeeApplied", "totalToPay"]),
  // Slot 4 is the promised DATE here, not money.
  promise_lapsed: new Set(["amount"]),
  prevyear: new Set(["amount"]),
};

/**
 * Opening values: the real top row where we have one, the campaign's own
 * Meta-submitted sample where we do not. Both are true-shaped for that template.
 */
function valuesFrom(
  situation: NoticeSituation,
  language: NoticeLanguage,
  sample: SampleCandidate | null,
  lastDate: string,
  installmentPhrase: string,
  lateFeePhrase: string,
): Record<string, string> {
  const fallback = campaignFor(situation, language).sample;
  const pick = (real: string | number | null | undefined, spare: string | number | undefined) =>
    String(real ?? "").trim() !== "" && real !== 0 ? String(real) : String(spare ?? "");

  // Slots 4 and 5 mean different things per notice, so they are filled per
  // notice; 1-3, 6 and 7 are the same everywhere.
  const contextLine =
    situation === "fee_due"
      ? installmentPhrase || (fallback.installmentPhrase ?? "")
      : situation === "balance"
        ? pick(sample?.totalPaid, fallback.receivedSoFar)
        : pick(sample?.prevSessionLabel, fallback.prevSessionLabel);

  const amount =
    situation === "fee_due"
      ? pick(sample?.dueAmount, fallback.amountDue)
      : situation === "balance"
        ? pick(sample?.balanceDue, fallback.balanceDue)
        : pick(sample?.prevYearBalance, fallback.prevYearBalance);

  return {
    parentName: pick(sample?.parentName, fallback.parentName),
    studentName: pick(sample?.studentName, fallback.studentName),
    studentClass: pick(sample?.studentClass, fallback.studentClass),
    contextLine,
    amount,
    date: lastDate || (fallback.lastDate ?? ""),
    lateFeePhrase: lateFeePhrase || (fallback.lateFeePhrase ?? ""),
  };
}

export function TestSendPanel({
  canTest,
  situation,
  language,
  lastDate,
  installmentPhrase,
  lateFeePhrase,
  sample,
}: Props) {
  const campaign = campaignFor(situation, language);
  const [testPhone, setTestPhone] = useState("");
  const [form, setForm] = useState<Record<string, string>>(() =>
    valuesFrom(situation, language, sample, lastDate, installmentPhrase, lateFeePhrase),
  );
  const [testState, testFormAction] = useActionState(sendTestReminderAction, IDLE_TEST);

  // No `refreshOnSuccess`: a test writes nothing, so re-running the audience
  // query would be churn — and it would wipe the typed-in fields on a screen
  // whose whole point is iterating on the message.
  useActionFeedback(testState, {
    successTitle: "AiSensy accepted it",
    errorTitle: "AiSensy did not accept it",
    refreshOnSuccess: false,
  });

  const set = (slot: string) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [slot]: event.target.value }));

  /**
   * The skeleton is positional; `NoticeValues` is named. This is the one place
   * the two meet, and it must agree with the per-situation builders in
   * `campaigns.ts` or the preview and the send would disagree.
   */
  const asValues = (): NoticeValues => {
    const shared = {
      parentName: form.parentName,
      studentName: form.studentName,
      studentClass: form.studentClass,
      lastDate: form.date,
      lateFeePhrase: form.lateFeePhrase,
    };
    const amount = Number(form.amount) || 0;
    if (situation === "fee_due") {
      return { ...shared, installmentPhrase: form.contextLine, amountDue: amount };
    }
    if (situation === "balance") {
      return { ...shared, receivedSoFar: Number(form.contextLine) || 0, balanceDue: amount };
    }
    return { ...shared, prevSessionLabel: form.contextLine, prevYearBalance: amount };
  };

  const preview = campaign.renderPreview(asValues());
  const destination = toWhatsappDestination(testPhone);
  const situationLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === situation)?.label ?? situation;

  return (
    <form action={testFormAction} className="space-y-4">
      {/* The action re-resolves the campaign from these, so the test goes through
          exactly the campaign the screen is showing. */}
      <input type="hidden" name="situation" value={situation} />
      <input type="hidden" name="language" value={language} />

      <p className="text-xs text-muted-foreground">
        Testing <strong className="font-mono">{campaign.campaignName}</strong> — the{" "}
        {situationLabel.toLowerCase()} notice, {campaign.slotOrder.length} slots. Change the notice
        or language above to test a different one.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="testPhone">Send to</Label>
        <Input
          id="testPhone"
          name="testPhone"
          type="tel"
          placeholder="10-digit mobile"
          value={testPhone}
          onChange={(event) => setTestPhone(event.target.value)}
          className="md:max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          {testPhone.trim() === "" ? (
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

      {/* One field per slot the selected campaign declares, in its order. */}
      <div className="grid gap-4 md:grid-cols-3">
        {campaign.slotOrder.map((slot, index) => (
          <div key={slot} className="space-y-1.5">
            <Label htmlFor={`slot-${slot}`}>
              {`{{${index + 1}}} `}
              {SITUATION_SLOT_LABELS[situation][slot] ?? SLOT_LABELS[slot] ?? slot}
            </Label>
            <Input
              id={`slot-${slot}`}
              name={slot}
              type={MONEY_SLOT_BY_SITUATION[situation].has(slot) ? "number" : "text"}
              min={MONEY_SLOT_BY_SITUATION[situation].has(slot) ? 0 : undefined}
              value={form[slot] ?? ""}
              onChange={set(slot)}
            />
          </div>
        ))}
      </div>

      {/* Same renderer the list preview uses, so the two can never disagree. */}
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
          not this text.
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
          onClick={() =>
            setForm(
              valuesFrom(situation, language, sample, lastDate, installmentPhrase, lateFeePhrase),
            )
          }
        >
          Fill from top row
        </Button>
        <span className="text-xs text-muted-foreground">
          Never recorded against a family, so nobody drops out of the list above.
        </span>
      </div>

      {testState.status !== "idle" ? (
        <TestResult state={testState} campaignName={campaign.campaignName} />
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
          Params sent ({state.templateParams.length}):{" "}
          <span className="font-mono">{JSON.stringify(state.templateParams)}</span>
        </p>
      ) : null}
    </Notice>
  );
}
