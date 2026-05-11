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
    <div className={`rounded-xl border p-4 ${className ?? "border-border bg-card"}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
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
    <div className="mt-4 rounded-xl border bg-warning-soft p-4">
      <p className="text-sm font-semibold text-warning-soft-foreground">Visible correction category breakdown</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {[...categoryCounts.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([category, count]) => (
            <div
              key={category}
              className="flex items-center gap-2 rounded-lg border border-warning/40 bg-card px-3 py-2 text-sm"
            >
              <span className="font-semibold text-warning-soft-foreground">{count}</span>
              <span className="text-warning-soft-foreground">{CATEGORY_LABELS[category]}</span>
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
      title="Upload summary"
      description="Validation totals and review states stay attached to this upload for traceability."
      actions={<StatusBadge label={getStatusLabel(batch.status)} tone={getBatchTone(batch.status)} />}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total rows" value={batch.totalRows} />
        <SummaryCard label="Valid" value={batch.validRows} className="bg-success-soft" />
        <SummaryCard label="Invalid" value={batch.invalidRows} className="bg-destructive-soft" />
        <SummaryCard label="Duplicates" value={batch.duplicateRows} className="bg-warning-soft" />
        <SummaryCard label="Imported" value={batch.importedRows} className="bg-info-soft" />
        <SummaryCard label="Failed on save" value={batch.failedRows} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SummaryCard label="New student rows" value={createRows} className="bg-info-soft" />
        <SummaryCard label="Existing student updates" value={updateRows} className="border-info/30 bg-info-soft" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Ready to import"
          value={batch.reviewSummary.readyToImportRows}
          className="bg-success-soft"
        />
        <SummaryCard
          label="Needs correction"
          value={batch.reviewSummary.correctionRows}
          className="bg-warning-soft"
        />
        <SummaryCard
          label="Warnings"
          value={batch.reviewSummary.warningRows}
          className="bg-info-soft"
        />
        <SummaryCard label="On hold" value={batch.reviewSummary.heldRows} />
        <SummaryCard label="Skipped" value={batch.reviewSummary.skippedRows} />
      </div>

      <AnomalyBreakdown batch={batch} />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
          <p>
            <span className="font-semibold text-foreground">Upload file:</span> {batch.filename}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-foreground">Format:</span> {batch.sourceFormat.toUpperCase()}
            {batch.worksheetName ? ` | Sheet: ${batch.worksheetName}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
          <p>
            <span className="font-semibold text-foreground">Uploaded:</span> {formatShortDate(batch.createdAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-foreground">Validated:</span> {formatShortDate(batch.validationCompletedAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-foreground">Imported:</span> {formatShortDate(batch.importCompletedAt)}
          </p>
        </div>
      </div>

      {batch.errorMessage ? (
        <div className="mt-4 rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          {batch.errorMessage}
        </div>
      ) : null}
    </SectionCard>
  );
}
