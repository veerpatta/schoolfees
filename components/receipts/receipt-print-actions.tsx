"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

type ReceiptPrintActionsProps = {
  backHref?: string;
};

export function ReceiptPrintActions({ backHref = "/protected/receipts" }: ReceiptPrintActionsProps) {
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
