"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type ReceiptPrintActionsProps = {
  backHref?: string;
  autoPrint?: boolean;
};

export function ReceiptPrintActions({
  backHref = "/protected/receipts",
  autoPrint = false,
}: ReceiptPrintActionsProps) {
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
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        Print receipt
      </Button>
      <Button asChild variant="secondary">
        <Link href={backHref}>Back to receipts</Link>
      </Button>
    </div>
  );
}
