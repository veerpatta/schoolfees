"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";

type SuccessReceiptSheetProps = {
  open: boolean;
  receiptNumber: string;
  receiptId: string;
  studentFullName: string;
  admissionNo: string;
  classLabel: string;
  amountReceived: number;
  quickDiscountApplied: number;
  lateFeeWaivedApplied: number;
  paymentDate: string;
  paymentModeLabel: string;
  referenceNumber: string;
  receivedBy: string;
  remainingBalance: number;
  creditBalance: number;
  refundableAmount: number;
  whatsappMessage: string;
  whatsappPhone?: string | null;
  printReceiptHref: string | null;
  visibleReceiptHref: string;
  autoPrint: boolean;
  onCollectAnother: () => void;
};

export function SuccessReceiptSheet({
  open,
  receiptNumber,
  receiptId,
  studentFullName,
  admissionNo,
  classLabel,
  amountReceived,
  quickDiscountApplied,
  lateFeeWaivedApplied,
  paymentDate,
  paymentModeLabel,
  referenceNumber,
  receivedBy,
  remainingBalance,
  creditBalance,
  refundableAmount,
  whatsappMessage,
  whatsappPhone,
  printReceiptHref,
  visibleReceiptHref,
  autoPrint,
  onCollectAnother,
}: SuccessReceiptSheetProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const autoPrintOpenedRef = useRef(false);

  useEffect(() => {
    if (!open || !autoPrint || !printReceiptHref || autoPrintOpenedRef.current) {
      return;
    }

    autoPrintOpenedRef.current = true;
    window.open(printReceiptHref, "_blank");
  }, [autoPrint, open, printReceiptHref]);

  useEffect(() => {
    if (copyStatus !== "copied") {
      return;
    }

    const timer = window.setTimeout(() => setCopyStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  if (!open) {
    return null;
  }

  const creditOrRefund = refundableAmount || creditBalance;
  const normalizedWhatsappPhone = (whatsappPhone ?? "").replace(/\D/g, "");
  const whatsappHref =
    normalizedWhatsappPhone && whatsappMessage
      ? `https://wa.me/${normalizedWhatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[92vh] w-full anim-slide-up animate-bottom-sheet-up overflow-y-auto rounded-t-2xl border border-success/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-xl md:rounded-xl md:p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 anim-scale-in animate-success-check items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
            ✓
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payment Successful</h2>
            <p className="text-sm text-muted-foreground">Receipt has been saved</p>
          </div>
        </div>

        <span className="mt-3 inline-flex rounded bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
          SAVED · Receipt {receiptNumber} / सहेजा गया
        </span>

        <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Receipt No
          </p>
          <p className="mt-1 break-all text-3xl font-semibold text-foreground">
            {receiptNumber}
          </p>
          {receiptId ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Saved ID: {receiptId}</p>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">
            {studentFullName} · {admissionNo} · {classLabel}
          </p>
          <p className="mt-1 text-muted-foreground">
            {paymentDate} · {paymentModeLabel}
            {referenceNumber ? ` · Ref: ${referenceNumber}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">Received by: {receivedBy || "-"}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Amount received</p>
              <p className="text-2xl font-semibold text-accent">
                {formatInr(amountReceived)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-lg font-semibold text-foreground">
                {formatInr(remainingBalance)}
              </p>
            </div>
            {quickDiscountApplied > 0 ? (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-info-soft-foreground">
                Discount {formatInr(quickDiscountApplied)}
              </p>
            ) : null}
            {lateFeeWaivedApplied > 0 ? (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-warning-soft-foreground">
                Late fee waived {formatInr(lateFeeWaivedApplied)}
              </p>
            ) : null}
            {creditOrRefund > 0 ? (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-info-soft-foreground sm:col-span-2">
                Credit/refund {formatInr(creditOrRefund)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 mt-5 grid gap-2 border-t border-border bg-card pt-3 mobile-safe-bottom-padding sm:grid-cols-2">
          {whatsappHref ? (
            <Button asChild className="sm:col-span-2" variant="accent">
              <Link href={whatsappHref} target="_blank" rel="noreferrer">
                Send Receipt on WhatsApp
              </Link>
            </Button>
          ) : whatsappMessage ? (
            <Button
              type="button"
              variant="outline"
              className="sm:col-span-2"
              onClick={async () => {
                await navigator.clipboard.writeText(whatsappMessage);
                setCopyStatus("copied");
              }}
            >
              {copyStatus === "copied" ? "Copied ✓" : "Copy WhatsApp Message"}
            </Button>
          ) : null}
          <Button type="button" className="sm:col-span-2" variant="outline" onClick={onCollectAnother}>
            Collect Another Payment
          </Button>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-sm font-medium text-foreground">
              More
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {printReceiptHref ? (
                <Button asChild variant="outline">
                  <Link href={printReceiptHref} target="_blank">Print Receipt</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={visibleReceiptHref}>Open Receipt</Link>
              </Button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
