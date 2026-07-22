"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { SuccessCheckMark } from "@/components/payments/success-check-mark";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

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
  /** Admin (payments:adjust): allow undoing this just-posted payment. */
  canUndo?: boolean;
  /** Runs the undo server action; resolves with the outcome message. */
  onUndoPayment?: () => Promise<{ ok: boolean; message: string }>;
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
  canUndo = false,
  onUndoPayment,
}: SuccessReceiptSheetProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  // Read once on mount rather than via a live listener: the sheet is a
  // short-lived, fire-once surface, and a mid-animation preference flip is
  // not a case worth extra state for. The CSS animations are silenced by the
  // global reduced-motion block regardless; this only governs the JS count-up.
  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [undoState, setUndoState] = useState<
    "idle" | "confirming" | "working" | "done" | "error"
  >("idle");
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
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
  const rawPhone = (whatsappPhone ?? "").replace(/\D/g, "");
  const normalizedWhatsappPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
  const whatsappHref =
    normalizedWhatsappPhone && whatsappMessage
      ? `https://wa.me/${normalizedWhatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      {/* dvh, not vh — see confirm-receipt-sheet: vh can push the sticky
          action row below the visible viewport. */}
      <div className="max-h-[92dvh] w-full anim-slide-up animate-bottom-sheet-up overflow-y-auto rounded-t-2xl border border-success/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-xl md:rounded-xl md:p-5">
        <div className="flex items-center gap-2.5">
          <SuccessCheckMark />
          <div className="anim-settle-in" style={{ animationDelay: "160ms" }}>
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
          {/* The receipt number STAMPS in like an office rubber stamp — lands
              from above with a slight rotation inside a saffron stamp box.
              Reduced motion: the keyframe is silenced globally and the box
              simply appears square. */}
          <p
            className="anim-stamp-in mt-1.5 inline-block max-w-full break-words rounded-lg border-2 border-accent px-3 py-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            /* Carries the receipt identity across to the receipt page when the
               browser supports view transitions (see startReceiptViewTransition). */
            style={{
              viewTransitionName: "receipt-number",
              animationDelay: "140ms",
            } as React.CSSProperties}
          >
            {receiptNumber}
          </p>
          {receiptId ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Saved ID: {receiptId}</p>
          ) : null}
        </div>

        <div data-mobile-success-receipt-summary className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">
            {studentFullName} · {admissionNo} · {classLabel}
          </p>
          <p className="mt-1 text-muted-foreground">
            {paymentDate} · {paymentModeLabel}
            {referenceNumber ? ` · Ref: ${referenceNumber}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">Received by: {receivedBy || "-"}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="anim-settle-in" style={{ animationDelay: "420ms" }}>
              <p className="text-xs text-muted-foreground">Amount received</p>
              <p className="font-display-money text-2xl text-accent">
                {/* Lands rather than blinks. Under reduced motion CountUp is
                    given its final value up front (startFrom), so the figure
                    is correct and static. */}
                <CountUp
                  value={amountReceived}
                  format="inr"
                  duration={480}
                  startFrom={prefersReducedMotion ? amountReceived : 0}
                />
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

        <div className="sticky bottom-0 z-10 mt-5 border-t border-border bg-card pt-3 pb-2 mobile-safe-bottom-padding sm:pb-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Row 1: Print & WhatsApp */}
            {printReceiptHref ? (
              <Button asChild variant="outline" className={cn("w-full", !whatsappHref && "col-span-2")}>
                <Link href={printReceiptHref} target="_blank">
                  Print A4
                </Link>
              </Button>
            ) : null}
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded-md border border-success/30 bg-success-soft px-3.5 text-sm font-semibold text-success-soft-foreground transition-colors hover:bg-success-soft/80 max-md:h-11 max-md:px-4",
                  !printReceiptHref && "col-span-2"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Send WhatsApp
              </a>
            ) : null}

            {/* Row 2: Next student — ink primary, refocuses student search */}
            <Button
              type="button"
              className="col-span-2 w-full mt-1"
              variant="default"
              onClick={onCollectAnother}
            >
              Next student →
            </Button>

            {/* Row 3: More actions details dropdown */}
            <details className="col-span-2">
              <summary className="cursor-pointer rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-sm font-medium text-foreground">
                More
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className={cn("w-full", !whatsappMessage && "col-span-2")}>
                  <Link href={visibleReceiptHref}>Open Receipt</Link>
                </Button>
                {receiptId ? (
                  <Button asChild variant="outline" className="col-span-2 w-full">
                    {/* 1080×1080 PNG for WhatsApp — download, then attach in the chat. */}
                    <a
                      href={`/protected/receipts/${receiptId}/card`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Receipt Card (image for WhatsApp)
                    </a>
                  </Button>
                ) : null}
                {whatsappMessage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      await navigator.clipboard.writeText(whatsappMessage);
                      setCopyStatus("copied");
                    }}
                  >
                    {copyStatus === "copied" ? "Copied ✓" : "Copy WhatsApp Message"}
                  </Button>
                ) : null}
                {canUndo && onUndoPayment && undoState !== "done" ? (
                  <div className="col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                    {undoState === "confirming" || undoState === "working" ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-foreground">
                          Reverse receipt {receiptNumber} in full? This cannot be re-done from here.
                        </p>
                        <span className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={undoState === "working"}
                            onClick={async () => {
                              setUndoState("working");
                              const result = await onUndoPayment();
                              setUndoMessage(result.message);
                              setUndoState(result.ok ? "done" : "error");
                            }}
                          >
                            {undoState === "working" ? "Undoing..." : "Yes, undo"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={undoState === "working"}
                            onClick={() => setUndoState("idle")}
                          >
                            Cancel
                          </Button>
                        </span>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-destructive"
                        onClick={() => setUndoState("confirming")}
                      >
                        Undo this payment (Admin, within 10 min)
                      </Button>
                    )}
                    {undoState === "error" && undoMessage ? (
                      <p className="mt-1 text-xs text-destructive">{undoMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                {undoState === "done" ? (
                  <p
                    role="status"
                    className="col-span-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground"
                  >
                    {undoMessage ?? `Receipt ${receiptNumber} reversed.`}
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
