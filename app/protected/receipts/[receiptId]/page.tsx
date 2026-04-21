import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptPrintActions } from "@/components/receipts/receipt-print-actions";
import { getReceiptDetail } from "@/lib/receipts/data";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

type ReceiptDetailPageProps = {
  params: Promise<{
    receiptId: string;
  }>;
};

function isUuid(value: string) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
}

export default async function ReceiptDetailPage({ params }: ReceiptDetailPageProps) {
  await requireAuthenticatedStaff();

  const resolvedParams = await params;
  const receiptId = resolvedParams.receiptId.trim();

  if (!isUuid(receiptId)) {
    notFound();
  }

  const receipt = await getReceiptDetail(receiptId);

  if (!receipt) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Receipts"
        title={`Receipt ${receipt.receiptNumber}`}
        description="Formal receipt view with print-friendly layout for office records and reprints."
        actions={<ReceiptPrintActions />}
        className="no-print"
      />

      <ReceiptDocument receipt={receipt} />
    </div>
  );
}
