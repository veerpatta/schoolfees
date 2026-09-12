"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Printer,
  ExternalLink,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Sheet } from "@/ui/primitives/sheet";
import { ReceiptDocument } from "@/modules/receipts/ui/receipt-document";
import {
  SendReceiptButton,
  type SendReceiptState,
} from "@/modules/receipts/ui/send-receipt-button";
import { createBilingualReceiptTranslator } from "@/platform/i18n/bilingual-receipt";
import { appendSessionParam } from "@/platform/navigation/session-href";
import type { ReceiptDetail } from "@/modules/receipts/domain/types";

type ReceiptPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  receiptId: string | null;
  /** Optional pre-loaded receipt detail to skip the fetch. */
  initialReceipt?: ReceiptDetail | null;
  sessionLabel?: string;
  /**
   * `receipts:print`. Required, not optional — it used to default to `true`,
   * so the transactions preview (which passed nothing) offered Print A4 to
   * every read-only role and 403'd on the click. Making it required means the
   * compiler asks each new call site instead of failing open.
   */
  canPrint: boolean;
  /**
   * The one-tap WhatsApp send. Optional: every surface that opens this sheet
   * can offer it, but a preview opened purely to LOOK at a receipt need not.
   *
   * Passed in rather than imported because `src/modules` may not import
   * `src/app`, where the action lives.
   */
  sendReceiptAction?: (
    state: SendReceiptState,
    formData: FormData,
  ) => Promise<SendReceiptState>;
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
  canPrint,
  sendReceiptAction,
}: ReceiptPreviewSheetProps) {
  const t = useTranslations("Receipts");
  // Parent-facing document → always bilingual, independent of the UI locale.
  const receiptT = useMemo(() => createBilingualReceiptTranslator(), []);
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
      title={
        receiptNumber
          ? t("previewSheetTitleWithNumber", { number: receiptNumber })
          : t("previewSheetTitle")
      }
      description={t("previewSheetDescription")}
      size="full"
    >
      <div className="space-y-3">
        {state.status === "loading" ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("previewLoading")}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-3 text-sm text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{t("previewErrorTitle")}</p>
              <p className="mt-0.5 text-xs">{state.message}</p>
            </div>
          </div>
        ) : null}

        {/* Verification status — the question a desk asks of a receipt someone
            hands them is "is this real, and does it still stand?" */}
        {state.status === "ready" ? (
          state.receipt.isVoided ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-destructive-soft px-2.5 py-1 text-xs font-semibold text-destructive-soft-foreground">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {t("previewReversedBadge")}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-soft-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {t("previewValidBadge")}
            </p>
          )
        ) : null}

        {state.status === "ready" ? (
          <ReceiptDocument receipt={state.receipt} mode="saved" density="compact" t={receiptT} />
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 mobile-safe-bottom-padding sm:-mx-5 sm:px-5">
          <Button variant="ghost" type="button" onClick={onClose}>
            {t("previewClose")}
          </Button>
          {/* One control on every width. There used to be two — a one-tap
              share on the phone and a template-picking sheet at the desk —
              because the desk had a body to choose and a phone to pick. The
              template is Meta-approved and the number comes from the ledger, so
              there is nothing left to choose and nothing to differ about. */}
          {state.status === "ready" && sendReceiptAction && canPrint ? (
            <SendReceiptButton
              receiptId={state.receipt.id}
              action={sendReceiptAction}
            />
          ) : null}
          {fullPageHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={fullPageHref} target="_blank" rel="noopener">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("openFullPage")}
              </Link>
            </Button>
          ) : null}
          {canPrint && printHref ? (
            <Button asChild size="sm">
              <Link href={printHref} target="_blank" rel="noopener">
                <Printer className="size-4" aria-hidden="true" />
                {t("printA4Action")}
              </Link>
            </Button>
          ) : null}
        </div>

      </div>
    </Sheet>
  );
}
