"use client";

import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";

type ConfirmReceiptSheetProps = {
  open: boolean;
  form?: string;
  onBack: () => void;
  isSubmitting: boolean;
  isDisabled: boolean;
  confirmationSummary: {
    studentName: string;
    admissionNo: string;
    classLabel: string;
    amount: number;
    pendingBeforeDiscount: number;
    quickDiscountApplied: number;
    lateFeeWaivedApplied: number;
    revisedPendingBeforePayment: number;
    paymentDate: string;
    paymentModeLabel: string;
    referenceNumber: string;
    receivedBy: string;
    remainingBalance: number;
  };
  receiptPreviewAllocation: Array<{
    installmentId: string;
    installmentLabel: string;
    dueDate: string;
    pendingBefore: number;
    discountApplied: number;
    lateFeeWaived: number;
    amountReceived: number;
    remaining: number;
  }>;
  sessionLabel: string;
};

export function ConfirmReceiptSheet({
  open,
  form,
  onBack,
  isSubmitting,
  isDisabled,
  confirmationSummary,
  receiptPreviewAllocation,
}: ConfirmReceiptSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[92vh] w-full anim-slide-up overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-3xl md:rounded-xl md:p-5">

        {/* A. Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-lg font-semibold text-foreground">Confirm & Save Payment</p>
          <span className="rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
            DRAFT
          </span>
        </div>

        {/* B. Amount hero block */}
        <div className="mt-4 flex items-start justify-between rounded-xl border border-accent/30 bg-accent-soft p-4">
          <div>
            <p className="text-xs text-muted-foreground">Amount received</p>
            <p className="mt-1 text-2xl font-semibold text-accent">
              {formatInr(confirmationSummary.amount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {confirmationSummary.studentName} · {confirmationSummary.classLabel}
            </p>
          </div>
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground">
            {confirmationSummary.paymentModeLabel}
          </span>
        </div>

        {/* C. 5 summary rows */}
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2 text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium text-foreground">{confirmationSummary.paymentDate}</span>
          </div>
          {confirmationSummary.lateFeeWaivedApplied > 0 ? (
            <div className="flex items-baseline justify-between border-b border-border px-4 py-2 text-sm">
              <span className="text-muted-foreground">Waiver applied</span>
              <span className="font-medium text-info-soft-foreground">
                {formatInr(confirmationSummary.lateFeeWaivedApplied)}
              </span>
            </div>
          ) : null}
          {confirmationSummary.quickDiscountApplied > 0 ? (
            <div className="flex items-baseline justify-between border-b border-border px-4 py-2 text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-info-soft-foreground">
                {formatInr(confirmationSummary.quickDiscountApplied)}
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2 text-sm">
            <span className="text-muted-foreground">Received by</span>
            <span className="font-medium text-foreground">
              {confirmationSummary.receivedBy || "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between px-4 py-2 text-sm">
            <span className="text-muted-foreground">Balance after</span>
            <span
              className={`font-medium ${
                confirmationSummary.remainingBalance === 0
                  ? "text-success-soft-foreground"
                  : "text-warning-soft-foreground"
              }`}
            >
              {confirmationSummary.remainingBalance === 0
                ? "₹0 — Clears dues"
                : formatInr(confirmationSummary.remainingBalance)}
            </span>
          </div>
        </div>

        {/* D. Allocation table — collapsed by default */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Installment details ↓
          </summary>
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-normal break-words px-2 py-2">Installment</th>
                  <th className="px-2 py-2 text-right">Allocated</th>
                  <th className="px-2 py-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {receiptPreviewAllocation.map((item) => (
                  <tr key={item.installmentId} className="border-t border-border">
                    <td className="px-2 py-2">
                      <p className="font-medium text-foreground">{item.installmentLabel}</p>
                      <p className="text-[10px] text-muted-foreground">{item.dueDate}</p>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-foreground">
                      {formatInr(item.amountReceived)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {formatInr(item.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* E. Audit notice — keep exactly as-is */}
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Posted receipts stay in history. This action cannot be undone.
        </p>

        {/* F. Action buttons — keep form= attribute and all logic exactly as-is */}
        <div className="sticky bottom-0 mt-4 grid gap-2 border-t border-border bg-card pt-3 mobile-safe-bottom-padding sm:grid-cols-[1fr_1fr_1.4fr]">
          <Button variant="outline" type="button" onClick={onBack} disabled={isSubmitting}>
            Back / Edit
          </Button>
          <Button
            variant="secondary"
            type="submit"
            form={form}
            name="printMode"
            value="no"
            disabled={isSubmitting || isDisabled}
          >
            {isSubmitting ? "Saving..." : "Save Only"}
          </Button>
          <Button
            type="submit"
            form={form}
            name="printMode"
            value="yes"
            disabled={isSubmitting || isDisabled}
          >
            {isSubmitting ? "Saving..." : "Save & Print Receipt"}
          </Button>
        </div>
      </div>
    </div>
  );
}
