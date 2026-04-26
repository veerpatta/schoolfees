import { PageHeader } from "@/components/admin/page-header";
import { ReceiptsQuickLoad } from "@/components/receipts/receipts-quick-load";
import { getReceiptsPage } from "@/lib/receipts/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type ReceiptsPageProps = {
  searchParams?: Promise<{
    query?: string;
    page?: string;
  }>;
};

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const staff = await requireStaffPermission("receipts:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = (resolvedSearchParams?.query ?? "").trim();
  const page = Math.max(1, Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1);
  const data = await getReceiptsPage(query, { page, pageSize: 30 });
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Receipts"
        title="Receipts and reprints"
        description="Search receipts and open printable copies."
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
