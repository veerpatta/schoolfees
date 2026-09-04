import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { ReceiptsListSkeleton } from "@/modules/receipts/ui/receipts-list-skeleton";
import { ReceiptsQuickLoad } from "@/modules/receipts/ui/receipts-quick-load";
import { readerFromRecord } from "@/platform/navigation/search-params";
import { getPaymentDeskClassOptions } from "@/modules/payments/data/queries";
import { getReceiptsPage } from "@/modules/receipts/data/queries";
// The date presets resolve to real bounds inside getReceiptsPage, against the
// school's timezone — the client never needs to know what "today" is.
import { normalizeReceiptFilters, type ReceiptFilters } from "@/modules/receipts/domain/filters";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/platform/supabase/session";
import { listWhatsappTemplates } from "@/modules/whatsapp/data/queries";

type ReceiptsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

/**
 * The list and its filters: everything that has to wait for the database.
 * The page renders the header on the first flush and this fills in behind.
 */
async function ReceiptsList({
  filters,
  page,
  sessionLabel,
  canPrintReceipts,
}: {
  filters: ReceiptFilters;
  page: number;
  sessionLabel: string;
  canPrintReceipts: boolean;
}) {
  // The class list is cached on `session:{label}` and is a fifth the size of
  // the full student form options — this page only needs labels for chips.
  const [data, classOptions, whatsappTemplates] = await Promise.all([
    getReceiptsPage(filters.query, { page, pageSize: 30 }, sessionLabel, filters),
    getPaymentDeskClassOptions(sessionLabel),
    // Without this the preview opened from THIS list fell back to the built-in
    // body while the same receipt opened on its own page used the office's
    // template — one receipt, two different messages to the parent.
    listWhatsappTemplates({ onlyActive: true }),
  ]);

  return (
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
  );
}

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  // One round of waiting for the things that depend on nothing.
  const [t, staff, resolvedSearchParams, cookieSession] = await Promise.all([
    getTranslations("Receipts"),
    requireStaffPermission("receipts:view", { onDenied: "redirect" }),
    searchParams ? searchParams : Promise.resolve(undefined),
    getViewSessionCookie(),
  ]);
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession,
  });
  // One normalizer for the page and the search route, so the first render and
  // the first refetch cannot answer different questions.
  const filters = {
    ...normalizeReceiptFilters(readerFromRecord(resolvedSearchParams)),
    sessionLabel: viewSession.sessionLabel,
  };
  const page = Math.max(1, Number.parseInt(asString(resolvedSearchParams?.page) || "1", 10) || 1);
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("indexEyebrow")}
        title={t("indexTitle")}
        description={t("indexDescription")}
      />

      <Suspense fallback={<ReceiptsListSkeleton />}>
        <ReceiptsList
          filters={filters}
          page={page}
          sessionLabel={viewSession.sessionLabel}
          canPrintReceipts={canPrintReceipts}
        />
      </Suspense>
    </div>
  );
}
