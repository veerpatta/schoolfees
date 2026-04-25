import { notFound } from "next/navigation";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptPrintActions } from "@/components/receipts/receipt-print-actions";
import { getReceiptDetail } from "@/lib/receipts/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ReceiptDetailPageProps = {
  params: Promise<{
    receiptId: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

function isUuid(value: string) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value);
}

export default async function ReceiptDetailPage({ params, searchParams }: ReceiptDetailPageProps) {
  const staff = await requireStaffPermission("receipts:view", { onDenied: "redirect" });

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const receiptId = resolvedParams.receiptId.trim();
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/transactions")
    ? resolvedSearchParams.returnTo
    : "/protected/transactions?view=receipts";

  if (!isUuid(receiptId)) {
    notFound();
  }

  const receipt = await getReceiptDetail(receiptId);

  if (!receipt) {
    notFound();
  }

  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Receipts"
        title={`Receipt ${receipt.receiptNumber}`}
        description="Formal receipt view with print-friendly layout for office records and reprints."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline" href={returnTo}>
              Back to Transactions
            </Link>
            {canPrintReceipts ? <ReceiptPrintActions /> : null}
          </div>
        }
        className="no-print"
      />

      <ReceiptDocument receipt={receipt} />
    </div>
  );
}
