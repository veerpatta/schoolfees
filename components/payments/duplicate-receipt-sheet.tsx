"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Payments");

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-warning/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-lg md:rounded-xl md:p-5">
        <h2 className="text-lg font-semibold text-foreground">{t("duplicateTitle")}</h2>
        <p className="mt-3 text-sm text-foreground">{message}</p>
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          {t("duplicateLatestReceiptPrefix")}
          {receiptNumber}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/protected/receipts/${receiptId}`}>{t("duplicateOpenLatest")}</Link>
          </Button>
          <Button type="button" onClick={onCollectAnother}>
            {t("duplicateStartNew")}
          </Button>
        </div>
      </div>
    </div>
  );
}
