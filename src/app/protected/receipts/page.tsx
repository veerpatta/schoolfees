import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { ReceiptsQuickLoad } from "@/components/receipts/receipts-quick-load";
import { readerFromRecord } from "@/platform/navigation/search-params";
import { getPaymentDeskClassOptions } from "@/lib/payments/data";
import { getReceiptsPage } from "@/lib/receipts/data";
// The date presets resolve to real bounds inside getReceiptsPage, against the
// school's timezone — the client never needs to know what "today" is.
import { normalizeReceiptFilters } from "@/lib/receipts/filters";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/platform/supabase/session";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";

type ReceiptsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  // One normalizer for the page and the search route, so the first render and
  // the first refetch cannot answer different questions.
  const filters = {
    ...normalizeReceiptFilters(readerFromRecord(resolvedSearchParams)),
    sessionLabel: viewSession.sessionLabel,
  };
  const page = Math.max(1, Number.parseInt(asString(resolvedSearchParams?.page) || "1", 10) || 1);

  // The class list is cached on `session:{label}` and is a fifth the size of
  // the full student form options — this page only needs labels for chips.
  const [data, classOptions, whatsappTemplates] = await Promise.all([
    getReceiptsPage(filters.query, { page, pageSize: 30 }, viewSession.sessionLabel, filters),
    getPaymentDeskClassOptions(viewSession.sessionLabel),
    // Without this the preview opened from THIS list fell back to the built-in
    // body while the same receipt opened on its own page used the office's
    // template — one receipt, two different messages to the parent.
    listWhatsappTemplates({ onlyActive: true }),
  ]);
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("indexEyebrow")}
        title={t("indexTitle")}
        description={t("indexDescription")}
      />

      <ReceiptsQuickLoad
        initialFilters={filters}
        initialPage={page}
        initialReceipts={data.receipts}
        initialTotalCount={data.totalCount}
        initialAggregate={data.aggregate}
        classOptions={classOptions}
        canPrintReceipts={canPrintReceipts}
        whatsappTemplates={whatsappTemplates}
      />
    </div>
  );
}
