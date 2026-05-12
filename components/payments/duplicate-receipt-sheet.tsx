"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

type DuplicateReceiptSheetProps = {
  open: boolean;
  message: string | null;
  receiptId: string;
  receiptNumber: string | null;
  onCollectAnother: () => void;
};

export function DuplicateReceiptSheet({
  open,
  message,
  receiptId,
  receiptNumber,
  onCollectAnother,
}: DuplicateReceiptSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-warning/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-lg md:rounded-xl md:p-5">
        <h2 className="text-lg font-semibold text-foreground">
          Similar payment already recorded
        </h2>
        <p className="mt-3 text-sm text-foreground">{message}</p>
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Latest receipt: {receiptNumber}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/protected/receipts/${receiptId}`}>Open latest receipt</Link>
          </Button>
          <Button type="button" onClick={onCollectAnother}>
            Start new payment
          </Button>
        </div>
      </div>
    </div>
  );
}
