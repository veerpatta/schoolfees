"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type ReceiptPrintActionsProps = {
  backHref?: string;
  autoPrint?: boolean;
};

export function ReceiptPrintActions({
  backHref = "/protected/receipts",
  autoPrint = false,
}: ReceiptPrintActionsProps) {
  const t = useTranslations("Receipts");
  const [showPdfHint, setShowPdfHint] = useState(false);

  // Hide the PDF hint after the print dialog closes (afterprint).
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleAfterPrint() {
      setShowPdfHint(false);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  useEffect(() => {
    if (!autoPrint) {
      return;
    }

    const printWhenReady = async () => {
      const images = Array.from(document.images);
      await Promise.allSettled(
        images.map((image) => {
          if (image.complete) {
            return Promise.resolve();
          }

          return image.decode().catch(() => undefined);
        }),
      );

      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.print());
      });
    };

    void printWhenReady();
  }, [autoPrint]);

  // Auto-close the print tab on mobile after the user dismisses the print
  // dialog so they're not left juggling an extra tab. Desktop browsers
  // routinely block window.close() on the parent tab; this only no-ops there.
  useEffect(() => {
    if (!autoPrint) return;
    if (typeof window === "undefined") return;
    function handleAfterPrint() {
      // Small delay so the print dialog has fully closed before window.close.
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // window.close() is best-effort: most browsers block it on tabs
          // that weren't opened by script. The user can close the tab manually.
        }
      }, 250);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [autoPrint]);

  return (
    <div className="no-print flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => window.print()}>
          {t("printActionsPrintReceipt")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowPdfHint(true);
            window.print();
          }}
        >
          {t("printActionsSaveAsPdf")}
        </Button>
        <Button asChild variant="secondary">
          <Link href={backHref}>{t("printActionsBack")}</Link>
        </Button>
      </div>
      {showPdfHint ? (
        <p className="text-[11px] text-muted-foreground">
          {t("printActionsPdfHintPrefix")}
          <strong>{t("printActionsPdfHintEmphasis")}</strong>
          {t("printActionsPdfHintSuffix")}
        </p>
      ) : null}
    </div>
  );
}
