import { SectionCard } from "@/components/admin/section-card";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage admissions, class mapping, and active enrollment status.
        </p>
      </header>

      <SectionCard
        title="Workbook migration"
        description="Start with active classes and onboard historical records batch-by-batch."
      >
        <ul className="space-y-2 text-sm text-slate-700">
          <li>- Add current session students first</li>
          <li>- Import one class at a time from workbook</li>
          <li>- Reconcile totals before finalizing each batch</li>
        </ul>
      </SectionCard>
    </div>
  );
}
