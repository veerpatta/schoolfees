"use client";

import { useState } from "react";

import { CloseDueAsDiscountSheet } from "@/modules/students/ui/close-due-as-discount-sheet";
import { Button } from "@/ui/primitives/button";

/**
 * The recovery queue's "Write off" action.
 *
 * Deliberately NOT a new money surface: it opens the same
 * close-due-as-discount sheet the student Danger Zone uses, which posts a
 * `discount`-mode receipt through `post_student_payment_with_adjustments` —
 * append-only, reason required, capped at the live pending amount, excluded
 * from every collection figure. This wrapper only carries the row into that
 * sheet.
 *
 * It exists because of the year-end rule: a student cannot leave the roll
 * owing money, and the promotion guard refuses to graduate them. The two
 * legitimate exits are collecting the dues or writing them off here — the
 * guard's error message points at this queue by name.
 */
export function RecoveryWriteOffButton({
  studentId,
  studentLabel,
  studentAdmissionNo,
  classLabel,
  pendingAmount,
  sessionLabel,
  size = "sm",
  className,
}: {
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  classLabel: string;
  /** The row's remaining dues — the sheet re-reads the live figure on submit. */
  pendingAmount: number;
  /** The session whose ledger holds the dues (the row's source session). */
  sessionLabel: string;
  size?: "sm" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (pendingAmount <= 0 || !sessionLabel) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        Write off
      </Button>
      <CloseDueAsDiscountSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentLabel={studentLabel}
        studentAdmissionNo={studentAdmissionNo}
        classLabel={classLabel}
        pendingAmount={pendingAmount}
        sessionLabel={sessionLabel}
      />
    </>
  );
}
