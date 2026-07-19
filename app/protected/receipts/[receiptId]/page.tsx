import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptPrintActions } from "@/components/receipts/receipt-print-actions";
import { ReceiptShareActions } from "@/components/receipts/receipt-share-actions";
import { ReceiptUndoAction } from "@/components/receipts/receipt-undo-action";
import { createBilingualReceiptTranslator } from "@/lib/i18n/bilingual-receipt";
import { getReceiptDetail } from "@/lib/receipts/data";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ReceiptDetailPageProps = {
  params: Promise<{
    receiptId: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
    print?: string;
  }>;
};

function isUuid(value: string) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
}

export default async function ReceiptDetailPage({ params, searchParams }: ReceiptDetailPageProps) {
  const t = await getTranslations("Receipts");
  const staff = await requireStaffPermission("receipts:view", { onDenied: "redirect" });

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const receiptId = resolvedParams.receiptId.trim();
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/transactions")
    ? resolvedSearchParams.returnTo
    : "/protected/transactions?view=receipts";
  const shouldAutoPrint = resolvedSearchParams?.print === "1";

  if (!isUuid(receiptId)) {
    notFound();
  }

  const [receipt, whatsappTemplates] = await Promise.all([
    getReceiptDetail(receiptId),
    listWhatsappTemplates({ onlyActive: true }),
  ]);

  if (!receipt) {
    notFound();
  }

  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");
  const canUndoPayment =
    hasStaffPermission(staff, "payments:adjust") && !receipt.isVoided;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("detailEyebrow")}
        title={t("detailTitle", { number: receipt.receiptNumber })}
        description={t("detailDescription")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={returnTo}>
              {t("backToTransactions")}
            </Link>
            {canPrintReceipts ? (
              <>
                <ReceiptShareActions receipt={receipt} templates={whatsappTemplates} />
                <ReceiptPrintActions autoPrint={shouldAutoPrint} />
              </>
            ) : null}
            {canUndoPayment ? (
              <ReceiptUndoAction
                receiptId={receipt.id}
                studentId={receipt.studentId}
                sessionLabel={receipt.sessionLabel}
                receiptNumber={receipt.receiptNumber}
                createdAt={receipt.createdAt}
              />
            ) : null}
          </div>
        }
        className="no-print"
      />

      <ReceiptDocument receipt={receipt} t={createBilingualReceiptTranslator()} />
    </div>
  );
}
