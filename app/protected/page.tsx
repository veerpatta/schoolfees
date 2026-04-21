import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { createClient } from "@/lib/supabase/server";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const staffName = data?.claims?.email ?? "Authorized staff";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard Overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome, {staffName}. This dashboard supports a gradual transition
          from spreadsheet-based fee operations.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          title="Late fee"
          value={formatInr(activeFeeRules.lateFeeFlatRupees)}
          hint="Applied as a flat penalty"
        />
        <MetricCard
          title="Installments"
          value="4"
          hint={activeFeeRules.installmentDueDates.join(" • ")}
        />
        <MetricCard
          title="Class 12 Science"
          value={formatInr(activeFeeRules.class12ScienceAnnualFeeRupees)}
          hint="Default annual fee"
        />
      </section>

      <SectionCard
        title="Daily workflow"
        description="Recommended sequence for staff to maintain consistent and auditable records."
      >
        <ol className="space-y-2 text-sm text-slate-700">
          <li>1. Verify student admissions and class allocations</li>
          <li>2. Check generated installments and due dates</li>
          <li>3. Record collections with payment mode and receipt reference</li>
          <li>4. Review outstanding and daily summary report</li>
        </ol>
      </SectionCard>

      <SectionCard
        title="Migration status"
        description="Use this checklist to replace manual workbook entries safely."
      >
        <ul className="space-y-2 text-sm text-slate-700">
          <li>- Run workbook import class by class</li>
          <li>- Reconcile collected totals after each import</li>
          <li>- Freeze workbook edits after each verified batch</li>
        </ul>
      </SectionCard>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Internal app notice: This system is for school admin staff only. Do not
        share credentials externally.
      </div>
    </div>
  );
}
