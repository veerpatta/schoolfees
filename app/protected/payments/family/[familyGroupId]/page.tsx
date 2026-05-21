import { notFound } from "next/navigation";

import { submitFamilyPaymentAction } from "@/app/protected/payments/family/[familyGroupId]/actions";
import { FamilyPaymentClient } from "@/components/payments/family-payment-client";
import { PageHeader } from "@/components/admin/page-header";
import { familyPaymentsEnabled } from "@/lib/config/feature-flags";
import { getFamilyPaymentEntryPageData } from "@/lib/payments/family";
import { requireStaffPermission } from "@/lib/supabase/session";

type FamilyPaymentPageProps = {
  params: Promise<{
    familyGroupId: string;
  }>;
};

export default async function FamilyPaymentPage({ params }: FamilyPaymentPageProps) {
  if (!familyPaymentsEnabled) {
    notFound();
  }

  await requireStaffPermission("payments:write");
  const { familyGroupId } = await params;
  const data = await getFamilyPaymentEntryPageData(familyGroupId);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family Payment"
        description="Collect one family amount and create one auditable receipt per child."
      />
      <FamilyPaymentClient data={data} action={submitFamilyPaymentAction} />
    </div>
  );
}
