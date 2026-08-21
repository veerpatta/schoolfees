"use client";

/**
 * Drop-in "Collect" button for any student-row context (students list,
 * defaulters list, profile header). Wraps CollectTrigger with the right
 * intent shape so callers only pass the student snapshot they already have.
 *
 * Usage:
 *   <StudentRowCollectButton
 *     studentId={row.id}
 *     studentLabel={row.fullName}
 *     classLabel={row.classLabel}
 *   />
 *
 * The button is a plain <Link> into the Payment Desk with `?studentId=` so the
 * desk preselects the student — see collect-trigger.tsx for why the old
 * intercepting-route drawer was removed. No new posting paths: one student,
 * one receipt, through the desk.
 */

import { CollectTrigger } from "@/modules/payments/ui/collect/collect-trigger";

type StudentRowCollectButtonProps = {
  studentId: string;
  studentLabel: string;
  classLabel?: string;
  /** Where to return after the user posts. Defaults to current page. */
  returnTo?: string;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
  label?: string;
  className?: string;
};

export function StudentRowCollectButton({
  studentId,
  studentLabel,
  classLabel,
  returnTo,
  variant = "ghost",
  size = "sm",
  label = "Collect",
  className,
}: StudentRowCollectButtonProps) {
  return (
    <CollectTrigger
      intent={{ studentId, studentLabel, classLabel, returnTo }}
      variant={variant}
      size={size}
      label={label}
      className={className}
    />
  );
}
