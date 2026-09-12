"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

/**
 * Mirrors `WhatsappSettingsActionState` from
 * `src/app/protected/settings/whatsapp/actions.ts`. Declared rather than
 * imported because `src/modules` may not import `src/app`.
 */
export type WhatsappSettingsFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const IDLE: WhatsappSettingsFormState = { status: "idle" };

export type WhatsappSettingsFormValues = {
  receiptNoticeEnabled: boolean;
  reversalNoticeEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  runMessageCap: number;
  monthMessageCap: number;
  oneMessagePerFamily: boolean;
};

type Props = {
  initial: WhatsappSettingsFormValues;
  /** This month's billed messages, or null when it could not be counted. */
  messagesSentThisMonth: number | null;
  canEdit: boolean;
  action: (
    state: WhatsappSettingsFormState,
    formData: FormData,
  ) => Promise<WhatsappSettingsFormState>;
};

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * The six knobs behind every parent-facing WhatsApp message.
 *
 * Every one of these existed before this screen did, and every one was
 * reachable only by editing `app_settings` in the database — which meant
 * switching on automatic receipts was a production SQL statement, and the
 * monthly budget was a number seeded in a migration that nobody could look up.
 *
 * Uncontrolled inputs with `defaultValue`, deliberately: the server is the
 * source of truth, the form posts the whole set at once, and a revalidated page
 * re-renders from what was actually saved rather than from what was typed.
 */
export function WhatsappSettingsForm({
  initial,
  messagesSentThisMonth,
  canEdit,
  action,
}: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  useActionFeedback(state, {
    successTitle: "WhatsApp settings saved",
    errorTitle: "Not saved",
  });

  const disabled = !canEdit || pending;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">What the school sends by itself</h3>
        <Toggle
          name="receiptNoticeEnabled"
          label="Send the receipt on WhatsApp when a payment is posted"
          hint="The receipt PDF goes to the parent from the school's number, seconds after the cashier posts. Payment Desk only — bulk upload and write-off close-outs stay silent."
          defaultChecked={initial.receiptNoticeEnabled}
          disabled={disabled}
        />
        <Toggle
          name="reversalNoticeEnabled"
          label="Tell a family when a payment of theirs is reversed"
          hint="A reversal is invisible to a parent today: they hold a receipt that says they paid, and the first they hear is a reminder. The 10-minute undo at the counter never sends this."
          defaultChecked={initial.reversalNoticeEnabled}
          disabled={disabled}
        />
        <Toggle
          name="oneMessagePerFamily"
          label="Siblings on one phone get one message"
          hint="A parent with three children receives one message naming all three and quoting one total, rather than three messages quoting three balances for one debt."
          defaultChecked={initial.oneMessagePerFamily}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">When messages may go out</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quietHoursStart">Not before (IST)</Label>
            <Input
              id="quietHoursStart"
              name="quietHoursStart"
              type="number"
              min={0}
              max={23}
              defaultValue={initial.quietHoursStart}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="quietHoursEnd">Not after (IST)</Label>
            <Input
              id="quietHoursEnd"
              name="quietHoursEnd"
              type="number"
              min={0}
              max={23}
              defaultValue={initial.quietHoursEnd}
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          An admin can still send outside these hours by saying why — the reason goes on the run
          record.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">The budget</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="runMessageCap">Messages in one run</Label>
            <Input
              id="runMessageCap"
              name="runMessageCap"
              type="number"
              min={1}
              defaultValue={initial.runMessageCap}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="monthMessageCap">Messages in a month</Label>
            <Input
              id="monthMessageCap"
              name="monthMessageCap"
              type="number"
              min={1}
              defaultValue={initial.monthMessageCap}
              disabled={disabled}
              className="mt-1"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {/* Null is said out loud rather than rendered as zero. "0 used" is a
              claim about the month; an unreadable count is not one.

              Unformatted on purpose: these are message counts, not rupees, and
              `formatInr` would put a currency symbol in front of them. */}
          {messagesSentThisMonth === null
            ? "This month's usage could not be read."
            : `${messagesSentThisMonth} of ${initial.monthMessageCap} used this month.`}
        </p>
      </div>

      {state.status !== "idle" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground"
              : "rounded-md bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={disabled}>
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Saving…
              </span>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only an admin can change these.
        </p>
      )}
    </form>
  );
}
