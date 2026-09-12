"use client";

import { useId, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Label } from "@/ui/primitives/label";
import { Textarea } from "@/ui/primitives/textarea";
import { formatInr } from "@/platform/helpers/currency";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

export type HeldCharge = {
  installmentId: string;
  installmentLabel: string;
  dueDate: string;
  amountDue: number;
  /** Cash receipted against this row. Non-zero is why the engine held it. */
  appliedAmount: number;
};

type LeftStudentHeldChargesProps = {
  studentId: string;
  leftOn: string;
  charges: readonly HeldCharge[];
  /**
   * Bound by the Danger Zone, which already holds the (baselined) import from
   * `src/app`. `src/modules` may not reach into it.
   */
  state: { status: "idle" | "success" | "error"; message: string | null };
  formAction: (formData: FormData) => void;
  pending: boolean;
};

/**
 * Charges that fall after a student's leave date and are still being billed.
 *
 * The fee engine cancels un-accrued installments on its own, but it refuses any
 * row carrying money or adjustment history — cancelling one silently would drop
 * its payments out of the settlement pool, so the family's `total_paid` would
 * fall and they could disappear from the money scope altogether. The lock is
 * correct and it deliberately asks for a person.
 *
 * Nothing used to let a person answer. The rows were counted as "kept for
 * review" and there was no review anywhere, so the only exit an office could
 * find was writing the whole balance off as though the charge had been real —
 * which is how a term a child never attended ended up on the books as a
 * discount.
 */
export function LeftStudentHeldCharges({
  studentId,
  leftOn,
  charges,
  state,
  formAction,
  pending,
}: LeftStudentHeldChargesProps) {
  const fieldId = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useActionFeedback(state, {
    successTitle: "Charge cancelled",
    errorTitle: "Not cancelled",
  });

  if (charges.length === 0) {
    return null;
  }

  const total = charges.reduce((sum, charge) => sum + charge.amountDue, 0);
  const anyCarryMoney = charges.some((charge) => charge.appliedAmount > 0);

  return (
    <div className="lg:col-span-2 rounded-lg border border-warning/40 bg-warning-soft/40 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warning-soft-foreground"
          aria-hidden="true"
        />
        <div>
          <p className="font-semibold text-foreground">
            Still charged for after they left — {formatInr(total)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {charges.length === 1 ? "This charge falls" : "These charges fall"} due after{" "}
            <strong className="text-foreground">{leftOn}</strong>, so{" "}
            {charges.length === 1 ? "it is" : "they are"} a term this student was not here for.
            The fee engine left {charges.length === 1 ? "it" : "them"} alone because{" "}
            {anyCarryMoney
              ? "money has been receipted against them, and cancelling that silently would take the payment out of the family's ledger."
              : "of the ledger history on them."}
          </p>
        </div>
      </div>

      {anyCarryMoney ? (
        <p className="mt-2.5 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Reverse an over-posted write-off first.</strong> A
          write-off pinned to one of these rows stops counting the moment the row is cancelled,
          which leaves the family reading as though the school owes them money. Reverse it, cancel
          here, then write off what genuinely remains.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {charges.map((charge) => {
          const isOpen = openId === charge.installmentId;
          return (
            <li key={charge.installmentId} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{charge.installmentLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    due {charge.dueDate}
                    {charge.appliedAmount > 0
                      ? ` · ${formatInr(charge.appliedAmount)} receipted against it`
                      : ""}
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-foreground">
                  {formatInr(charge.amountDue)}
                </span>
              </div>

              {isOpen ? (
                <form action={formAction} className="mt-2.5 space-y-2">
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="installmentId" value={charge.installmentId} />
                  <div>
                    <Label htmlFor={`${fieldId}-${charge.installmentId}`}>
                      Why is this charge being cancelled?
                    </Label>
                    <Textarea
                      id={`${fieldId}-${charge.installmentId}`}
                      name="cancelReason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={2}
                      className="mt-1"
                      placeholder="e.g. left the school in August, was never enrolled for this term"
                      required
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={pending || reason.trim().length < 4}
                      className="h-11 rounded-xl sm:h-9 sm:rounded-md"
                    >
                      {pending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Cancel this charge
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setOpenId(null)}
                      className="h-11 rounded-xl sm:h-9 sm:rounded-md"
                    >
                      Keep it
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setOpenId(charge.installmentId);
                    setReason("");
                  }}
                  className="mt-2.5 h-11 w-full justify-center rounded-xl text-[12.5px] font-extrabold sm:h-9 sm:w-auto sm:rounded-md sm:text-sm sm:font-medium"
                >
                  Cancel this charge
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
