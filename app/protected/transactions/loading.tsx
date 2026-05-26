import { getTranslations } from "next-intl/server";

import { RouteLoading } from "@/components/admin/route-loading";

export default async function Loading() {
  const t = await getTranslations("Transactions");
  return (
    <RouteLoading
      badgeLabel={t("loadingBadge")}
      title={t("loadingTitle")}
      description={t("loadingDescription")}
      cards={5}
    />
  );
}
