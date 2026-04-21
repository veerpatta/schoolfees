import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";

const masterFields = [
  "Admission number",
  "Student full name",
  "Guardian name",
  "Mobile number",
  "Class",
  "Section",
  "Session label",
  "Active status",
] as const;

const migrationChecklist = [
  "Prepare one CSV per class or a small class group.",
  "Keep workbook admission numbers unchanged while migrating.",
  "Mark the record source as import or manual for traceability.",
  "Validate duplicates before posting the batch.",
  "Freeze workbook edits for each verified batch.",
] as const;

const statusRules = [
  {
    label: "Active",
    note: "Student can appear in ledger generation, collections, and reports.",
  },
  {
    label: "Inactive",
    note: "Keep the history visible but block fresh operational assumptions.",
  },
  {
    label: "Left / Graduated",
    note: "Do not delete the row. Keep it for historical ledger and receipt traceability.",
  },
] as const;

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Student master records"
        description="Maintain admissions, class-section mapping, and current-session enrollment without breaking historical fee records."
        actions={<StatusBadge label="Import-first workflow" tone="warning" />}
      />

      <SectionCard
        title="Student master fields"
        description="These are the minimum fields worth capturing before live collections begin."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {masterFields.map((field) => (
            <div
              key={field}
              className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm font-medium text-slate-700"
            >
              {field}
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Workbook migration checklist"
          description="Start with active classes and onboard records batch by batch."
        >
          <ol className="space-y-3 text-sm leading-6 text-slate-700">
            {migrationChecklist.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Status handling"
          description="Use explicit statuses instead of deleting student history."
        >
          <div className="space-y-3">
            {statusRules.map((status) => (
              <div
                key={status.label}
                className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
              >
                <p className="text-base font-semibold text-slate-950">
                  {status.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {status.note}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Audit expectation"
        description="Student changes should always remain traceable to the staff user and import batch."
      >
        <p className="text-sm leading-6 text-slate-700">
          Preserve <code>created_at</code>, <code>updated_at</code>,{" "}
          <code>created_by</code>, <code>updated_by</code>, and source tracking
          whenever student records are imported or corrected. The goal is to
          replace workbook ambiguity with explicit history, not just move rows
          into a new UI.
        </p>
      </SectionCard>
    </div>
  );
}
