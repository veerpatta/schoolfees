import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatShortDate } from "@/lib/helpers/date";
import type { ImportBatchDetail, ImportBatchListItem, ImportAnomalyCategory } from "@/lib/import/types";

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getBatchTone(status: ImportBatchListItem["status"]) {
  switch (status) {
    case "completed":
      return "good" as const;
    case "failed":
      return "warning" as const;
    case "validated":
      return "accent" as const;
    case "importing":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className ?? "border-slate-200 bg-white"}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

const CATEGORY_LABELS: Record<ImportAnomalyCategory, string> = {
  "missing-admission-no": "Missing SR / admission no",
  "invalid-dob": "Invalid DOB",
  "duplicate-admission-no": "Duplicate by SR no",
  "duplicate-name-class-dob": "Duplicate by name + class + DOB",
  "unmapped-class": "Unmapped class",
  "unmapped-route": "Unmapped route",
  "missing-parent-fields": "Missing parent fields",
  "placeholder-values": "Placeholder values",
};

function AnomalyBreakdown({ batch }: { batch: ImportBatchDetail }) {
  const categoryCounts = new Map<ImportAnomalyCategory, number>();

  for (const row of batch.rows) {
    if (row.status === "imported" || row.reviewStatus === "skipped") {
      continue;
    }

    for (const category of row.anomalyCategories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }

  if (categoryCounts.size === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Anomaly category breakdown</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {[...categoryCounts.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([category, count]) => (
            <div
              key={category}
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
            >
              <span className="font-semibold text-amber-800">{count}</span>
              <span className="text-amber-700">{CATEGORY_LABELS[category]}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

type BatchSummaryCardProps = {
  batch: ImportBatchDetail;
};

export function BatchSummaryCard({ batch }: BatchSummaryCardProps) {
  const createRows = batch.rows.filter((row) => row.operation === "create").length;
  const updateRows = batch.rows.filter((row) => row.operation === "update").length;

  return (
    <SectionCard
      title="Batch summary"
      description="Dry-run totals, anomaly review states, and final approvals stay attached to this batch for traceability."
      actions={<StatusBadge label={getStatusLabel(batch.status)} tone={getBatchTone(batch.status)} />}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total rows" value={batch.totalRows} />
        <SummaryCard label="Valid" value={batch.validRows} className="border-emerald-200 bg-emerald-50" />
        <SummaryCard label="Invalid" value={batch.invalidRows} className="border-red-200 bg-red-50" />
        <SummaryCard label="Duplicates" value={batch.duplicateRows} className="border-amber-200 bg-amber-50" />
        <SummaryCard label="Imported" value={batch.importedRows} className="border-blue-200 bg-blue-50" />
        <SummaryCard label="Failed on save" value={batch.failedRows} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SummaryCard label="New student rows" value={createRows} className="border-sky-200 bg-sky-50" />
        <SummaryCard label="Existing student updates" value={updateRows} className="border-violet-200 bg-violet-50" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Approved for import"
          value={batch.reviewSummary.approvedRows}
          className="border-emerald-200 bg-emerald-50"
        />
        <SummaryCard
          label="Pending review"
          value={batch.reviewSummary.pendingRows}
          className="border-amber-200 bg-amber-50"
        />
        <SummaryCard label="On hold" value={batch.reviewSummary.heldRows} />
        <SummaryCard label="Skipped" value={batch.reviewSummary.skippedRows} />
        <SummaryCard
          label="Unresolved anomalies"
          value={batch.reviewSummary.unresolvedAnomalyRows}
          className="border-red-200 bg-red-50"
        />
      </div>

      <AnomalyBreakdown batch={batch} />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">File:</span> {batch.filename}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Format:</span> {batch.sourceFormat.toUpperCase()}
            {batch.worksheetName ? ` | Sheet: ${batch.worksheetName}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Uploaded:</span> {formatShortDate(batch.createdAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Validated:</span> {formatShortDate(batch.validationCompletedAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Imported:</span> {formatShortDate(batch.importCompletedAt)}
          </p>
        </div>
      </div>

      {batch.errorMessage ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {batch.errorMessage}
        </div>
      ) : null}
    </SectionCard>
  );
}
