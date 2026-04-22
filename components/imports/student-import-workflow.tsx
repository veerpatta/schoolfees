import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ImportDashboard } from "@/components/imports/import-dashboard";
import { BatchUploadCard } from "@/components/imports/batch-upload-card";
import { ColumnMappingCard } from "@/components/imports/column-mapping-card";
import { BatchSummaryCard } from "@/components/imports/batch-summary-card";
import { AnomalyQueue } from "@/components/imports/anomaly-queue";
import { ImportCommitCard } from "@/components/imports/import-commit-card";
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

  const approvedRows =
    selectedBatch?.rows.filter(
      (row) => row.status === "valid" && row.reviewStatus === "approved",
    ) ?? [];

  const unresolvedQueue =
    selectedBatch?.rows.filter(
      (row) =>
        row.status !== "imported" &&
        row.reviewStatus !== "skipped" &&
        (row.reviewStatus !== "approved" || row.anomalyCategories.length > 0),
    ) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Imports"
        title="Student import QA and anomaly resolution"
        description="Upload CSV/XLSX, run dry-run QA, review anomalies, approve clean rows, and import only approved rows with full batch traceability."
        actions={
          canManage ? (
            <StatusBadge label="Review and approval required" tone="accent" />
          ) : (
            <StatusBadge label="Read-only QA view" tone="warning" />
          )
        }
      />

      {notice ? <NoticeBlock message={notice} tone="success" /> : null}
      {error ? <NoticeBlock message={error} tone="error" /> : null}

      <BatchUploadCard
        canManage={canManage}
        supportedFormats={data.supportedFormats}
      />

      <ImportDashboard
        recentBatches={data.recentBatches}
        selectedBatch={selectedBatch}
      />

      {selectedBatch ? (
        <>
          <ColumnMappingCard
            batch={selectedBatch}
            fieldDefinitions={data.fieldDefinitions}
            canManage={canManage}
          />

          <BatchSummaryCard batch={selectedBatch} />

          <AnomalyQueue
            batch={selectedBatch}
            unresolvedRows={unresolvedQueue}
            canManage={canManage}
          />

          <ImportCommitCard
            batch={selectedBatch}
            approvedRows={approvedRows}
            canManage={canManage}
          />
        </>
      ) : null}
    </div>
  );
}
