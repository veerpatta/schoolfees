import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/helpers/date";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportBatchListItem,
  ImportPageData,
  ImportRowDetail,
} from "@/lib/import/types";

import {
  commitStudentImportBatchAction,
  runStudentImportDryRunAction,
  updateStudentImportRowReviewAction,
  uploadStudentImportBatchAction,
} from "@/app/protected/imports/actions";

type StudentImportWorkflowProps = {
  data: ImportPageData;
  canManage: boolean;
  notice: string | null;
  error: string | null;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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

function getRowTone(status: ImportRowDetail["status"]) {
  switch (status) {
    case "imported":
    case "valid":
      return "good" as const;
    case "duplicate":
    case "skipped":
      return "warning" as const;
    case "invalid":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function getReviewTone(status: ImportRowDetail["reviewStatus"]) {
  switch (status) {
    case "approved":
      return "good" as const;
    case "hold":
    case "skipped":
      return "warning" as const;
    default:
      return "accent" as const;
  }
}

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stringifyCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function getMappedDisplayValue(batch: ImportBatchDetail, row: ImportRowDetail, key: string) {
  const header = batch.columnMapping[key as keyof typeof batch.columnMapping];

  if (!header) {
    return "-";
  }

  return stringifyCellValue(row.rawPayload[header]);
}

function cleanWarningMessage(value: string) {
  const dividerIndex = value.indexOf(":");

  if (dividerIndex === -1) {
    return value;
  }

  return value.slice(dividerIndex + 1).trim();
}

function categoryLabel(category: ImportAnomalyCategory) {
  switch (category) {
    case "missing-admission-no":
      return "Missing SR / admission no";
    case "invalid-dob":
      return "Invalid DOB";
    case "duplicate-admission-no":
      return "Duplicate by SR no";
    case "duplicate-name-class-dob":
      return "Duplicate by name + class + DOB";
    case "unmapped-class":
      return "Unmapped class";
    case "unmapped-route":
      return "Unmapped route";
    case "missing-parent-fields":
      return "Missing parent fields";
    case "placeholder-values":
      return "Placeholder values";
    default:
      return "Anomaly";
  }
}

function hasCategory(row: ImportRowDetail, categories: readonly ImportAnomalyCategory[]) {
  return categories.some((category) => row.anomalyCategories.includes(category));
}

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

function RowReviewForm({
  row,
  batchId,
  canManage,
}: {
  row: ImportRowDetail;
  batchId: string;
  canManage: boolean;
}) {
  return (
    <form action={updateStudentImportRowReviewAction} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={row.id} />
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div>
          <Label htmlFor={`reviewStatus-${row.id}`}>Review action</Label>
          <select
            id={`reviewStatus-${row.id}`}
            name="reviewStatus"
            defaultValue={row.reviewStatus}
            disabled={!canManage || row.status === "imported"}
            className={`${selectClassName} mt-1`}
          >
            <option value="pending">Keep pending</option>
            <option value="approved" disabled={row.status !== "valid"}>
              Approve for import
            </option>
            <option value="hold">Put on hold</option>
            <option value="skipped">Skip from this batch</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`reviewNote-${row.id}`}>Office note</Label>
          <input
            id={`reviewNote-${row.id}`}
            name="reviewNote"
            defaultValue={row.reviewNote ?? ""}
            disabled={!canManage || row.status === "imported"}
            className="mt-1 block h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            placeholder="Reason or follow-up note"
          />
        </div>
        <Button type="submit" disabled={!canManage || row.status === "imported"}>
          Save review
        </Button>
      </div>
    </form>
  );
}

function QueueTable({
  title,
  description,
  rows,
  batch,
  canManage,
}: {
  title: string;
  description: string;
  rows: ImportRowDetail[];
  batch: ImportBatchDetail;
  canManage: boolean;
}) {
  return (
    <SectionCard title={title} description={description}>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          No rows in this queue.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Row {row.rowIndex}: {row.normalizedPayload?.fullName ?? getMappedDisplayValue(batch, row, "fullName")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={getStatusLabel(row.status)} tone={getRowTone(row.status)} />
                  <StatusBadge
                    label={`Review: ${getStatusLabel(row.reviewStatus)}`}
                    tone={getReviewTone(row.reviewStatus)}
                  />
                </div>
              </div>

              <p className="mt-1 text-xs text-slate-600">
                Class: {row.normalizedPayload?.classLabel ?? getMappedDisplayValue(batch, row, "classLabel")} | SR no: {row.normalizedPayload?.admissionNo ?? getMappedDisplayValue(batch, row, "admissionNo")}
              </p>

              {row.anomalyCategories.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.anomalyCategories.map((category) => (
                    <span
                      key={`${row.id}-${category}`}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
                    >
                      {categoryLabel(category)}
                    </span>
                  ))}
                </div>
              ) : null}

              {row.errors.length > 0 || row.warnings.length > 0 ? (
                <div className="mt-3 space-y-1 text-sm">
                  {row.errors.map((issue) => (
                    <p key={`${row.id}-${issue.code}-${issue.message}`} className="text-red-700">
                      {issue.message}
                    </p>
                  ))}
                  {row.warnings.map((warning) => (
                    <p key={`${row.id}-${warning}`} className="text-amber-700">
                      {cleanWarningMessage(warning)}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                {row.duplicateStudentId ? (
                  <Link href={`/protected/students/${row.duplicateStudentId}/edit`} className="text-blue-700 underline">
                    Review matched existing student
                  </Link>
                ) : null}
                {row.importedStudentId ? (
                  <Link href={`/protected/students/${row.importedStudentId}/edit`} className="text-blue-700 underline">
                    Open imported student for edits
                  </Link>
                ) : null}
                {row.reviewedAt ? <span>Last reviewed: {formatShortDate(row.reviewedAt)}</span> : null}
              </div>

              <div className="mt-3">
                <RowReviewForm row={row} batchId={batch.id} canManage={canManage} />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function BatchSummarySection({ batch }: { batch: ImportBatchDetail }) {
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

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Approved for import" value={batch.reviewSummary.approvedRows} className="border-emerald-200 bg-emerald-50" />
        <SummaryCard label="Pending review" value={batch.reviewSummary.pendingRows} className="border-amber-200 bg-amber-50" />
        <SummaryCard label="On hold" value={batch.reviewSummary.heldRows} />
        <SummaryCard label="Skipped" value={batch.reviewSummary.skippedRows} />
        <SummaryCard label="Unresolved anomalies" value={batch.reviewSummary.unresolvedAnomalyRows} className="border-red-200 bg-red-50" />
      </div>

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

export function StudentImportWorkflow({
  data,
  canManage,
  notice,
  error,
}: StudentImportWorkflowProps) {
  const selectedBatch = data.selectedBatch;
  const approvedRows = selectedBatch?.rows.filter(
    (row) => row.status === "valid" && row.reviewStatus === "approved",
  ) ?? [];
  const hasApprovedRowsToImport = selectedBatch !== null && approvedRows.length > 0;

  const unresolvedQueue =
    selectedBatch?.rows.filter(
      (row) =>
        row.status !== "imported" &&
        row.reviewStatus !== "skipped" &&
        (row.reviewStatus !== "approved" || row.anomalyCategories.length > 0),
    ) ?? [];

  const duplicateQueue = unresolvedQueue.filter((row) =>
    hasCategory(row, ["duplicate-admission-no", "duplicate-name-class-dob"]),
  );

  const mappingQueue = unresolvedQueue.filter((row) =>
    hasCategory(row, ["unmapped-class", "unmapped-route"]),
  );

  const dobParentQueue = unresolvedQueue.filter((row) =>
    hasCategory(row, ["invalid-dob", "missing-parent-fields"]),
  );

  const placeholderQueue = unresolvedQueue.filter((row) =>
    hasCategory(row, ["placeholder-values"]),
  );

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

      <SectionCard
        title="1. Upload new batch"
        description="Use one CSV or XLSX file per run. Files stay traceable by batch and row."
      >
        <form action={uploadStudentImportBatchAction} encType="multipart/form-data" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Label htmlFor="importFile">Spreadsheet file</Label>
              <input
                id="importFile"
                name="importFile"
                type="file"
                accept=".csv,.xlsx"
                disabled={!canManage}
                className="mt-2 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                required
              />
              <p className="mt-2 text-xs text-slate-500">
                Supported formats: {data.supportedFormats.map((format) => format.toUpperCase()).join(", ")}. File size limit: 10 MB.
              </p>
            </div>
            <Button type="submit" disabled={!canManage}>
              Upload batch
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Import dashboard" description="Batch history with import and QA review progress.">
        {data.recentBatches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            No import batches yet. Upload the first spreadsheet to begin staged migration.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Imported</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.recentBatches.map((batch) => {
                  const isSelected = selectedBatch?.id === batch.id;

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
                      <td className="px-4 py-3 text-sm text-slate-700">{batch.importedRows}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{formatShortDate(batch.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant={isSelected ? "secondary" : "outline"} size="sm" asChild>
                          <Link href={`/protected/imports?batchId=${batch.id}`}>Open</Link>
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

      {selectedBatch ? (
        <>
          <SectionCard
            title="2. Map columns and run dry-run QA"
            description="Dry-run checks duplicates, class/route mapping, DOB validity, parent details, and placeholder values without writing students."
          >
            <form action={runStudentImportDryRunAction} className="space-y-5">
              <input type="hidden" name="batchId" value={selectedBatch.id} />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.fieldDefinitions.map((field) => (
                  <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <Label htmlFor={`mapping-${field.key}`} className="text-sm font-semibold text-slate-900">
                      {field.label}
                      {field.required ? " *" : ""}
                    </Label>
                    <select
                      id={`mapping-${field.key}`}
                      name={`mapping:${field.key}`}
                      defaultValue={selectedBatch.columnMapping[field.key] ?? ""}
                      disabled={!canManage || selectedBatch.importedRows > 0}
                      className={`${selectClassName} mt-2`}
                    >
                      <option value="">Do not map</option>
                      {selectedBatch.detectedHeaders.map((header) => (
                        <option key={`${field.key}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{field.description}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">Required fields: student name, class, and SR no / admission no.</p>
                <Button type="submit" disabled={!canManage || selectedBatch.importedRows > 0}>
                  Run dry-run QA
                </Button>
              </div>
            </form>
          </SectionCard>

          <BatchSummarySection batch={selectedBatch} />

          <QueueTable
            title="3. Unresolved anomalies queue"
            description="Office staff should clear, hold, or skip each anomaly row before go-live."
            rows={unresolvedQueue}
            batch={selectedBatch}
            canManage={canManage}
          />

          <QueueTable
            title="4. Duplicate review queue"
            description="Review SR and identity duplicates, then hold/skip or approve valid non-risk rows."
            rows={duplicateQueue}
            batch={selectedBatch}
            canManage={canManage}
          />

          <QueueTable
            title="5. Missing class/route mapping review"
            description="Map spreadsheet labels to existing classes/routes in master data, then rerun dry-run to refresh this queue."
            rows={mappingQueue}
            batch={selectedBatch}
            canManage={canManage}
          />

          <QueueTable
            title="6. Invalid DOB / missing parent field review"
            description="Fix DOB and parent details through source correction, then rerun dry-run. Warnings can be approved with office notes if acceptable."
            rows={dobParentQueue}
            batch={selectedBatch}
            canManage={canManage}
          />

          <QueueTable
            title="7. Placeholder-value detection review"
            description="Rows with values like XYZ, None, or other placeholders must be reviewed before approval."
            rows={placeholderQueue}
            batch={selectedBatch}
            canManage={canManage}
          />

          <SectionCard
            title="8. Final approved import summary"
            description="Only approved valid rows are imported. Pending, held, duplicate, and skipped rows remain in the batch trail."
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Approved rows ready now: <span className="font-semibold text-slate-900">{approvedRows.length}</span>
              </div>
              <form action={commitStudentImportBatchAction}>
                <input type="hidden" name="batchId" value={selectedBatch.id} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Import runs only for reviewed approved rows. This keeps risky rows pending for manual follow-up.
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      !canManage ||
                      !hasApprovedRowsToImport ||
                      selectedBatch.status === "completed" ||
                      selectedBatch.status === "importing"
                    }
                  >
                    Import approved rows
                  </Button>
                </div>
              </form>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
