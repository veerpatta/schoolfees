import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { formatInr } from "@/lib/helpers/currency";
import { createClient } from "@/lib/supabase/server";

type ReceiptsPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

type ReceiptRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  student_ref:
    | {
        full_name: string;
        admission_no: string;
      }
    | {
        full_name: string;
        admission_no: string;
      }[]
    | null;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function paymentModeLabel(mode: ReceiptRow["payment_mode"]) {
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = (resolvedSearchParams?.query ?? "").trim();
  const supabase = await createClient();

  let receiptsQuery = supabase
    .from("receipts")
    .select(
      "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, student_ref:students(full_name, admission_no)",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (query) {
    receiptsQuery = receiptsQuery.or(
      `receipt_number.ilike.%${query}%,reference_number.ilike.%${query}%`,
    );
  }

  const { data: receiptsRaw, error: receiptsError } = await receiptsQuery;

  if (receiptsError) {
    throw new Error(`Unable to load receipts: ${receiptsError.message}`);
  }

  const receipts = (receiptsRaw ?? []) as ReceiptRow[];
  const totalAmount = receipts.reduce((sum, row) => sum + row.total_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Receipts"
        title="Receipts and reprints"
        description="Search issued receipts and verify payment details, references, and receiver identity."
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
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Receipt no</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Received by</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No receipts found for this filter.
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => {
                  const student = toSingleRecord(receipt.student_ref);

                  return (
                    <tr key={receipt.id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{receipt.receipt_number}</td>
                      <td className="px-4 py-3">{receipt.payment_date}</td>
                      <td className="px-4 py-3">
                        {student
                          ? `${student.full_name} (${student.admission_no})`
                          : "Unknown student"}
                      </td>
                      <td className="px-4 py-3">{paymentModeLabel(receipt.payment_mode)}</td>
                      <td className="px-4 py-3">{formatInr(receipt.total_amount)}</td>
                      <td className="px-4 py-3">{receipt.reference_number ?? "-"}</td>
                      <td className="px-4 py-3">{receipt.received_by ?? "-"}</td>
                      <td className="px-4 py-3">{receipt.notes ?? "-"}</td>
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
