"use client";

import { useState } from "react";
import { Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CloseDueAsDiscountSheet } from "@/components/students/close-due-as-discount-sheet";

type CloseDueTriggerProps = {
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  pendingAmount: number;
  currentDiscount: number;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
};

export function CloseDueTrigger({
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingAmount,
  currentDiscount,
  className,
  size = "sm",
  variant = "outline",
}: CloseDueTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Scissors className="size-4" aria-hidden="true" />
        Close balance as discount
      </Button>
      <CloseDueAsDiscountSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentLabel={studentLabel}
        studentAdmissionNo={studentAdmissionNo}
        classLabel={classLabel}
        pendingAmount={pendingAmount}
        currentDiscount={currentDiscount}
      />
    </>
  );
}
