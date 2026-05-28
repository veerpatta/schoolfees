"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { DuplicatePaymentKind } from "@/lib/payments/types";

type DuplicateReceiptSheetProps = {
  open: boolean;
  message: string | null;
  receiptId: string;
  receiptNumber: string | null;
  /**
   * Audit 1.4 — when "daily-amount", show a "Continue anyway" override that
   * resubmits with acknowledgeDailyDuplicate=true and keeps the form intact.
   * Defaults to "near-duplicate" for the legacy 60-second flow.
   */
  kind?: DuplicatePaymentKind | null;
  onCollectAnother: () => void;
  /** Required when kind === "daily-amount". */
  onContinueAnyway?: () => void;
};

export function DuplicateReceiptSheet({
  open,
  message,
  receiptId,
  receiptNumber,
  kind,
  onCollectAnother,
  onContinueAnyway,
}: DuplicateReceiptSheetProps) {
  const t = useTranslations("Payments");

  if (!open) {
    return null;
  }

  const isDailyAmount = kind === "daily-amount";

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
          {isDailyAmount && onContinueAnyway ? (
            <Button type="button" variant="accent" onClick={onContinueAnyway}>
              {t("duplicateContinueAnyway")}
            </Button>
          ) : null}
          <Button type="button" onClick={onCollectAnother}>
            {t("duplicateStartNew")}
          </Button>
        </div>
      </div>
    </div>
  );
}
