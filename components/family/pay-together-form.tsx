"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import type { FamilyMemberPending } from "@/lib/family-payments/data";

const selectClassName =
  "appearance-none flex w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Props = {
  familyGroupId: string;
  defaultDate: string;
  members: FamilyMemberPending[];
  totalPending: number;
  disabled: boolean;
  action: (formData: FormData) => Promise<void>;
};

function defaultAllocation(members: FamilyMemberPending[], totalAmount: number): Record<string, number> {
  const totalPending = members.reduce((sum, member) => sum + Math.max(0, member.outstandingAmount), 0);
  if (totalPending <= 0 || totalAmount <= 0) {
    const fallback: Record<string, number> = {};
    for (const member of members) fallback[member.studentId] = 0;
    return fallback;
  }

  const result: Record<string, number> = {};
  let assigned = 0;

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (index === members.length - 1) {
      result[member.studentId] = Math.max(0, totalAmount - assigned);
      continue;
    }
    const share = Math.floor((Math.max(0, member.outstandingAmount) / totalPending) * totalAmount);
    const capped = Math.min(share, Math.max(0, member.outstandingAmount));
    result[member.studentId] = capped;
    assigned += capped;
  }

  return result;
}

export function FamilyPayTogetherForm({
  familyGroupId,
  defaultDate,
  members,
  totalPending,
  disabled,
  action,
}: Props) {
  const [totalAmount, setTotalAmount] = useState<string>(String(totalPending));
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [allocations, setAllocations] = useState<Record<string, number>>(() =>
    defaultAllocation(members, Number.parseInt(String(totalPending), 10) || 0),
  );
  const [isPending, startTransition] = useTransition();

  const totalAsNumber = Number.parseInt(totalAmount, 10) || 0;
  const allocationSum = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum + value, 0),
    [allocations],
  );
  const allocationMatches = allocationSum === totalAsNumber && totalAsNumber > 0;

  function rebalance() {
    setAllocations(defaultAllocation(members, totalAsNumber));
  }

  function updateAllocation(studentId: string, value: number) {
    setAllocations((previous) => ({ ...previous, [studentId]: Math.max(0, value) }));
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="familyGroupId" value={familyGroupId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="totalAmount">Total amount received</Label>
          <Input
            id="totalAmount"
            name="totalAmount"
            type="number"
            inputMode="numeric"
            min={1}
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
            className="mt-2 h-10"
            required
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="paymentDate">Payment date</Label>
          <Input
            id="paymentDate"
            name="paymentDate"
            type="date"
            defaultValue={defaultDate}
            className="mt-2 h-10"
            required
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="paymentMode">Payment mode</Label>
          <select
            id="paymentMode"
            name="paymentMode"
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value)}
            className={`${selectClassName} mt-2 h-10`}
            disabled={disabled}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
        <div>
          <Label htmlFor="referenceNumber">Reference (UPI/cheque)</Label>
          <Input
            id="referenceNumber"
            name="referenceNumber"
            className="mt-2 h-10"
            disabled={disabled}
            required={paymentMode !== "cash"}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="receivedBy">Received by</Label>
          <Input id="receivedBy" name="receivedBy" className="mt-2 h-10" disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input id="notes" name="notes" className="mt-2 h-10" disabled={disabled} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-2 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Per-child split</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={rebalance}
            disabled={disabled || totalAsNumber <= 0}
          >
            Auto-split by pending
          </Button>
        </div>
        <ul className="mt-3 space-y-2">
          {members.map((member) => {
            const value = allocations[member.studentId] ?? 0;
            return (
              <li key={member.studentId} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_120px]">
                <input type="hidden" name="studentId" value={member.studentId} />
                <div>
                  <p className="text-sm font-medium text-foreground">{member.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.classLabel} · SR {member.admissionNo || "—"} · pending {formatInr(member.outstandingAmount)}
                  </p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">₹</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  name="studentAmount"
                  value={value}
                  onChange={(event) =>
                    updateAllocation(member.studentId, Number.parseInt(event.target.value, 10) || 0)
                  }
                  className="h-9"
                  disabled={disabled}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            Allocated <strong className="font-mono text-foreground">{formatInr(allocationSum)}</strong> of{" "}
            <strong className="font-mono text-foreground">{formatInr(totalAsNumber)}</strong>
          </p>
          <p
            className={
              allocationMatches
                ? "text-success-soft-foreground"
                : "text-warning-soft-foreground"
            }
          >
            {allocationMatches
              ? "Totals match — ready to post."
              : `Allocation must equal total. Difference ${formatInr(totalAsNumber - allocationSum)}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={disabled || isPending || !allocationMatches}>
          {isPending ? "Posting…" : "Post family payment"}
        </Button>
        <p className="text-xs text-muted-foreground">
          One receipt is generated per child. All receipts share a family_payment_id for audit.
        </p>
      </div>
    </form>
  );
}
