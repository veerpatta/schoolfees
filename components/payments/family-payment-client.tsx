"use client";

import { useActionState, useMemo, useState } from "react";

import { FamilyConfirmSheet } from "@/components/payments/family-confirm-sheet";
import { FamilySuccessSheet } from "@/components/payments/family-success-sheet";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import {
  validateFamilyAllocationSum,
} from "@/lib/payments/family-allocation";
import {
  INITIAL_FAMILY_PAYMENT_ACTION_STATE,
  type FamilyPaymentActionState,
  type FamilyPaymentEntryPageData,
} from "@/lib/payments/types";

type FamilyPaymentClientProps = {
  data: FamilyPaymentEntryPageData;
  action: (previous: FamilyPaymentActionState, formData: FormData) => Promise<FamilyPaymentActionState>;
};

function newClientRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000";
}

export function FamilyPaymentClient({ data, action }: FamilyPaymentClientProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FAMILY_PAYMENT_ACTION_STATE);
  const [allocations, setAllocations] = useState(() =>
    data.children.map((child) => ({
      studentId: child.studentId,
      amount: child.defaultAllocatedAmount,
    })),
  );
  const [totalAmount, setTotalAmount] = useState(data.totalOutstanding);
  const [clientRequestId] = useState(newClientRequestId);
  const validation = useMemo(
    () => validateFamilyAllocationSum(allocations.map((item) => ({ allocatedAmount: item.amount })), totalAmount),
    [allocations, totalAmount],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="familyGroupId" value={data.familyGroupId} />
      <input type="hidden" name="sessionLabel" value={data.sessionLabel} />
      <input type="hidden" name="clientRequestId" value={clientRequestId} />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Family Statement</h1>
            <p className="text-sm text-muted-foreground">
              {data.familyLabel} · {data.guardianPhone ?? "No phone"} · {data.sessionLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Family pending</p>
            <p className="text-2xl font-semibold text-foreground">{formatInr(data.totalOutstanding)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Payment date</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              type="date"
              name="paymentDate"
              defaultValue={data.paymentDate}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Mode</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" name="paymentMode">
              {data.modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Reference</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" name="referenceNumber" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Received by</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              name="receivedBy"
              required
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-medium text-foreground">Notes</span>
          <input className="w-full rounded-md border border-input bg-background px-3 py-2" name="notes" />
        </label>
        <label className="mt-3 block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-foreground">Total received</span>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            type="number"
            name="totalAmount"
            min={1}
            value={totalAmount}
            onChange={(event) => setTotalAmount(Number(event.target.value))}
          />
        </label>
      </section>

      <section className="space-y-3">
        {data.children.map((child, index) => (
          <div key={child.studentId} className="rounded-lg border border-border bg-card p-4">
            <input type="hidden" name="studentId" value={child.studentId} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{child.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {child.classLabel} · SR {child.admissionNo}
                </p>
                {child.conventionalDiscountAssignments.map((assignment) => (
                  <p key={assignment.assignmentId} className="mt-1 text-xs text-accent-soft-foreground">
                    {assignment.policyDisplayName}: {formatInr(assignment.beforeTuitionAmount)} →{" "}
                    {formatInr(assignment.resultingTuitionAmount)}
                  </p>
                ))}
              </div>
              <div className="grid gap-2 text-right">
                <span className="text-xs text-muted-foreground">Pending {formatInr(child.outstandingAmount)}</span>
                <input
                  className="w-32 rounded-md border border-input bg-background px-3 py-2 text-right"
                  type="number"
                  min={1}
                  name="amount"
                  value={allocations[index]?.amount ?? 0}
                  onChange={(event) => {
                    const amount = Number(event.target.value);
                    setAllocations((current) =>
                      current.map((item) => (item.studentId === child.studentId ? { ...item, amount } : item)),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <FamilyConfirmSheet childRows={data.children} />

      {!validation.valid ? (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Allocation total is off by {formatInr(Math.abs(validation.driftAmount))}.
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
          {state.message}
        </p>
      ) : null}
      <FamilySuccessSheet state={state} />
      <Button type="submit" disabled={pending || !validation.valid}>
        {pending ? "Posting family payment..." : "Post family payment"}
      </Button>
    </form>
  );
}
