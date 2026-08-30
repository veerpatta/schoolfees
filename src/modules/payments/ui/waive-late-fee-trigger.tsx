"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ReceiptText } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import {
  WaiveLateFeeSheet,
  type WaivableInstallment,
} from "@/modules/payments/ui/waive-late-fee-sheet";

type WaiveLateFeeTriggerProps = {
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingLateFeeAmount: number;
  currentWaiverAmount: number;
  sessionLabel: string;
  /** Installments still carrying a late fee, so the waiver can be targeted. */
  waivableInstallments?: WaivableInstallment[];
  /** `fees:write` — lets an admin also forgive an already-collected late fee. */
  canWaiveCollected?: boolean;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
};

/**
 * Standalone "Waive late fee" trigger. Only mount when the active staff has
 * `payments:waive_late_fee`; this decides for itself whether there is anything
 * to waive.
 *
 * That decision used to be `pendingLateFeeAmount <= 0`, which hid the button for
 * exactly the student it exists for: an admin correcting a late fee the family
 * has ALREADY PAID sees a pending late fee of zero. It now counts what the
 * caller says is waivable, collected money included.
 */
export function WaiveLateFeeTrigger({
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingLateFeeAmount,
  currentWaiverAmount,
  sessionLabel,
  waivableInstallments,
  canWaiveCollected = false,
  className,
  size = "sm",
  variant = "outline",
}: WaiveLateFeeTriggerProps) {
  const t = useTranslations("Payments");
  const [open, setOpen] = useState(false);

  const waivableTotal = waivableInstallments?.length
    ? waivableInstallments.reduce(
        (sum, item) =>
          sum + item.remainingLateFee + (canWaiveCollected ? item.collectedLateFee : 0),
        0,
      )
    : pendingLateFeeAmount;

  if (waivableTotal <= 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <ReceiptText className="size-4" aria-hidden="true" />
        {t("waiveTriggerLabel")}
      </Button>
      <WaiveLateFeeSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentLabel={studentLabel}
        studentAdmissionNo={studentAdmissionNo}
        classLabel={classLabel}
        pendingLateFeeAmount={pendingLateFeeAmount}
        currentWaiverAmount={currentWaiverAmount}
        sessionLabel={sessionLabel}
        waivableInstallments={waivableInstallments}
        canWaiveCollected={canWaiveCollected}
      />
    </>
  );
}
