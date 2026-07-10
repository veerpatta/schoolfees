"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";

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
    displayLabel?: string;
    dueDate: string;
    pendingBefore: number;
    discountApplied: number;
    lateFeeWaived: number;
    amountReceived: number;
    remaining: number;
  }>;
  sessionLabel: string;
};

function paymentModeChip(label: string): string {
  const l = label.toLowerCase();
  if (l === "cash") return "border-success-soft bg-success-soft text-success-soft-foreground";
  if (l === "upi") return "border-info-soft bg-info-soft text-info-soft-foreground";
  if (l.includes("bank")) return "border-accent/30 bg-accent/10 text-accent";
  if (l === "cheque") return "border-warning-soft bg-warning-soft text-warning-soft-foreground";
  return "border-border bg-surface-2 text-foreground";
}

function Spinner() {
  return (
    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function ConfirmReceiptSheet({
  open,
  form,
  onBack,
  isSubmitting,
  isDisabled,
  confirmationSummary,
  receiptPreviewAllocation,
}: ConfirmReceiptSheetProps) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  // Surface a reassurance line when the save takes unusually long (slow school
  // Wi-Fi). The clientRequestId idempotency guard makes a retry safe, but the
  // cashier should wait rather than re-enter the payment.
  const [isSlowSave, setIsSlowSave] = useState(false);

  useEffect(() => {
    if (!isSubmitting) {
      setIsSlowSave(false);
      return;
    }

    const timer = window.setTimeout(() => setIsSlowSave(true), 8000);
    return () => window.clearTimeout(timer);
  }, [isSubmitting]);

  useEffect(() => {
    if (!open || isSubmitting) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, isSubmitting, onBack]);

  if (!open) {
    return null;
  }

  const clearsDues = confirmationSummary.remainingBalance === 0;
  const hasCredit = confirmationSummary.remainingBalance < 0;
  const isMobileSwipe = () => typeof window !== "undefined" && window.innerWidth < 768;
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobileSwipe() || isSubmitting) return;
    startY.current = event.touches[0]?.clientY ?? 0;
  };
  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobileSwipe() || isSubmitting) return;
    setDragY(Math.max(0, (event.touches[0]?.clientY ?? 0) - startY.current));
  };
  const handleTouchEnd = () => {
    if (isMobileSwipe() && !isSubmitting && dragY > 120) {
      onBack();
    }
    setDragY(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm and save payment"
    >
      <div
        className="max-h-[92vh] w-full anim-slide-up overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-3xl md:rounded-xl md:p-5"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? "transform 0.3s ease" : "none",
        }}
      >

        {/* A. Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-lg font-semibold text-foreground">Confirm & Save Payment</p>
          {isSubmitting ? (
            <span className="flex items-center gap-1.5 rounded border border-info-soft-foreground/30 bg-info-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-info-soft-foreground">
              <Spinner />
              Saving…
            </span>
          ) : (
            <span className="rounded border border-warning-soft-foreground/30 bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-soft-foreground">
              DRAFT — NOT POSTED
            </span>
          )}
        </div>

        {/* While the payment posts, replace ambiguity with an explicit status
            banner — the cashier must never wonder whether the save started. */}
        {isSubmitting ? (
          <div
            className="mt-3 flex items-center gap-2 rounded-xl border border-info-soft bg-info-soft px-4 py-3 text-sm font-medium text-info-soft-foreground"
            role="status"
            aria-live="polite"
          >
            <Spinner />
            <span>
              Saving payment — keep this screen open. The receipt will appear in a moment.
              {isSlowSave ? (
                <span className="mt-1 block font-normal">
                  Slow connection — still saving. Do not re-enter the payment; duplicates are
                  blocked automatically.
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {/* B. Amount hero block */}
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Amount received
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-accent">
                {formatInr(confirmationSummary.amount)}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {confirmationSummary.studentName}
              </p>
              <p className="text-xs text-muted-foreground">
                {confirmationSummary.admissionNo} · {confirmationSummary.classLabel}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${paymentModeChip(confirmationSummary.paymentModeLabel)}`}
            >
              {confirmationSummary.paymentModeLabel}
            </span>
          </div>
        </div>

        {/* C. Balance-after outcome banner */}
        <div
          className={`mt-3 flex items-center justify-between rounded-xl border px-4 py-3 ${
            clearsDues
              ? "border-success-soft bg-success-soft"
              : hasCredit
                ? "border-info-soft bg-info-soft"
                : "border-warning-soft bg-warning-soft"
          }`}
        >
          <div>
            <p
              className={`text-xs font-medium ${
                clearsDues
                  ? "text-success-soft-foreground/70"
                  : hasCredit
                    ? "text-info-soft-foreground/70"
                    : "text-warning-soft-foreground/70"
              }`}
            >
              Balance after
            </p>
            <p
              className={`text-sm font-semibold ${
                clearsDues
                  ? "text-success-soft-foreground"
                  : hasCredit
                    ? "text-info-soft-foreground"
                    : "text-warning-soft-foreground"
              }`}
            >
              {clearsDues ? "All dues cleared" : hasCredit ? "Credit balance" : "Partial payment"}
            </p>
          </div>
          <p
            className={`text-xl font-bold tabular-nums ${
              clearsDues
                ? "text-success-soft-foreground"
                : hasCredit
                  ? "text-info-soft-foreground"
                  : "text-warning-soft-foreground"
            }`}
          >
            {clearsDues ? "₹0 ✓" : formatInr(Math.abs(confirmationSummary.remainingBalance))} {/* @allow-raw-money-format */}
          </p>
        </div>

        {/* D. Summary rows */}
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium text-foreground">{confirmationSummary.paymentDate}</span>
          </div>
          {confirmationSummary.lateFeeWaivedApplied > 0 ? (
            <div className="flex items-center justify-between border-b border-border bg-success-soft px-4 py-2.5 text-sm">
              <span className="font-medium text-success-soft-foreground">Late fee waived</span>
              <span className="font-semibold text-success-soft-foreground">
                −{formatInr(confirmationSummary.lateFeeWaivedApplied)} saved
              </span>
            </div>
          ) : null}
          {confirmationSummary.quickDiscountApplied > 0 ? (
            <div className="flex items-center justify-between border-b border-border bg-success-soft px-4 py-2.5 text-sm">
              <span className="font-medium text-success-soft-foreground">Discount applied</span>
              <span className="font-semibold text-success-soft-foreground">
                −{formatInr(confirmationSummary.quickDiscountApplied)} off
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Received by</span>
            <span className="font-medium text-foreground">
              {confirmationSummary.receivedBy || "—"}
            </span>
          </div>
        </div>

        {/* E. Allocation table — expanded by default */}
        {receiptPreviewAllocation.length > 0 ? (
          <details className="mt-3" open>
            <summary className="cursor-pointer select-none rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-border">
              Installment details ({receiptPreviewAllocation.length})
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
                  {receiptPreviewAllocation.map((item) => {
                    const isCleared = item.remaining === 0 && item.amountReceived > 0;
                    const isPartial = item.remaining > 0 && item.amountReceived > 0;
                    return (
                      <tr
                        key={item.installmentId}
                        className={`border-t border-border ${
                          isCleared ? "bg-success-soft" : isPartial ? "bg-warning-soft" : ""
                        }`}
                      >
                        <td className="px-2 py-2">
                          <p className="font-medium text-foreground">{item.displayLabel ?? item.installmentLabel}</p>
                          <p className="text-[10px] text-muted-foreground">{item.dueDate}</p>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-foreground">
                          {formatInr(item.amountReceived)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-medium ${
                            isCleared
                              ? "text-success-soft-foreground"
                              : isPartial
                                ? "text-warning-soft-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {isCleared ? "✓ Cleared" : formatInr(item.remaining)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        {/* F. Audit notice */}
        <p className="mt-3 rounded-lg border border-warning-soft bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
          ⚠ Posted receipts stay in history. This action cannot be undone.
        </p>

        {/* G. Action buttons — Save Only is the primary action; Save & Print is secondary. */}
        <div className="sticky bottom-0 z-10 mt-4 grid grid-cols-2 gap-2 border-t border-border bg-card pt-3 pb-2 mobile-safe-bottom-padding sm:grid-cols-[1fr_1fr_1.4fr] sm:pb-3">
          <Button variant="ghost" type="button" onClick={onBack} disabled={isSubmitting} className="w-full">
            ← Back / Edit
          </Button>
          <Button
            variant="outline"
            type="submit"
            form={form}
            name="printMode"
            value="yes"
            disabled={isSubmitting || isDisabled}
            className="w-full"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <Spinner />
                Posting...
              </span>
            ) : (
              "Save & Print"
            )}
          </Button>
          <Button
            type="submit"
            form={form}
            name="printMode"
            value="no"
            disabled={isSubmitting || isDisabled}
            className="col-span-2 w-full sm:col-span-1"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <Spinner />
                Posting...
              </span>
            ) : (
              "Save Payment"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
