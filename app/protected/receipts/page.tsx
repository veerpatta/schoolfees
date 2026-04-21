import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { getReceiptsList } from "@/lib/receipts/data";
import { requireStaffPermission } from "@/lib/supabase/session";

type ReceiptsPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

function paymentModeLabel(mode: "cash" | "upi" | "bank_transfer" | "cheque") {
  if (mode === "upi") {
    return "UPI";
  }

  if (mode === "bank_transfer") {
    return "Bank transfer";
  }

  if (mode === "cheque") {
    return "Cheque";
  }

  return "Cash";
}

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  await requireStaffPermission("receipts:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = (resolvedSearchParams?.query ?? "").trim();
  const receipts = await getReceiptsList(query);
  const totalAmount = receipts.reduce((sum, row) => sum + row.totalAmount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Receipts"
        title="Receipts and reprints"
        description="Search issued receipts, open formal printable copies, and verify payment details for desk and audit use."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Receipt records" value={receipts.length} hint="Latest entries in this filtered view" />
        <MetricCard title="Amount in view" value={formatInr(totalAmount)} hint="Sum of listed receipts" />
        <MetricCard title="Search" value={query || "All receipts"} hint="Filter by receipt no or reference no" />
      </section>

      <SectionCard title="Receipt lookup" description="Search by receipt number or reference number.">
        <form action="/protected/receipts" method="get" className="flex gap-3">
          <input
            name="query"
            defaultValue={query}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder="e.g. SVP20260421-0001 or UPI reference"
          />
          <button className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Recent receipts" description="Linked directly to append-only payment entries.">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Receipt no</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Received by</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                    No receipts found for this filter.
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => {
                  return (
                    <tr key={receipt.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{receipt.receiptNumber}</td>
                      <td className="px-4 py-3">{receipt.paymentDate}</td>
                      <td className="px-4 py-3">
                        {receipt.studentFullName} ({receipt.admissionNo})
                      </td>
                      <td className="px-4 py-3">{receipt.classLabel}</td>
                      <td className="px-4 py-3">{paymentModeLabel(receipt.paymentMode)}</td>
                      <td className="px-4 py-3">{formatInr(receipt.totalAmount)}</td>
                      <td className="px-4 py-3">{receipt.referenceNumber ?? "-"}</td>
                      <td className="px-4 py-3">{receipt.receivedBy ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/protected/receipts/${receipt.id}`}>Open / Print</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
