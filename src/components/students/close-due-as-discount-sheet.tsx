"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Sheet } from "@/ui/primitives/sheet";
import { Textarea } from "@/ui/primitives/textarea";
import { toast } from "@/ui/primitives/toast";
import {
  type CloseDueActionState,
  closeDueAsDiscountAction,
} from "@/app/protected/students/close-due-actions";
import { formatInr } from "@/platform/helpers/currency";

const INITIAL_STATE: CloseDueActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
};

/** Lets the pinned footer button submit the form it sits outside of. */
const CLOSE_DUE_FORM_ID = "close-due-as-discount-form";

type CloseDueAsDiscountSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  /** Ceiling for the write-off: this year's pending, or the old balance. */
  pendingAmount: number;
  sessionLabel: string;
  /**
   * `oldBalance` targets the previous-year carry-forward row. Those rows are
   * dated before installment 1, and the posting RPC allocates by due date
   * ascending, so a write-off of exactly the old balance lands on them first.
   */
  variant?: "current" | "oldBalance";
};

export function CloseDueAsDiscountSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingAmount,
  sessionLabel,
  variant = "current",
}: CloseDueAsDiscountSheetProps) {
  const isOldBalance = variant === "oldBalance";
  const tToasts = useTranslations("Toasts");
  const [amount, setAmount] = useState<string>(String(pendingAmount));
  const [reason, setReason] = useState<string>("");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    closeDueAsDiscountAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (open) {
      setAmount(String(pendingAmount));
      setReason("");
    }
  }, [open, pendingAmount]);

  useEffect(() => {
    if (state.status === "success") {
      // Re-render the server data so the saved change is visible at once.
      router.refresh();
      toast({
        title: tToasts("balanceClosedTitle"),
        description: state.message ?? tToasts("balanceClosedFallback"),
      });
      onClose();
    }
  }, [state.status, state.message, onClose, tToasts, router]);

  const numericAmount = Number(amount) || 0;
  const isAmountValid = numericAmount > 0 && numericAmount <= pendingAmount;
  const newPending = pendingAmount - (isAmountValid ? numericAmount : 0);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
      }}
      title={isOldBalance ? "Close old balance as discount" : "Close balance as discount"}
      description={
        isOldBalance
          ? "Writes off what this student still owes from a previous year. Posts a discount receipt — no cash changes hands, and it is excluded from collection totals."
          : "Writes off what this student still owes. Posts a discount receipt — no cash changes hands, and it is excluded from collection totals."
      }
      size="full"
      /* Pinned outside the scroll body so the amount/reason keyboard cannot
         bury the confirm action. */
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={CLOSE_DUE_FORM_ID}
            disabled={pending || !isAmountValid || reason.trim().length < 4}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Closing…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Close balance
              </span>
            )}
          </Button>
        </div>
      }
    >
      <form id={CLOSE_DUE_FORM_ID} action={formAction} className="space-y-4 pb-2">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />

        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Student</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{studentLabel}</p>
          <p className="text-xs text-muted-foreground">
            SR {studentAdmissionNo} · {classLabel}
          </p>
        </div>

        <div>
          <Label htmlFor="close-due-amount">Amount to close as discount</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-muted-foreground">₹</span>
            <Input
              id="close-due-amount"
              name="amount"
              type="number"
              min={1}
              max={pendingAmount}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOldBalance ? "Old balance outstanding: " : "Current pending: "}
            <span className="font-semibold text-foreground">{formatInr(pendingAmount)}</span>
            . Leave the amount as-is to clear it in full, or enter less to write off part of it.
          </p>
        </div>

        <div>
          <Label htmlFor="close-due-reason">Reason (audit)</Label>
          <Textarea
            id="close-due-reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. ₹2 paise rounding leftover · paid in cash but not receipted"
            rows={3}
            className="mt-1"
            required
          />
        </div>

        <div className="rounded-lg border border-border bg-card px-3 py-3 text-sm">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Preview</p>
          {/*
            This used to preview "Current discount + Close-out = New discount",
            which described something the action never does: it posts a
            payment_mode='discount' receipt, it does not touch
            student_fee_overrides.discount_amount. The figure it showed was the
            raw override column, so it was also simply wrong for any student on
            an RTE / Staff Child / 3rd Child policy. What actually changes is
            what the family owes.
          */}
          <ul className="space-y-1">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Written off</span>
              <span className="font-mono tabular-nums text-success-soft-foreground">
                {formatInr(isAmountValid ? numericAmount : 0)}
              </span>
            </li>
            <li className="flex justify-between font-semibold"><span>Pending</span>
              <span className="font-mono tabular-nums">
                {formatInr(pendingAmount)}
                <span className="mx-1 text-muted-foreground">→</span>
                <span
                  className={
                    newPending === 0
                      ? "text-success-soft-foreground"
                      : "text-foreground"
                  }
                >
                  {newPending === 0 ? "₹0 ✓" : formatInr(newPending)} {/* @allow-raw-money-format */}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
          <p className="font-semibold">This writes money off the books.</p>
          <p className="mt-0.5">
            A receipt is posted with payment mode &ldquo;discount&rdquo; and the reason above,
            so the write-off is auditable. No cash is recorded and it does not count towards
            collection totals. Existing receipts are never changed.
          </p>
        </div>

        {state.status === "error" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
