"use client";

import { useActionState, useState, type ChangeEvent, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import {
  sendTestReminderAction,
  type TestSendState,
} from "@/app/protected/reminders/actions";
import {
  campaignFor,
  isCampaignApproved,
  isNoticeLanguage,
  isNoticeSituation,
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  noticeValuesFrom,
  type NoticeLanguage,
  type NoticeSituation,
  type NoticeSubject,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { lateFeePhrase, type LateFeeBasis } from "@/modules/whatsapp/domain/late-fee";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import {
  isMoneySlot,
  noticeValuesFromSlots,
  slotFormFromValues,
} from "@/modules/whatsapp/domain/test-send-values";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { SelectNative } from "@/ui/primitives/select-native";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

/**
 * Send one message to a number the office controls, for any of the seven
 * notices in either language.
 *
 * The panel has its own notice and language pickers, opening on the screen's.
 * Testing another template used to mean changing the notice ABOVE — which
 * rebuilt the whole audience for a message nobody was about to send — and the
 * office read that as "I can't test the other templates".
 *
 * The fields are driven by that campaign's `slotOrder`, so the panel can test
 * the shared 7-slot skeleton and `late_fee_applied`'s own without knowing
 * anything about either. The raw result is the point: a rejected campaign name
 * and a bad number both read as "it didn't work", and only the HTTP status, the
 * campaign echoed back and the provider's own error string tell them apart.
 *
 * Slot fields ↔ named values go through `domain/test-send-values.ts`, the same
 * function the action uses — so the preview here and the message that is sent
 * cannot disagree, on any notice.
 */

type Props = {
  /** Deliberately NOT gated on the date guard — see the action's comment. */
  canTest: boolean;
  situation: NoticeSituation;
  language: NoticeLanguage;
  lastDate: string;
  /** The screen's installment set; the context line is composed from it per notice. */
  installments: number[];
  /** The screen's late-fee lever, composed into slot 7 in the panel's language. */
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
  /**
   * Top row of the current list, for pre-fill. Null when the list is empty.
   *
   * `NoticeSubject` rather than a local shape: `ReminderCandidate` satisfies it
   * structurally, and it is what `noticeValuesFrom` — the send's own projection
   * — reads, so the opening values are exactly what that family would be sent.
   */
  sample: NoticeSubject | null;
};

const IDLE_TEST: TestSendState = { status: "idle" };

/**
 * Human labels for the slot names the registry declares.
 *
 * Every notice but `late_fee_applied` shares one 7-slot skeleton, so the labels
 * are per-slot-name and the SITUATION decides what slots 4-6 are called.
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

type OpeningSettings = {
  situation: NoticeSituation;
  language: NoticeLanguage;
  lastDate: string;
  installments: number[];
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
};

/**
 * Opening values: the real top row where we have one, projected through the
 * SAME `noticeValuesFrom` the send uses; the campaign's own Meta-submitted
 * sample where we do not, with the screen's date and late-fee phrase laid over
 * it. Both are true-shaped for that template.
 */
function valuesFrom(settings: OpeningSettings, sample: NoticeSubject | null): Record<string, string> {
  const { situation, language } = settings;
  const values: NoticeValues = sample
    ? noticeValuesFrom(sample, settings)
    : {
        ...campaignFor(situation, language).sample,
        lastDate: settings.lastDate || campaignFor(situation, language).sample.lastDate,
        lateFeePhrase: lateFeePhrase(settings.lateFeeAmount, settings.lateFeeBasis, language),
      };
  return slotFormFromValues(situation, values);
}

export function TestSendPanel({
  canTest,
  situation,
  language,
  lastDate,
  installments,
  lateFeeAmount,
  lateFeeBasis,
  sample,
}: Props) {
  // The panel's own choice, opening on the screen's. The page keys this
  // component on the screen's notice, so a change up there resets it.
  const [choice, setChoice] = useState<{ situation: NoticeSituation; language: NoticeLanguage }>({
    situation,
    language,
  });
  const campaign = campaignFor(choice.situation, choice.language);
  const settings: OpeningSettings = {
    situation: choice.situation,
    language: choice.language,
    lastDate,
    installments,
    lateFeeAmount,
    lateFeeBasis,
  };
  const [testPhone, setTestPhone] = useState("");
  const [form, setForm] = useState<Record<string, string>>(() => valuesFrom(settings, sample));
  const [testState, testFormAction] = useActionState(sendTestReminderAction, IDLE_TEST);

  // A different template has different slots, so the fields are refilled from
  // the same top row (or that campaign's sample) rather than carried across.
  const choose = (next: Partial<typeof choice>) => {
    const merged = { ...choice, ...next };
    if (!isCampaignApproved(merged.situation, merged.language)) return;
    setChoice(merged);
    setForm(valuesFrom({ ...settings, ...merged }, sample));
  };

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

  // The skeleton is positional; `NoticeValues` is named. The one function that
  // joins them is shared with the action, so what is previewed here is what is
  // sent — on every notice, not just the three the first version covered.
  const preview = campaign.renderPreview(
    noticeValuesFromSlots(choice.situation, form, campaign.sample),
  );
  const destination = toWhatsappDestination(testPhone);

  return (
    <form action={testFormAction} className="space-y-4">
      {/* The action re-resolves the campaign from these two fields, so the test
          goes through exactly the campaign the panel is showing. */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="testSituation">Notice</Label>
          <SelectNative
            id="testSituation"
            name="situation"
            value={choice.situation}
            onChange={(event) => {
              const next = event.target.value;
              if (isNoticeSituation(next)) choose({ situation: next });
            }}
          >
            {NOTICE_SITUATIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="testLanguage">Language</Label>
          <SelectNative
            id="testLanguage"
            name="language"
            value={choice.language}
            onChange={(event) => {
              const next = event.target.value;
              if (isNoticeLanguage(next)) choose({ language: next });
            }}
          >
            {NOTICE_LANGUAGES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <p className="self-end text-xs text-muted-foreground">
          <strong className="font-mono">{campaign.campaignName}</strong>, {campaign.slotOrder.length}{" "}
          slots.
        </p>
      </div>

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
              {SITUATION_SLOT_LABELS[choice.situation][slot] ?? SLOT_LABELS[slot] ?? slot}
            </Label>
            <Input
              id={`slot-${slot}`}
              name={slot}
              type={isMoneySlot(choice.situation, slot) ? "number" : "text"}
              min={isMoneySlot(choice.situation, slot) ? 0 : undefined}
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
          onClick={() => setForm(valuesFrom(settings, sample))}
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
