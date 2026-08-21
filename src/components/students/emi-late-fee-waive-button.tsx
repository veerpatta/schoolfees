"use client";

import { useActionState } from "react";

import { Button } from "@/ui/primitives/button";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import type { RepaymentEmiLateFee } from "@/lib/repayment-plans/types";

import { waiveEmiLateFeeAction } from "@/app/protected/students/repayment-plan-actions";
import { INITIAL_REPAYMENT_PLAN_ACTION_STATE } from "@/app/protected/students/repayment-plan-action-state";

/**
 * One-click forgiveness for a single missed-EMI late fee.
 *
 * Sits beside the row it forgives rather than sending an admin to hunt for the
 * installment in the dues table — waiving these is the routine follow-up when a
 * family catches up, not an exceptional correction.
 */
export function EmiLateFeeWaiveButton({
  planId,
  studentId,
  sessionLabel,
  sequenceNo,
  lateFee,
  clientRequestId,
}: {
  planId: string;
  studentId: string;
  sessionLabel: string;
  sequenceNo: number;
  lateFee: RepaymentEmiLateFee;
  /** Minted on the server so a double-click cannot waive twice. */
  clientRequestId: string;
}) {
  const [state, formAction, pending] = useActionState(
    waiveEmiLateFeeAction,
    INITIAL_REPAYMENT_PLAN_ACTION_STATE,
  );

  useActionFeedback(state, {
    successTitle: "Late fee waived",
    errorTitle: "Could not waive the late fee",
  });

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="sessionLabel" value={sessionLabel} />
      <input type="hidden" name="installmentId" value={lateFee.installmentId} />
      <input type="hidden" name="sequenceNo" value={sequenceNo} />
      <input type="hidden" name="amount" value={lateFee.outstandingAmount} />
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      <input
        type="hidden"
        name="reason"
        value={`EMI ${sequenceNo} late fee waived — family has settled this month.`}
      />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Waiving…" : "Waive"}
      </Button>
    </form>
  );
}
