"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type FamilyReceiptsBatchActionsProps = {
  backHref: string;
  autoPrint?: boolean;
  disabled?: boolean;
};

export function FamilyReceiptsBatchActions({
  backHref,
  autoPrint = false,
  disabled = false,
}: FamilyReceiptsBatchActionsProps) {
  useEffect(() => {
    if (!autoPrint || disabled) {
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
  }, [autoPrint, disabled]);

  useEffect(() => {
    if (!autoPrint || disabled) return;
    if (typeof window === "undefined") return;
    function handleAfterPrint() {
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
  }, [autoPrint, disabled]);

  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => window.print()}
        disabled={disabled}
      >
        Print all
      </Button>
      <Button asChild variant="secondary">
        <Link href={backHref}>Back</Link>
      </Button>
    </div>
  );
}
