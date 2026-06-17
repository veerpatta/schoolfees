import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { ReceiptsQuickLoad } from "@/components/receipts/receipts-quick-load";
import { getReceiptsPage } from "@/lib/receipts/data";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ReceiptsPageProps = {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    session?: string | string[];
  }>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const t = await getTranslations("Receipts");
  const staff = await requireStaffPermission("receipts:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const query = (resolvedSearchParams?.query ?? "").trim();
  const page = Math.max(1, Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1);
  const data = await getReceiptsPage(query, { page, pageSize: 30 }, viewSession.sessionLabel);
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("indexEyebrow")}
        title={t("indexTitle")}
        description={t("indexDescription")}
      />

      <ReceiptsQuickLoad
        initialQuery={query}
        initialPage={page}
        initialReceipts={data.receipts}
        initialTotalCount={data.totalCount}
        canPrintReceipts={canPrintReceipts}
      />
    </div>
  );
}
