"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
  waiveLateFeeAction,
} from "@/app/protected/payments/waive-late-fee-actions";
import { formatInr } from "@/lib/helpers/currency";

type WaiveLateFeeSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingLateFeeAmount: number;
  currentWaiverAmount: number;
};

export function WaiveLateFeeSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingLateFeeAmount,
  currentWaiverAmount,
}: WaiveLateFeeSheetProps) {
  const [amount, setAmount] = useState<string>(String(pendingLateFeeAmount));
  const [reason, setReason] = useState<string>("");
  const [state, formAction, pending] = useActionState(
    waiveLateFeeAction,
    INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
  );

  useEffect(() => {
    if (open) {
      setAmount(String(pendingLateFeeAmount));
      setReason("");
    }
  }, [open, pendingLateFeeAmount]);

  useEffect(() => {
    if (state.status === "success") {
      toast({
        title: "Late fee waived",
        description: state.message ?? "Late fee waiver applied.",
      });
      onClose();
    }
  }, [state.status, state.message, onClose]);

  const numericAmount = Number(amount);
  const validAmount =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= pendingLateFeeAmount;
  const validReason = reason.trim().length >= 4;
  const canSubmit = validAmount && validReason && !pending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Waive late fee — ${studentLabel}`}
      description={`Pending late fee: ${formatInr(pendingLateFeeAmount)}. Writes to the student's fee override; the receipt next issued will show the lower balance.`}
      size="md"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="studentId" value={studentId} />

        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{studentLabel}</span>{" "}
            · SR {studentAdmissionNo} · {classLabel}
          </p>
          {currentWaiverAmount > 0 ? (
            <p className="mt-1">
              Previous standalone waivers on this student:{" "}
              <span className="font-medium text-foreground">{formatInr(currentWaiverAmount)}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="waive-late-fee-amount">Amount to waive (₹)</Label>
          <Input
            id="waive-late-fee-amount"
            name="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={pendingLateFeeAmount}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Capped at the current pending late fee ({formatInr(pendingLateFeeAmount)}).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="waive-late-fee-reason">Reason (required)</Label>
          <Textarea
            id="waive-late-fee-reason"
            name="reason"
            placeholder="e.g. Family emergency, principal approval, etc."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            required
          />
          <p className="text-xs text-muted-foreground">
            Minimum 4 characters. Reason is appended to the student&apos;s fee-override audit trail.
          </p>
        </div>

        {state.status === "error" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        ) : null}
        {state.status === "success" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Waiving…
              </span>
            ) : (
              "Waive late fee"
            )}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
