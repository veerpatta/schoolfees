"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { waiveLateFeeAction } from "@/app/protected/payments/waive-late-fee-actions";
import { INITIAL_WAIVE_LATE_FEE_ACTION_STATE } from "@/app/protected/payments/waive-late-fee-action-state";
import { formatInr } from "@/lib/helpers/currency";

/** Lets the pinned footer button submit the form it sits outside of. */
const WAIVE_FORM_ID = "waive-late-fee-form";

/** One installment the staff member may target, with what is left to waive on it. */
export type WaivableInstallment = {
  installmentId: string;
  label: string;
  remainingLateFee: number;
};

const ALL_PENDING = "";

type WaiveLateFeeSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingLateFeeAmount: number;
  currentWaiverAmount: number;
  sessionLabel: string;
  /**
   * Installments that still carry a late fee. When two or more are supplied the
   * sheet offers a target picker; a waiver then belongs to that installment
   * permanently. Omitted or single, the RPC allocates oldest-first.
   */
  waivableInstallments?: WaivableInstallment[];
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
  sessionLabel,
  waivableInstallments = [],
}: WaiveLateFeeSheetProps) {
  const t = useTranslations("Payments");
  const [amount, setAmount] = useState<string>(String(pendingLateFeeAmount));
  const [reason, setReason] = useState<string>("");
  const [installmentId, setInstallmentId] = useState<string>(ALL_PENDING);
  // Regenerated per sheet-open, not per submit, so retrying the same attempt
  // reuses the id. The server is now idempotent on it (a replay returns the
  // original result instead of stacking a second waiver), so this is what makes
  // a double-tap safe rather than merely unlikely.
  const [clientRequestId, setClientRequestId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  // State, not a ref: the footer button sits outside the form and must actually
  // re-render as disabled in the window between the action resolving and the
  // success effect calling onClose().
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    waiveLateFeeAction,
    INITIAL_WAIVE_LATE_FEE_ACTION_STATE,
  );

  useEffect(() => {
    if (open) {
      setAmount(String(pendingLateFeeAmount));
      setReason("");
      setInstallmentId(ALL_PENDING);
      setClientRequestId(crypto.randomUUID());
      setSubmitted(false);
    }
  }, [open, pendingLateFeeAmount]);

  // An error means the waiver did not land, so allow a corrected retry. Success
  // closes the sheet, and reopening resets the guard.
  useEffect(() => {
    if (state.status === "error") {
      setSubmitted(false);
    }
  }, [state.status, state.message]);

  useEffect(() => {
    if (state.status === "success") {
      // Re-render the server data so the saved change is visible at once.
      router.refresh();
      toast({
        title: t("waiveTriggerLabel"),
        description: state.message ?? "",
      });
      onClose();
    }
  }, [state.status, state.message, onClose, t, router]);

  const selectedInstallment = waivableInstallments.find(
    (item) => item.installmentId === installmentId,
  );
  // Targeting one installment caps the waiver at what that installment still
  // carries; otherwise the ceiling is the student's whole pending late fee.
  const maxWaivable = selectedInstallment?.remainingLateFee ?? pendingLateFeeAmount;
  const showInstallmentPicker = waivableInstallments.length > 1;

  const numericAmount = Number(amount);
  const validAmount =
    Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= maxWaivable;
  const validReason = reason.trim().length >= 4;
  const canSubmit = validAmount && validReason && !pending && !submitted;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${t("waiveSheetTitlePrefix")} ${studentLabel}`}
      description={t("waiveSheetDescription", { amount: formatInr(pendingLateFeeAmount) })}
      size="md"
      /* Pinned outside the scroll body so the amount/reason keyboard can
         never bury the Waive button. */
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {t("waiveCancel")}
          </Button>
          <Button type="submit" form={WAIVE_FORM_ID} disabled={!canSubmit}>
            {pending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("waiveSubmitting")}
              </span>
            ) : (
              t("waiveSubmit")
            )}
          </Button>
        </div>
      }
    >
      <form
        id={WAIVE_FORM_ID}
        action={formAction}
        onSubmit={() => setSubmitted(true)}
        className="space-y-4"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <input type="hidden" name="installmentId" value={installmentId} />

        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{studentLabel}</span>
            {t("waiveSheetStudentLineSeparator")}
            {studentAdmissionNo} · {classLabel}
          </p>
          {currentWaiverAmount > 0 ? (
            <p className="mt-1">
              {t("waivePreviousTotal")}{" "}
              <span className="font-medium text-foreground">{formatInr(currentWaiverAmount)}</span>
            </p>
          ) : null}
        </div>

        {showInstallmentPicker ? (
          <div className="space-y-2">
            <Label htmlFor="waive-late-fee-installment">{t("waiveInstallmentLabel")}</Label>
            <select
              id="waive-late-fee-installment"
              value={installmentId}
              onChange={(event) => {
                const next = event.target.value;
                setInstallmentId(next);
                const target = waivableInstallments.find(
                  (item) => item.installmentId === next,
                );
                setAmount(String(target?.remainingLateFee ?? pendingLateFeeAmount));
              }}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value={ALL_PENDING}>
                {t("waiveInstallmentAll", { amount: formatInr(pendingLateFeeAmount) })}
              </option>
              {waivableInstallments.map((item) => (
                <option key={item.installmentId} value={item.installmentId}>
                  {item.label} — {formatInr(item.remainingLateFee)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("waiveInstallmentHint")}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="waive-late-fee-amount">{t("waiveAmountLabel")}</Label>
          <Input
            id="waive-late-fee-amount"
            name="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxWaivable}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("waiveAmountHint", { amount: formatInr(maxWaivable) })}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="waive-late-fee-reason">{t("waiveReasonLabel")}</Label>
          <Textarea
            id="waive-late-fee-reason"
            name="reason"
            placeholder={t("waiveReasonPlaceholder")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            required
          />
          <p className="text-xs text-muted-foreground">{t("waiveReasonHint")}</p>
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
      </form>
    </Sheet>
  );
}
