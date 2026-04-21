import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";

const importWorkflow = [
  "Export a clean CSV from the workbook for one class or one verified batch.",
  "Validate admission numbers, class values, and duplicate rows before posting.",
  "Create an import batch record with source filename and row counts.",
  "Post valid rows, keep rejected rows separate, and reconcile totals.",
  "Freeze workbook edits for the verified batch and move to the next class.",
] as const;

const requiredColumns = [
  "admission_no",
  "full_name",
  "class_name",
  "section",
  "guardian_name",
  "mobile_no",
  "session_label",
  "status",
] as const;

const batchStates = [
  {
    label: "Draft",
    note: "File received but not yet validated against duplicates or missing fields.",
  },
  {
    label: "Validated",
    note: "Row checks passed and the batch is ready to post into student master tables.",
  },
  {
    label: "Posted",
    note: "Rows were written into the system and matched against workbook totals.",
  },
  {
    label: "Failed",
    note: "Keep the batch history, fix issues, and rerun with a new verified file.",
  },
] as const;

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Imports"
        title="Workbook migration batches"
        description="Treat imports as controlled checkpoints so spreadsheet data can move into the app with verification, not guesswork."
        actions={<StatusBadge label="Incremental migration" tone="warning" />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Recommended import cycle"
          description="Use the same flow for every class or workbook segment."
        >
          <ol className="space-y-3 text-sm leading-6 text-slate-700">
            {importWorkflow.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="CSV starter columns"
          description="Keep the column names stable so import automation stays predictable."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {requiredColumns.map((column) => (
              <div
                key={column}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {column}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Batch states"
        description="Every import should stay visible even when it fails."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {batchStates.map((state, index) => (
            <div
              key={state.label}
              className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <p className="text-base font-semibold text-slate-950">
                  {state.label}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {state.note}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
