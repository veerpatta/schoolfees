import { notFound } from "next/navigation";

import { ReceiptPrintActions } from "@/components/receipts/receipt-print-actions";
import { FamilyReceiptDocument } from "@/components/receipts/family-receipt-document";
import { familyPaymentsEnabled } from "@/lib/config/feature-flags";
import { getReceiptDetail } from "@/lib/receipts/data";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

type FamilyReceiptPageProps = {
  params: Promise<{
    familyPaymentId: string;
  }>;
  searchParams?: Promise<{
    print?: string;
  }>;
};

export default async function FamilyReceiptPage({ params, searchParams }: FamilyReceiptPageProps) {
  if (!familyPaymentsEnabled) {
    notFound();
  }

  await requireStaffPermission("receipts:view", { onDenied: "redirect" });
  const { familyPaymentId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("id")
    .eq("family_payment_id", familyPaymentId)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    notFound();
  }

  const receipts = (await Promise.all(data.map((row) => getReceiptDetail(row.id)))).filter(
    (receipt) => receipt !== null,
  );

  if (receipts.length === 0) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <ReceiptPrintActions autoPrint={resolvedSearchParams?.print === "1"} />
      <FamilyReceiptDocument familyPaymentId={familyPaymentId} receipts={receipts} />
    </div>
  );
}
