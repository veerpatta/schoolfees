import { SectionCard } from "@/components/admin/section-card";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generate day-book, outstanding, and class-level summary reports.
        </p>
      </header>

      <SectionCard
        title="Audit focus"
        description="Reports should be reproducible and traceable to each ledger entry."
      >
        <ul className="space-y-2 text-sm text-slate-700">
          <li>- Daily collection summary by payment mode</li>
          <li>- Outstanding by class and student</li>
          <li>- Ledger export with created and updated timestamps</li>
        </ul>
      </SectionCard>
    </div>
  );
}
