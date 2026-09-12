"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

/**
 * Mirrors `SendReceiptActionState` from
 * `src/app/protected/receipts/actions.ts`.
 *
 * Declared here rather than imported because `src/modules` may not import
 * `src/app`. The action arrives as a prop for the same reason.
 */
export type SendReceiptState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const IDLE: SendReceiptState = { status: "idle" };

type SendReceiptButtonProps = {
  receiptId: string;
  action: (state: SendReceiptState, formData: FormData) => Promise<SendReceiptState>;
  /**
   * `inline` is the chip on a receipt page or preview sheet. `phone` is the
   * 56px control in the mobile receipt action bar, where a 32px chip would be
   * unhittable.
   */
  surface?: "inline" | "phone";
  /** Overrides the label. The payment success screen says "Send receipt". */
  label?: string;
};

/**
 * Send this receipt to the parent, in one tap.
 *
 * Most of the time nobody presses this: posting a payment sends the receipt by
 * itself. It exists for the rest — a payment taken before the automatic send
 * was switched on, a number added after the fact, a provider failure.
 *
 * What was here before opened `wa.me` with pre-written text and left the PDF to
 * be downloaded and attached by hand, on the staff member's own WhatsApp,
 * recorded nowhere. This sends from the school's number with the PDF attached,
 * and writes down that it did.
 */
export function SendReceiptButton({
  receiptId,
  action,
  surface = "inline",
  label = "Send on WhatsApp",
}: SendReceiptButtonProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  useActionFeedback(state, {
    successTitle: "Receipt sent",
    errorTitle: "Not sent",
  });

  if (surface === "phone") {
    return (
      <form action={formAction} className="contents">
        <input type="hidden" name="receiptId" value={receiptId} />
        <button
          type="submit"
          disabled={pending}
          className="focus-ring flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-card text-[11px] font-extrabold text-foreground active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          <span>Send</span>
        </button>
      </form>
    );
  }

  return (
    <div className="no-print">
      <form action={formAction}>
        <input type="hidden" name="receiptId" value={receiptId} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 px-3 text-xs"
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-3.5" aria-hidden="true" />
          )}
          {pending ? "Sending…" : label}
        </Button>
      </form>

      {state.status !== "idle" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "mt-2 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground"
              : "mt-2 rounded-md bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
