import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { MobilePrintedReceipt } from "@/modules/payments/ui/mobile-printed-receipt";
import { MobileReceiptActionBar } from "@/modules/receipts/ui/mobile-receipt-action-bar";
import { ReceiptDocument } from "@/modules/receipts/ui/receipt-document";
import { ReceiptPrintActions } from "@/modules/receipts/ui/receipt-print-actions";
import { SendReceiptButton } from "@/modules/receipts/ui/send-receipt-button";
import { ReceiptAdminReversalAction } from "@/modules/receipts/ui/receipt-admin-reversal-action";
import { ReceiptUndoAction } from "@/modules/receipts/ui/receipt-undo-action";
import { isUndoWindowOpen } from "@/modules/receipts/domain/undo-window";
import { createBilingualReceiptTranslator } from "@/platform/i18n/bilingual-receipt";
import { getReceiptDetail } from "@/modules/receipts/data/queries";
import {
  sendReceiptOnWhatsappAction,
  sendReversalNoticeAction,
} from "@/app/protected/receipts/actions";
import { hasStaffPermission, requireStaffPermission } from "@/platform/supabase/session";
import { isUuid } from "@/platform/helpers/uuid";
import { safeReturnTo } from "@/platform/navigation/return-to";

type ReceiptDetailPageProps = {
  params: Promise<{
    receiptId: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
    print?: string;
    layout?: string;
  }>;
};

export default async function ReceiptDetailPage({ params, searchParams }: ReceiptDetailPageProps) {
  const t = await getTranslations("Receipts");
  const staff = await requireStaffPermission("receipts:view", { onDenied: "redirect" });

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const receiptId = resolvedParams.receiptId.trim();
  // Any workspace path: a receipt is opened from a student profile as often as
  // from Transactions, and the old check sent the first case to the wrong list.
  const returnTo = safeReturnTo(
    resolvedSearchParams?.returnTo,
    "/protected/transactions?view=receipts",
  );
  const shouldAutoPrint = resolvedSearchParams?.print === "1";

  if (!isUuid(receiptId)) {
    notFound();
  }

  const receipt = await getReceiptDetail(receiptId);

  if (!receipt) {
    notFound();
  }

  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  // The 10-minute undo and the unlimited admin reversal are the same decision at
  // two different ages, so only one of them is ever offered. Evaluated here on
  // the server rather than left to the countdown component, which would
  // otherwise leave the page with no correction path at all once it self-hides.
  const undoWindowOpen = isUndoWindowOpen(receipt.createdAt);
  const canUndoPayment =
    hasStaffPermission(staff, "payments:adjust") && !receipt.isVoided && undoWindowOpen;
  const canReverseReceipt =
    hasStaffPermission(staff, "payments:reverse_any") && !receipt.isVoided && !undoWindowOpen;
  // Separate from `canReverseReceipt`, which is false on an already-reversed
  // receipt by design — it gates the REVERSE button. Telling the family is the
  // opposite case: it only exists once the receipt has been reversed.
  const canAnnounceReversal =
    hasStaffPermission(staff, "payments:reverse_any") && receipt.isVoided;
  const layout = resolvedSearchParams?.layout === "v2" ? ("v2" as const) : ("v3" as const);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("detailEyebrow")}
        title={t("detailTitle", { number: receipt.receiptNumber })}
        description={t("detailDescription")}
        actions={
          // Desk-only from here down. The phone gets MobileReceiptActionBar
          // below, where sending to the parent is the primary act rather than
          // the third chip in a wrapping row.
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Link className="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={returnTo}>
              {t("backToTransactions")}
            </Link>
            {/* `receipts:print`, matching the PDF route and the phone bar: this
                issues the parent-facing artefact. It used to be ungated,
                because opening `wa.me` cost the school nothing and sent
                nothing; a send from the school's own number is a different act
                and carries a different right. */}
            {canPrintReceipts ? (
              <SendReceiptButton
                receiptId={receipt.id}
                action={sendReceiptOnWhatsappAction}
              />
            ) : null}
            {/* A reversal is never announced automatically — most of them are
                the office correcting its own entry, and the family may never
                have known. This is the deliberate act, for the ones where they
                did. */}
            {canAnnounceReversal ? (
              <SendReceiptButton
                receiptId={receipt.id}
                action={sendReversalNoticeAction}
                label="Tell the family it was reversed"
              />
            ) : null}
            {canPrintReceipts ? <ReceiptPrintActions autoPrint={shouldAutoPrint} /> : null}
            {canUndoPayment ? (
              <ReceiptUndoAction
                receiptId={receipt.id}
                studentId={receipt.studentId}
                sessionLabel={receipt.sessionLabel}
                receiptNumber={receipt.receiptNumber}
                createdAt={receipt.createdAt}
              />
            ) : null}
            {canReverseReceipt ? (
              <ReceiptAdminReversalAction
                receiptId={receipt.id}
                studentId={receipt.studentId}
                sessionLabel={receipt.sessionLabel}
                receiptNumber={receipt.receiptNumber}
                studentName={receipt.studentFullName}
                totalAmount={receipt.totalAmount}
                paymentDate={receipt.paymentDate}
                alreadyReversedAmount={receipt.reversedAmount ?? 0}
                concessionAmount={receipt.discountAmount + receipt.lateFeeWaived}
              />
            ) : null}
          </div>
        }
        className="no-print"
      />

      {/* Phone: the same paper slip the counter just printed (mobile v2).
          A reprint should look like the thing being reprinted — an A4
          document scaled onto a 375px screen read as a different document
          from the original. The A4 render stays for tablet, desktop and
          every print path. */}
      {/* Bottom padding clears the fixed action bar below, so the last line of
          the slip is never sitting underneath it. */}
      <div
        className="md:hidden print:hidden"
        style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 6rem)" }}
      >
        <MobilePrintedReceipt
          receiptNumber={receipt.receiptNumber}
          studentFullName={receipt.studentFullName}
          fatherName={receipt.fatherName}
          admissionNo={receipt.admissionNo}
          classLabel={receipt.classLabel}
          amountReceived={receipt.totalAmount}
          paymentDate={receipt.paymentDate}
          paymentModeLabel={receipt.paymentMode}
          receivedBy={receipt.receivedBy ?? receipt.createdByName ?? ""}
          remainingBalance={receipt.outstandingAfterReceipt}
          isVoided={receipt.isVoided}
        />
      </div>

      <div className="hidden md:block print:block">
        <ReceiptDocument
          receipt={receipt}
          t={createBilingualReceiptTranslator()}
          layout={layout}
        />
      </div>

      {/* Mounted OUTSIDE the `hidden md:block` document above, which is a
          display:none subtree on a phone — anything interactive placed inside
          it is unreachable. */}
      <MobileReceiptActionBar
        receipt={receipt}
        canPrintReceipts={canPrintReceipts}
        printHref={`/protected/receipts/${receipt.id}?print=1`}
        sendReceiptAction={sendReceiptOnWhatsappAction}
      />
    </div>
  );
}
