"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  type CloseDueActionState,
  closeDueAsDiscountAction,
} from "@/app/protected/students/close-due-actions";
import { formatInr } from "@/lib/helpers/currency";

const INITIAL_STATE: CloseDueActionState = {
  status: "idle",
  message: null,
  receiptNumber: null,
};

type CloseDueAsDiscountSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingAmount: number;
  currentDiscount: number;
  sessionLabel: string;
};

export function CloseDueAsDiscountSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingAmount,
  currentDiscount,
  sessionLabel,
}: CloseDueAsDiscountSheetProps) {
  const tToasts = useTranslations("Toasts");
  const [amount, setAmount] = useState<string>(String(pendingAmount));
  const [reason, setReason] = useState<string>("");
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
      toast({
        title: tToasts("balanceClosedTitle"),
        description: state.message ?? tToasts("balanceClosedFallback"),
      });
      onClose();
    }
  }, [state.status, state.message, onClose, tToasts]);

  const numericAmount = Number(amount) || 0;
  const isAmountValid = numericAmount > 0 && numericAmount <= pendingAmount;
  const newDiscount = currentDiscount + (isAmountValid ? numericAmount : 0);
  const newPending = pendingAmount - (isAmountValid ? numericAmount : 0);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
      }}
      title="Close balance as discount"
      description="Adds the amount to this student's discount override. The workbook re-runs and the pending balance updates."
      size="full"
    >
      <form action={formAction} className="space-y-4 pb-2">
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
            Current pending: <span className="font-semibold text-foreground">{formatInr(pendingAmount)}</span>
            . Tip: leave the amount as-is to fully clear the balance, or enter a smaller value to write off a portion.
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
          <ul className="space-y-1">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Current discount</span>
              <span className="font-mono tabular-nums">{formatInr(currentDiscount)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">+ Close-out</span>
              <span className="font-mono tabular-nums text-success-soft-foreground">
                + {formatInr(isAmountValid ? numericAmount : 0)}
              </span>
            </li>
            <li className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>New discount</span>
              <span className="font-mono tabular-nums">{formatInr(newDiscount)}</span>
            </li>
            <li className="mt-2 flex justify-between font-semibold">
              <span>Pending</span>
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
                  {newPending === 0 ? "₹0 ✓" : formatInr(newPending)}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
          <p className="font-semibold">This affects future installment regenerations.</p>
          <p className="mt-0.5">
            Existing receipts are not changed. The discount is recorded on the student fee
            override with the reason above so the audit trail is preserved.
          </p>
        </div>

        {state.status === "error" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !isAmountValid || reason.trim().length < 4}>
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
      </form>
    </Sheet>
  );
}
