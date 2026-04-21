import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { RolePreview } from "@/components/admin/role-preview";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatInr } from "@/lib/helpers/currency";
import { protectedNavigation } from "@/lib/config/navigation";
import { createClient } from "@/lib/supabase/server";

const workQueues = [
  "Use Students to keep admissions, class assignment, and status clean.",
  "Configure Fee Setup before staff begin posting live collections.",
  "Record Payments and keep receipts append-only and auditable.",
  "Use Ledger and Defaulters to review balances instead of editing history.",
] as const;

const auditNotes = [
  "Historical payments should remain append-only even after correction flows are added.",
  "Receipt numbers, payment modes, and staff identity need to stay visible in operational views.",
  "This shell is intentionally simple so office staff can move fast without hunting for actions.",
] as const;

type RecentReceiptRow = {
  receipt_number: string;
  payment_date: string;
  total_amount: number;
};

export default async function ProtectedPage() {
  const supabase = await createClient();

  const [
    { count: activeStudentsCount, error: activeStudentsError },
    { count: todayReceiptsCount, error: todayReceiptsCountError },
    { data: todayReceiptsRaw, error: todayCollectionError },
    { data: outstandingRaw, error: outstandingError },
    { data: recentReceiptsRaw, error: recentReceiptsError },
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "inactive"]),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("payment_date", new Date().toISOString().slice(0, 10)),
    supabase
      .from("receipts")
      .select("total_amount")
      .eq("payment_date", new Date().toISOString().slice(0, 10)),
    supabase
      .from("v_outstanding_summary")
      .select("outstanding_amount, students_with_dues"),
    supabase
      .from("receipts")
      .select("receipt_number, payment_date, total_amount")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (
    activeStudentsError ||
    todayReceiptsCountError ||
    todayCollectionError ||
    outstandingError ||
    recentReceiptsError
  ) {
    throw new Error(
      activeStudentsError?.message ||
        todayReceiptsCountError?.message ||
        todayCollectionError?.message ||
        outstandingError?.message ||
        recentReceiptsError?.message ||
        "Unable to load dashboard data.",
    );
  }

  const activeStudents = activeStudentsCount ?? 0;
  const todayReceipts = todayReceiptsCount ?? 0;
  const todayCollection = ((todayReceiptsRaw ?? []) as Array<{ total_amount: number }>).reduce(
    (sum, row) => sum + row.total_amount,
    0,
  );
  const outstandingRows =
    (outstandingRaw ?? []) as Array<{
      outstanding_amount: number;
      students_with_dues: number;
    }>;
  const outstandingAmount = outstandingRows.reduce(
    (sum, row) => sum + row.outstanding_amount,
    0,
  );
  const studentsWithDues = outstandingRows.reduce(
    (sum, row) => sum + row.students_with_dues,
    0,
  );
  const recentReceipts = (recentReceiptsRaw ?? []) as RecentReceiptRow[];

  const dashboardMetrics = [
    {
      title: "Active students",
      value: activeStudents,
      hint: "Students currently active/inactive for office operations",
    },
    {
      title: "Today receipts",
      value: todayReceipts,
      hint: "Posted from payment entry desk",
    },
    {
      title: "Today collection",
      value: formatInr(todayCollection),
      hint: "Total of receipts dated today",
    },
    {
      title: "Outstanding",
      value: formatInr(outstandingAmount),
      hint: `${studentsWithDues} students with pending dues`,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Admin shell overview"
        description="This is the initial internal workspace for VPPS fee operations. Each section is scaffolded for a clear office workflow, with room to connect live data next."
        actions={<StatusBadge label="Initial shell" tone="good" />}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            hint={metric.hint}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Open sections"
          description="The sidebar stays focused on the daily internal admin workflow."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {protectedNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <p className="text-sm font-semibold text-slate-950">
                  {item.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Current focus"
          description="The shell is optimized for clarity before feature depth."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            {workQueues.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <SectionCard
        title="Role placeholders"
        description="Initial role names are available in the shell now, even before fine-grained permission enforcement is wired."
      >
        <RolePreview title={null} description={null} />
      </SectionCard>

      <SectionCard
        title="Audit reminders"
        description="Keep the shell aligned with the school’s correction-safe operating rules."
      >
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          {auditNotes.map((note) => (
            <li
              key={note}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              {note}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Recent receipt activity"
        description="Latest posted receipts from the payment entry desk."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Receipt no</th>
                <th className="px-4 py-3">Payment date</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentReceipts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No receipts posted yet.
                  </td>
                </tr>
              ) : (
                recentReceipts.map((receipt) => (
                  <tr
                    key={`${receipt.receipt_number}-${receipt.payment_date}`}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{receipt.receipt_number}</td>
                    <td className="px-4 py-3">{receipt.payment_date}</td>
                    <td className="px-4 py-3">{formatInr(receipt.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
