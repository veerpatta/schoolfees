import Link from "next/link";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/helpers/date";
import type { ImportBatchDetail, ImportBatchListItem } from "@/lib/import/types";

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

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getProgressPercent(batch: ImportBatchListItem) {
  if (batch.totalRows === 0) return 0;

  return Math.round(((batch.importedRows + batch.skippedRows) / batch.totalRows) * 100);
}

type ImportDashboardProps = {
  recentBatches: ImportBatchListItem[];
  selectedBatch: ImportBatchDetail | null;
};

export function ImportDashboard({ recentBatches, selectedBatch }: ImportDashboardProps) {
  return (
    <SectionCard title="Upload history" description="Recent uploads and import progress.">
      {recentBatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-6 text-sm text-muted-foreground">
        No import batches yet. Upload the first spreadsheet to begin staged import.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Upload</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3">Valid / Invalid / Dup</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {recentBatches.map((batch) => {
                const isSelected = selectedBatch?.id === batch.id;
                const progress = getProgressPercent(batch);

                return (
                  <tr key={batch.id} className={isSelected ? "bg-surface-2/80" : undefined}>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <p className="font-medium text-foreground">{batch.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {batch.sourceFormat.toUpperCase()}
                        {batch.worksheetName ? ` | ${batch.worksheetName}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={getStatusLabel(batch.status)} tone={getBatchTone(batch.status)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{batch.totalRows}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-success-soft-foreground">{batch.validRows}</span>
                      {" / "}
                      <span className="text-destructive">{batch.invalidRows}</span>
                      {" / "}
                      <span className="text-warning-soft-foreground">{batch.duplicateRows}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-info-soft-foreground">{batch.importedRows}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatShortDate(batch.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant={isSelected ? "secondary" : "outline"} size="sm" asChild>
                        <Link href={`/protected/imports?mode=${batch.importMode}&batchId=${batch.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
