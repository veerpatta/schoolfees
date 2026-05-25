import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ImportDashboard } from "@/components/imports/import-dashboard";
import { BatchUploadCard } from "@/components/imports/batch-upload-card";
import { ColumnMappingCard } from "@/components/imports/column-mapping-card";
import { BatchSummaryCard } from "@/components/imports/batch-summary-card";
import { AnomalyQueue } from "@/components/imports/anomaly-queue";
import { DuplicateAuditPanel } from "@/components/imports/duplicate-audit-panel";
import { ImportCommitCard } from "@/components/imports/import-commit-card";
import { isCorrectionQueueRow } from "@/lib/import/review";
import type { DuplicateAuditSummary, ImportPageData } from "@/lib/import/types";

type StudentImportWorkflowProps = {
  data: ImportPageData;
  canManage: boolean;
  currentSessionLabel: string | null;
  sessionOptions: Array<{ value: string; label: string }>;
  notice: string | null;
  error: string | null;
  duplicateAuditSummary?: DuplicateAuditSummary | null;
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
          ? "rounded-xl border bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground"
          : "rounded-xl border bg-success-soft px-4 py-3 text-sm text-success-soft-foreground"
      }
    >
      {message}
    </div>
  );
}

export function StudentImportWorkflow({
  data,
  canManage,
  currentSessionLabel,
  sessionOptions,
  notice,
  error,
  duplicateAuditSummary = null,
}: StudentImportWorkflowProps) {
  const selectedBatch = data.selectedBatch;
  const mode = selectedBatch?.importMode ?? data.mode;

  const unresolvedQueue =
    selectedBatch?.rows.filter((row) => isCorrectionQueueRow(row)) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Import History"
        description={mode === "update"
          ? "Batch history and review for student update spreadsheets."
          : "Batch history and review for student add spreadsheets."}
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

      <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
        {mode === "update"
          ? "Bulk update matches by Student ID first and SR no second. Name alone is never used for automatic updates."
          : "Bulk add can generate temporary SR numbers. Use the downloaded template so class and route names match the app."}
      </div>

      <BatchUploadCard
        canManage={canManage}
        mode={mode}
        currentSessionLabel={currentSessionLabel}
        sessionOptions={sessionOptions}
        supportedFormats={data.supportedFormats}
      />

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
          Previous uploads and history
        </summary>
        <div className="border-t border-border p-4">
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

          {duplicateAuditSummary && duplicateAuditSummary.rows.length > 0 ? (
            <DuplicateAuditPanel
              batchId={selectedBatch.id}
              mode={mode}
              summary={duplicateAuditSummary}
              canManage={canManage}
            />
          ) : null}

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
