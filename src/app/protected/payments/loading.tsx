import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { PaymentDeskSkeleton } from "@/modules/payments/ui/payment-desk-skeleton";

export default async function Loading() {
  const t = await getTranslations("Payments");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <PaymentDeskSkeleton />
    </div>
  );
}
