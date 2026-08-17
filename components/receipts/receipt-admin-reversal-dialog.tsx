"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { reverseReceiptAdminAction } from "@/app/protected/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { SelectNative } from "@/components/ui/select-native";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatInr } from "@/lib/helpers/currency";

/**
 * The reason codes an office actually uses. Free text alone produced "correction"
 * on every row and told a later reader nothing; the code is what makes the
 * correction-review queue readable at a glance.
 */
export const REVERSAL_REASON_CODES = [
  "Wrong fee entry",
  "Wrong student",
  "Duplicate receipt",
  "Wrong amount",
  "Other",
] as const;

export type ReceiptAdminReversalDialogProps = {
  receiptId: string;
  studentId: string;
  sessionLabel: string;
  receiptNumber: string;
  studentName: string;
  totalAmount: number;
  paymentDate: string;
  /** Already covered by earlier reversals — a partial refund, or a manual ledger entry. */
  alreadyReversedAmount?: number;
  /** Counter discount + late-fee waiver recorded on this receipt. NOT undone by a reversal. */
  concessionAmount?: number;
  onClose: () => void;
};

/**
 * Reverse a receipt of any age — the wrong-fee-entry path, gated on
 * `payments:reverse_any`.
 *
 * Deliberately heavier than the 10-minute undo next door. That one is a
 * mis-click walked back while the parent is still at the counter; this one
 * un-collects money the books have already counted, possibly on a day that is
 * closed, and the parent's copy of the receipt is already in their file. So it
 * asks for a reason, and it asks the operator to type the receipt number — the
 * realistic failure here is reversing the row above the one you meant, and a
 * plain "are you sure" does not catch that.
 *
 * The RPC re-checks the permission and re-derives the amount. This is the
 * surface, not the guard.
 */
export function ReceiptAdminReversalDialog({
  receiptId,
  studentId,
  sessionLabel,
  receiptNumber,
  studentName,
  totalAmount,
  paymentDate,
  alreadyReversedAmount = 0,
  concessionAmount = 0,
  onClose,
}: ReceiptAdminReversalDialogProps) {
  const router = useRouter();
  const fieldId = useId();
  const [reasonCode, setReasonCode] = useState<string>(
    REVERSAL_REASON_CODES[0],
  );
  const [reasonNote, setReasonNote] = useState("");
  const [typedNumber, setTypedNumber] = useState("");
  const [pending, startTransition] = useTransition();

  const remainingAmount = Math.max(0, totalAmount - alreadyReversedAmount);
  const numberMatches =
    typedNumber.trim().toUpperCase() === receiptNumber.trim().toUpperCase();
  const canSubmit = numberMatches && reasonNote.trim().length > 0 && !pending;

  function close() {
    setReasonNote("");
    setTypedNumber("");
    setReasonCode(REVERSAL_REASON_CODES[0]);
    onClose();
  }

  function runReversal() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("receiptId", receiptId);
      formData.set("studentId", studentId);
      formData.set("sessionLabel", sessionLabel);
      formData.set("reasonCode", reasonCode);
      formData.set("reasonNote", reasonNote.trim());

      const result = await reverseReceiptAdminAction(formData);
      toast({
        title: result.ok ? "Receipt reversed" : "Reversal failed",
        description: result.message,
      });

      if (result.ok) {
        close();
        router.refresh();
      }
    });
  }

  return (
    <Sheet
      open
      onClose={close}
      side="bottom"
      size="lg"
      title={`Reverse receipt ${receiptNumber}`}
      description="The receipt stays on file, stamped VOID. The money goes back onto the family's dues."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit}
            onClick={runReversal}
          >
            {pending ? "Reversing…" : `Reverse ${formatInr(remainingAmount)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Student</dt>
          <dd className="font-medium">{studentName}</dd>
          <dt className="text-muted-foreground">Paid on</dt>
          <dd>{paymentDate}</dd>
          <dt className="text-muted-foreground">Receipt total</dt>
          <dd>{formatInr(totalAmount)}</dd>
          {alreadyReversedAmount > 0 ? (
            <>
              <dt className="text-muted-foreground">Already reversed</dt>
              <dd>{formatInr(alreadyReversedAmount)}</dd>
              <dt className="text-muted-foreground">This reversal</dt>
              <dd className="font-medium">{formatInr(remainingAmount)}</dd>
            </>
          ) : null}
        </dl>

        {concessionAmount > 0 ? (
          <Notice
            tone="warning"
            title="Counter concessions stay on this receipt"
          >
            This receipt also carried {formatInr(concessionAmount)} of quick
            discount or late-fee waiver. Reversing returns the cash to dues;
            those concession lines are not undone. To bill a waived late fee
            again, void the waiver separately from the student&apos;s fee page.
          </Notice>
        ) : null}

        <Notice tone="neutral" title="The parent can see this">
          A parent scanning the QR code on their printed copy will see this
          receipt marked as reversed straight away.
        </Notice>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-code`}>Why is this being reversed?</Label>
          <SelectNative
            id={`${fieldId}-code`}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value)}
          >
            {REVERSAL_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectNative>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-note`}>What happened?</Label>
          <Textarea
            id={`${fieldId}-note`}
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
            rows={2}
            placeholder="e.g. Entered against the sibling; re-posted on the correct child."
          />
          <p className="text-xs text-muted-foreground">
            This is kept with the reversal and shown in the correction-review
            queue.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-confirm`}>
            Type <span className="font-mono font-medium">{receiptNumber}</span>{" "}
            to confirm
          </Label>
          <Input
            id={`${fieldId}-confirm`}
            value={typedNumber}
            onChange={(event) => setTypedNumber(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={typedNumber.length > 0 && !numberMatches}
          />
        </div>
      </div>
    </Sheet>
  );
}
