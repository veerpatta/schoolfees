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
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        No import batches yet. Upload the first spreadsheet to begin staged import.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
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
            <tbody className="divide-y divide-slate-100 bg-white">
              {recentBatches.map((batch) => {
                const isSelected = selectedBatch?.id === batch.id;
                const progress = getProgressPercent(batch);

                return (
                  <tr key={batch.id} className={isSelected ? "bg-slate-50/80" : undefined}>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">{batch.filename}</p>
                      <p className="text-xs text-slate-500">
                        {batch.sourceFormat.toUpperCase()}
                        {batch.worksheetName ? ` | ${batch.worksheetName}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={getStatusLabel(batch.status)} tone={getBatchTone(batch.status)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{batch.totalRows}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-emerald-700">{batch.validRows}</span>
                      {" / "}
                      <span className="text-red-600">{batch.invalidRows}</span>
                      {" / "}
                      <span className="text-amber-700">{batch.duplicateRows}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-700">{batch.importedRows}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{formatShortDate(batch.updatedAt)}</td>
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
