"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Printer, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptShareActions } from "@/components/receipts/receipt-share-actions";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { ReceiptDetail } from "@/lib/receipts/types";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";

type ReceiptPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  receiptId: string | null;
  /** Optional pre-loaded receipt detail to skip the fetch. */
  initialReceipt?: ReceiptDetail | null;
  sessionLabel?: string;
  canPrint?: boolean;
  /** Optional list of active WhatsApp templates for the Share action. */
  whatsappTemplates?: WhatsappTemplate[];
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; receipt: ReceiptDetail }
  | { status: "error"; message: string };

export function ReceiptPreviewSheet({
  open,
  onClose,
  receiptId,
  initialReceipt,
  sessionLabel,
  canPrint = true,
  whatsappTemplates = [],
}: ReceiptPreviewSheetProps) {
  const [state, setState] = useState<FetchState>(
    initialReceipt ? { status: "ready", receipt: initialReceipt } : { status: "idle" },
  );

  useEffect(() => {
    if (!open || !receiptId) {
      return;
    }

    if (initialReceipt && initialReceipt.id === receiptId) {
      setState({ status: "ready", receipt: initialReceipt });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    fetch(`/protected/receipts/${receiptId}/detail`, {
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `Unable to load receipt (${response.status})`);
        }
        return (await response.json()) as ReceiptDetail;
      })
      .then((receipt) => {
        if (cancelled) return;
        setState({ status: "ready", receipt });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setState({ status: "error", message: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [open, receiptId, initialReceipt]);

  const fullPageHref =
    receiptId != null
      ? appendSessionParam(`/protected/receipts/${receiptId}`, sessionLabel)
      : null;
  const printHref =
    receiptId != null
      ? appendSessionParam(`/protected/receipts/${receiptId}?print=1`, sessionLabel)
      : null;
  const receiptNumber = state.status === "ready" ? state.receipt.receiptNumber : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={receiptNumber ? `Receipt ${receiptNumber}` : "Receipt"}
      description="Quick preview. Open full page to print or share."
      size="full"
    >
      <div className="space-y-3">
        {state.status === "loading" ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading receipt…
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-3 text-sm text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">Unable to load receipt</p>
              <p className="mt-0.5 text-xs">{state.message}</p>
            </div>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <ReceiptDocument receipt={state.receipt} mode="saved" density="compact" />
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 mobile-safe-bottom-padding sm:-mx-5 sm:px-5">
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          {state.status === "ready" ? (
            <ReceiptShareActions receipt={state.receipt} templates={whatsappTemplates} />
          ) : null}
          {fullPageHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={fullPageHref} target="_blank" rel="noopener">
                <ExternalLink className="size-4" aria-hidden="true" />
                Open full page
              </Link>
            </Button>
          ) : null}
          {canPrint && printHref ? (
            <Button asChild size="sm">
              <Link href={printHref} target="_blank" rel="noopener">
                <Printer className="size-4" aria-hidden="true" />
                Print
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
