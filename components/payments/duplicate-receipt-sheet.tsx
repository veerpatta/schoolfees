"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatTimeIst } from "@/lib/helpers/date";
import type { DuplicatePaymentKind } from "@/lib/payments/types";

type DuplicateReceiptSheetProps = {
  open: boolean;
  message: string | null;
  receiptId: string;
  receiptNumber: string | null;
  /**
   * Audit 1.4 — when "daily-amount", show a "Continue anyway" override that
   * resubmits with acknowledgeDailyDuplicate=true and keeps the form intact.
   * Defaults to "near-duplicate" for the hard 10-minute flow.
   */
  kind?: DuplicatePaymentKind | null;
  /** Existing-receipt details from the duplicate check (optional — older
   * action states won't carry them). */
  existingCreatedAt?: string | null;
  existingAmount?: number | null;
  existingMode?: string | null;
  /** Admin (payments:adjust) may bypass the hard near-duplicate block. */
  canOverrideNearDuplicate?: boolean;
  onCollectAnother: () => void;
  /** Required when kind === "daily-amount". */
  onContinueAnyway?: () => void;
  /** Required when canOverrideNearDuplicate — admin near-duplicate bypass. */
  onOverrideNearDuplicate?: () => void;
};

export function DuplicateReceiptSheet({
  open,
  message,
  receiptId,
  receiptNumber,
  kind,
  existingCreatedAt,
  existingAmount,
  existingMode,
  canOverrideNearDuplicate,
  onCollectAnother,
  onContinueAnyway,
  onOverrideNearDuplicate,
}: DuplicateReceiptSheetProps) {
  const t = useTranslations("Payments");
  // Both bypass paths ("Continue anyway" and the admin override) are gated
  // behind this explicit confirmation — a one-click continue is exactly how
  // the live double payments got through.
  const [confirmedDifferent, setConfirmedDifferent] = useState(false);

  if (!open) {
    return null;
  }

  const isDailyAmount = kind === "daily-amount";
  const showDailyContinue = isDailyAmount && Boolean(onContinueAnyway);
  const showAdminOverride =
    !isDailyAmount && Boolean(canOverrideNearDuplicate) && Boolean(onOverrideNearDuplicate);
  const detailValues = {
    receiptNumber: receiptNumber ?? "—",
    amount: existingAmount !== null && existingAmount !== undefined ? formatInr(existingAmount) : "—",
    mode: existingMode ?? "—",
    time: existingCreatedAt ? formatTimeIst(existingCreatedAt) : "",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-2 md:items-center md:px-4">
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-warning/30 bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl md:max-w-lg md:rounded-xl md:p-5">
        <h2 className="text-lg font-semibold text-foreground">{t("duplicateTitle")}</h2>
        <p className="mt-3 text-sm text-foreground">{message}</p>
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning-soft-foreground">
          {existingCreatedAt
            ? t("duplicateDetailWithTime", detailValues)
            : t("duplicateDetailNoTime", detailValues)}
        </p>
        {!isDailyAmount && !showAdminOverride ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("duplicateHardStopHint")}</p>
        ) : null}
        {showDailyContinue || showAdminOverride ? (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-destructive"
              checked={confirmedDifferent}
              onChange={(event) => setConfirmedDifferent(event.target.checked)}
            />
            <span>
              {t("duplicateConfirmDifferent", { receiptNumber: receiptNumber ?? "—" })}
            </span>
          </label>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/protected/receipts/${receiptId}`}>{t("duplicateOpenLatest")}</Link>
          </Button>
          {showDailyContinue ? (
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmedDifferent}
              onClick={onContinueAnyway}
            >
              {t("duplicateContinueAnyway")}
            </Button>
          ) : null}
          {showAdminOverride ? (
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmedDifferent}
              onClick={onOverrideNearDuplicate}
            >
              {t("duplicateAdminOverride")}
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
