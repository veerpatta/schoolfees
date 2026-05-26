"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WaiveLateFeeSheet } from "@/components/payments/waive-late-fee-sheet";

type WaiveLateFeeTriggerProps = {
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingLateFeeAmount: number;
  currentWaiverAmount: number;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
};

/**
 * Standalone "Waive late fee" trigger. Only mount when the active staff has
 * `payments:waive_late_fee` AND the student has a non-zero pending late fee.
 * Caller is responsible for both gates so the button never appears when the
 * waiver wouldn't be actionable.
 */
export function WaiveLateFeeTrigger({
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingLateFeeAmount,
  currentWaiverAmount,
  className,
  size = "sm",
  variant = "outline",
}: WaiveLateFeeTriggerProps) {
  const t = useTranslations("Payments");
  const [open, setOpen] = useState(false);

  if (pendingLateFeeAmount <= 0) {
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
      />
    </>
  );
}
