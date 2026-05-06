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
