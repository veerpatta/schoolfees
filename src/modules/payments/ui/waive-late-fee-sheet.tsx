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
import { waiveLateFeeAction } from "@/app/protected/payments/waive-late-fee-actions";
import { INITIAL_WAIVE_LATE_FEE_ACTION_STATE } from "@/app/protected/payments/waive-late-fee-action-state";
import { formatInr } from "@/platform/helpers/currency";

/** Lets the pinned footer button submit the form it sits outside of. */
const WAIVE_FORM_ID = "waive-late-fee-form";

/** One installment the staff member may target, with what is left to waive on it. */
export type WaivableInstallment = {
  installmentId: string;
  label: string;
  /**
   * Late fee still OWED on this installment. This is `late_fee_pending`, NOT
   * `least(final_late_fee, pending_amount)` — since the columns split in
   * 20260812120000 the latter reads 0 for exactly the families who still have a
   * waivable late fee, which is why this sheet used to be unreachable for them.
   */
  remainingLateFee: number;
  /**
   * Late fee on this installment the family has ALREADY PAID. Only an admin may
   * forgive it, and doing so returns the money to them: the installment's charge
   * falls, what they paid does not, and the difference settles the next
   * installments before anything left over becomes credit.
   */
  collectedLateFee: number;
};

const ALL_PENDING = "";

/**
 * Where the target picker starts.
 *
 * With exactly one waivable installment, pin to it rather than leaving the
 * server to allocate oldest-first — the phone mounts this sheet inside the
 * installment row it belongs to, and "oldest first" there would forgive a
 * different row than the one the staffer tapped.
 */
function initialTarget(installments: WaivableInstallment[]) {
  return installments.length === 1 ? installments[0].installmentId : ALL_PENDING;
}

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
   * Installments that still carry a late fee. When two or more are supplied, or
   * when any of them carries a collected late fee, the sheet offers a target
   * picker; a waiver then belongs to that installment permanently. Omitted or
   * single, the RPC allocates oldest-first.
   */
  waivableInstallments?: WaivableInstallment[];
  /**
   * `fees:write` — admin. Forgiving a late fee the family has already paid is a
   * strictly larger act than forgiving one they still owe, so it is offered only
   * here and refused again server-side.
   */
  canWaiveCollected?: boolean;
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
  canWaiveCollected = false,
}: WaiveLateFeeSheetProps) {
  const t = useTranslations("Payments");
  const [amount, setAmount] = useState<string>(String(pendingLateFeeAmount));
  const [reason, setReason] = useState<string>("");
  const [installmentId, setInstallmentId] = useState<string>(() =>
    initialTarget(waivableInstallments),
  );
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
      const target = initialTarget(waivableInstallments);
      const pinned = waivableInstallments.find((item) => item.installmentId === target);
      setAmount(
        String(
          pinned
            ? pinned.remainingLateFee + (canWaiveCollected ? pinned.collectedLateFee : 0)
            : pendingLateFeeAmount,
        ),
      );
      setReason("");
      setInstallmentId(target);
      setClientRequestId(crypto.randomUUID());
      setSubmitted(false);
    }
    // waivableInstallments is a fresh array on every server render, so it is
    // deliberately NOT a dependency: including it re-runs this on every parent
    // re-render and wipes what the staffer has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingLateFeeAmount, canWaiveCollected]);

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
  const collectedOnTarget = canWaiveCollected
    ? (selectedInstallment?.collectedLateFee ?? 0)
    : 0;
  // Only ever true for a SPECIFIC installment an admin picked that has collected
  // money on it. "All pending, oldest first" deliberately stays on the narrow
  // pool: with the wide one, typing 1,000 to clear installment 2's unpaid late
  // fee would silently forgive installment 1's paid one instead, because the RPC
  // allocates by due date.
  const includeCollected = collectedOnTarget > 0;
  // Targeting one installment caps the waiver at what that installment still
  // carries; otherwise the ceiling is the student's whole pending late fee.
  const maxWaivable = selectedInstallment
    ? selectedInstallment.remainingLateFee + collectedOnTarget
    : pendingLateFeeAmount;
  const hasCollected =
    canWaiveCollected && waivableInstallments.some((item) => item.collectedLateFee > 0);
  // Never call money "pending" when the family has already handed it over. The
  // server is careful about this in its refusal messages; the sheet has to be
  // too, or an admin correcting a wrongly-charged fee is told it is outstanding
  // while the parent is holding the receipt for it.
  const owedTotal = waivableInstallments.reduce((sum, i) => sum + i.remainingLateFee, 0);
  const collectedTotal = canWaiveCollected
    ? waivableInstallments.reduce((sum, i) => sum + i.collectedLateFee, 0)
    : 0;
  const scopeIsAllCollected = owedTotal === 0 && collectedTotal > 0;
  // A single installment normally needs no picker, but one carrying collected
  // money does: that is the only way to reach the wider pool.
  const showInstallmentPicker = waivableInstallments.length > 1 || hasCollected;

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
      description={
        scopeIsAllCollected
          ? t("waiveSheetDescriptionCollected", { amount: formatInr(collectedTotal) })
          : t("waiveSheetDescription", { amount: formatInr(pendingLateFeeAmount) })
      }
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
        <input type="hidden" name="includeCollected" value={String(includeCollected)} />

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
            {/* h-11 and 16px text on a phone: clears the 44px touch target the
                rest of the mobile sheets keep to, and stops iOS zooming the
                viewport on focus. Back to h-10/14px from sm up, matching the
                inputs beside it. */}
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
                setAmount(
                  String(
                    target
                      ? target.remainingLateFee +
                          (canWaiveCollected ? target.collectedLateFee : 0)
                      : pendingLateFeeAmount,
                  ),
                );
              }}
              className="flex h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
            >
              {/* Only when there is genuinely a choice. With one waivable
                  installment the sheet is already pinned to it, and offering
                  "all pending, oldest first" beside it would just be a second
                  name for the same row — or, on a fully-collected one, a
                  zero-rupee option that can only be refused. */}
              {waivableInstallments.length > 1 ? (
                <option value={ALL_PENDING}>
                  {t("waiveInstallmentAll", { amount: formatInr(pendingLateFeeAmount) })}
                </option>
              ) : null}
              {waivableInstallments.map((item) => {
                const collected = canWaiveCollected ? item.collectedLateFee : 0;
                return (
                  <option key={item.installmentId} value={item.installmentId}>
                    {item.label} —{" "}
                    {collected > 0 && item.remainingLateFee > 0
                      ? t("waiveInstallmentMixed", {
                          owed: formatInr(item.remainingLateFee),
                          collected: formatInr(collected),
                        })
                      : collected > 0
                        ? t("waiveInstallmentCollected", { amount: formatInr(collected) })
                        : t("waiveInstallmentOwed", {
                            amount: formatInr(item.remainingLateFee),
                          })}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-muted-foreground">{t("waiveInstallmentHint")}</p>
          </div>
        ) : null}

        {includeCollected ? (
          // Say what actually happens to the money, in the place where the
          // decision is made. This is the one waiver that gives rupees back.
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{t("waiveCollectedNotice", { amount: formatInr(collectedOnTarget) })}</p>
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
            {includeCollected || scopeIsAllCollected
              ? t("waiveAmountHintCharged", { amount: formatInr(maxWaivable) })
              : t("waiveAmountHint", { amount: formatInr(maxWaivable) })}
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
