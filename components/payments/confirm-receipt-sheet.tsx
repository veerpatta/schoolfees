"use client";

import { useEffect, useState } from "react";

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

const screenLanguageStorageKey = "vpps.receipt.screenLanguage";

function BilingualLabel({
  english,
  hindi,
  language,
}: {
  english: string;
  hindi: string;
  language: "en" | "hi";
}) {
  return (
    <span className="block text-[10px] font-medium text-muted-foreground">
      {language === "hi" ? hindi : english}
    </span>
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
  sessionLabel,
}: ConfirmReceiptSheetProps) {
  const [screenLanguage, setScreenLanguage] = useState<"en" | "hi">("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(screenLanguageStorageKey);
      if (stored === "hi" || stored === "en") {
        setScreenLanguage(stored);
      }
    } catch {
      // Local preference is optional.
    }
  }, []);

  if (!open) {
    return null;
  }

  const adjustmentTotal =
    confirmationSummary.quickDiscountApplied +
    confirmationSummary.lateFeeWaivedApplied;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[92vh] w-full anim-slide-up overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-3xl md:rounded-xl md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-foreground">DRAFT — Review before saving</p>
            <p className="text-sm text-muted-foreground">Receipt Preview</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground"
              aria-pressed={screenLanguage === "hi"}
              onClick={() => {
                const next = screenLanguage === "hi" ? "en" : "hi";
                setScreenLanguage(next);
                try {
                  window.localStorage.setItem(screenLanguageStorageKey, next);
                } catch {
                  // Local preference is optional.
                }
              }}
            >
              हि
            </button>
            <span className="rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning-soft-foreground">
              DRAFT
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="border-b border-dashed border-border-strong pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase text-foreground">
                  Shri Veer Patta Senior Secondary School
                </p>
                <p className="text-xs text-muted-foreground">
                  {screenLanguage === "hi" ? "शुल्क रसीद" : "Fee Receipt"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {screenLanguage === "hi" ? "शैक्षणिक सत्र" : "Academic Year"}: {sessionLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-right">
                <BilingualLabel english="Receipt No" hindi="रसीद संख्या" language={screenLanguage} />
                <p className="mt-1 text-sm font-semibold text-foreground">
                  — (not yet saved) —
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {confirmationSummary.paymentDate}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <BilingualLabel english="Student" hindi="विद्यार्थी" language={screenLanguage} />
              <p className="font-semibold text-foreground">
                {confirmationSummary.studentName} · {confirmationSummary.admissionNo} · {confirmationSummary.classLabel}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <BilingualLabel english="Date / Mode" hindi="दिनांक / माध्यम" language={screenLanguage} />
              <p className="font-medium text-foreground">
                {confirmationSummary.paymentDate} · {confirmationSummary.paymentModeLabel}
                {confirmationSummary.referenceNumber ? ` · Ref: ${confirmationSummary.referenceNumber}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.25fr_1fr]">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
              <BilingualLabel english="Pending" hindi="देय" language={screenLanguage} />
              <p className="mt-1 text-base font-semibold text-foreground">
                {formatInr(confirmationSummary.pendingBeforeDiscount)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-info-soft px-3 py-3">
              <BilingualLabel english="Discount / Waiver" hindi="छूट / माफी" language={screenLanguage} />
              <p className="mt-1 text-base font-semibold text-info-soft-foreground">
                {formatInr(adjustmentTotal)}
              </p>
            </div>
            <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-3">
              <BilingualLabel english="Received" hindi="प्राप्त" language={screenLanguage} />
              <p className="mt-1 text-2xl font-semibold text-accent">
                {formatInr(confirmationSummary.amount)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-warning-soft px-3 py-3">
              <BilingualLabel english="Balance" hindi="शेष" language={screenLanguage} />
              <p className="mt-1 text-base font-semibold text-warning-soft-foreground">
                {formatInr(confirmationSummary.remainingBalance)}
              </p>
            </div>
          </div>

          {confirmationSummary.quickDiscountApplied > 0 ||
          confirmationSummary.lateFeeWaivedApplied > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Discount: {formatInr(confirmationSummary.quickDiscountApplied)} · Late fee waived:{" "}
              {formatInr(confirmationSummary.lateFeeWaivedApplied)}
            </p>
          ) : null}

          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="whitespace-normal break-words px-2 py-2">
                    {screenLanguage === "hi" ? "किस्त" : "Installment"}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {screenLanguage === "hi" ? "आवंटित" : "Allocated"}
                  </th>
                  <th className="px-2 py-2 text-right">
                    {screenLanguage === "hi" ? "शेष" : "Remaining"}
                  </th>
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
        </div>

        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Posted receipts stay in history. This action cannot be undone.
        </p>

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
