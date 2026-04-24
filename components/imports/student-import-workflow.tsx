import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ImportDashboard } from "@/components/imports/import-dashboard";
import { BatchUploadCard } from "@/components/imports/batch-upload-card";
import { ColumnMappingCard } from "@/components/imports/column-mapping-card";
import { BatchSummaryCard } from "@/components/imports/batch-summary-card";
import { AnomalyQueue } from "@/components/imports/anomaly-queue";
import { ImportCommitCard } from "@/components/imports/import-commit-card";
import { isCorrectionQueueRow } from "@/lib/import/review";
import type { ImportPageData } from "@/lib/import/types";

type StudentImportWorkflowProps = {
  data: ImportPageData;
  canManage: boolean;
  notice: string | null;
  error: string | null;
};

function NoticeBlock({
  message,
  tone,
}: {
  message: string;
  tone: "success" | "error";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      }
    >
      {message}
    </div>
  );
}

export function StudentImportWorkflow({
  data,
  canManage,
  notice,
  error,
}: StudentImportWorkflowProps) {
  const selectedBatch = data.selectedBatch;
  const mode = selectedBatch?.importMode ?? data.mode;

  const unresolvedQueue =
    selectedBatch?.rows.filter((row) => isCorrectionQueueRow(row)) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Advanced Import History"
        description={mode === "update"
          ? "Technical import dashboard for batch history, troubleshooting, and update-mode review."
          : "Technical import dashboard for batch history, troubleshooting, and add-mode review."}
        actions={
          canManage ? (
            <StatusBadge label="Fast upload flow" tone="accent" />
          ) : (
            <StatusBadge label="Read-only QA view" tone="warning" />
          )
        }
      />

      {notice ? <NoticeBlock message={notice} tone="success" /> : null}
      {error ? <NoticeBlock message={error} tone="error" /> : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        {mode === "update"
          ? "Bulk update matches by Student ID first and SR no second. Name alone is never used for automatic updates."
          : "Bulk add can generate temporary SR numbers. Use the downloaded template so class and route names match the app."}
      </div>

      <BatchUploadCard
        canManage={canManage}
        mode={mode}
        supportedFormats={data.supportedFormats}
      />

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Previous uploads and history
        </summary>
        <div className="border-t border-slate-200 p-4">
          <ImportDashboard recentBatches={data.recentBatches} selectedBatch={selectedBatch} />
        </div>
      </details>

      {selectedBatch ? (
        <>
          <ColumnMappingCard
            batch={selectedBatch}
            fieldDefinitions={data.fieldDefinitions}
            canManage={canManage}
            mode={mode}
          />

          <BatchSummaryCard batch={selectedBatch} />

          <AnomalyQueue
            batch={selectedBatch}
            unresolvedRows={unresolvedQueue}
            canManage={canManage}
            mode={mode}
          />

          <ImportCommitCard
            batch={selectedBatch}
            canManage={canManage}
            mode={mode}
          />
        </>
      ) : null}
    </div>
  );
}
