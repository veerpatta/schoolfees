import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/helpers/date";
import type {
  ImportBatchDetail,
  ImportBatchListItem,
  ImportPageData,
  ImportRowDetail,
} from "@/lib/import/types";

import {
  commitStudentImportBatchAction,
  runStudentImportDryRunAction,
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

function BatchSummarySection({ batch }: { batch: ImportBatchDetail }) {
  return (
    <SectionCard
      title="Batch summary"
      description="Dry-run and import totals stay attached to this batch for later review."
      actions={<StatusBadge label={getStatusLabel(batch.status)} tone={getBatchTone(batch.status)} />}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total rows" value={batch.totalRows} />
        <SummaryCard
          label="Valid"
          value={batch.validRows}
          className="border-emerald-200 bg-emerald-50"
        />
        <SummaryCard
          label="Invalid"
          value={batch.invalidRows}
          className="border-red-200 bg-red-50"
        />
        <SummaryCard
          label="Duplicates"
          value={batch.duplicateRows}
          className="border-amber-200 bg-amber-50"
        />
        <SummaryCard
          label="Imported"
          value={batch.importedRows}
          className="border-blue-200 bg-blue-50"
        />
        <SummaryCard label="Failed on save" value={batch.failedRows} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">File:</span> {batch.filename}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Format:</span>{" "}
            {batch.sourceFormat.toUpperCase()}
            {batch.worksheetName ? ` | Sheet: ${batch.worksheetName}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Uploaded:</span>{" "}
            {formatShortDate(batch.createdAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Validated:</span>{" "}
            {formatShortDate(batch.validationCompletedAt)}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Imported:</span>{" "}
            {formatShortDate(batch.importCompletedAt)}
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
  const hasValidRowsToImport =
    selectedBatch !== null && selectedBatch.validRows > 0 && selectedBatch.importedRows === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Imports"
        title="Student spreadsheet import"
        description="Upload CSV/XLSX files, map incoming columns, run a dry-run, then save only valid rows into the student master."
        actions={
          canManage ? (
            <StatusBadge label="Dry-run required before save" tone="accent" />
          ) : (
            <StatusBadge label="Read-only batch review" tone="warning" />
          )
        }
      />

      {notice ? <NoticeBlock message={notice} tone="success" /> : null}
      {error ? <NoticeBlock message={error} tone="error" /> : null}

      <SectionCard
        title="1. Upload new batch"
        description="Use one CSV or XLSX file per import run. The first worksheet is used for XLSX files."
      >
        {!canManage ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            You can review import batches, but only staff with student-write access can upload,
            validate, or save rows.
          </p>
        ) : null}

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
                Supported formats: {data.supportedFormats.map((format) => format.toUpperCase()).join(", ")}.
                File size limit: 10 MB.
              </p>
            </div>
            <Button type="submit" disabled={!canManage}>
              Upload batch
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Recent batches"
        description="Each upload stays traceable with row counts, validation status, and final import outcome."
      >
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
                        <StatusBadge
                          label={getStatusLabel(batch.status)}
                          tone={getBatchTone(batch.status)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{batch.totalRows}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{batch.importedRows}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatShortDate(batch.updatedAt)}
                      </td>
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
            title="2. Map spreadsheet columns and run dry-run"
            description="Required fields must be mapped before validation. Dry-run checks classes, routes, duplicate students, DOBs, and override values without writing students."
            actions={
              <StatusBadge
                label={
                  selectedBatch.validationCompletedAt
                    ? "Validation available"
                    : "Validation pending"
                }
                tone={selectedBatch.validationCompletedAt ? "good" : "warning"}
              />
            }
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
                <p className="text-sm text-slate-600">
                  Required import fields: student name, class, and SR no / admission no.
                </p>
                <Button
                  type="submit"
                  disabled={!canManage || selectedBatch.importedRows > 0}
                >
                  Run dry-run validation
                </Button>
              </div>
            </form>
          </SectionCard>

          <BatchSummarySection batch={selectedBatch} />

          <SectionCard
            title="3. Save valid rows"
            description="Only valid rows are inserted. Duplicate and invalid rows remain attached to the batch for audit review."
            actions={
              selectedBatch.importedRows > 0 ? (
                <StatusBadge label="Batch locked after import" tone="warning" />
              ) : null
            }
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p>
                  This import only creates student master records and optional fee overrides. It
                  does not overwrite existing students and it does not touch payment history.
                </p>
              </div>

              <form action={commitStudentImportBatchAction}>
                <input type="hidden" name="batchId" value={selectedBatch.id} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Ready to import: <span className="font-semibold text-slate-900">{selectedBatch.validRows}</span>{" "}
                    valid row{selectedBatch.validRows === 1 ? "" : "s"}.
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      !canManage ||
                      !hasValidRowsToImport ||
                      selectedBatch.status === "completed" ||
                      selectedBatch.status === "importing"
                    }
                  >
                    Import valid rows only
                  </Button>
                </div>
              </form>
            </div>
          </SectionCard>

          <SectionCard
            title="4. Row-level report"
            description="Use this report to review duplicates, validation failures, and final imported rows."
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">SR no</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedBatch.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3 text-sm text-slate-700">{row.rowIndex}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.normalizedPayload?.fullName ?? getMappedDisplayValue(selectedBatch, row, "fullName")}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.normalizedPayload?.classLabel ?? getMappedDisplayValue(selectedBatch, row, "classLabel")}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.normalizedPayload?.admissionNo ?? getMappedDisplayValue(selectedBatch, row, "admissionNo")}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={getStatusLabel(row.status)}
                          tone={getRowTone(row.status)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {row.errors.length === 0 && row.warnings.length === 0 ? (
                          <span className="text-slate-500">
                            {row.status === "imported" ? "Imported successfully." : "No issues."}
                          </span>
                        ) : (
                          <div className="space-y-2">
                            {row.errors.map((issue) => (
                              <p key={`${row.id}-${issue.code}-${issue.message}`} className="text-red-700">
                                {issue.message}
                              </p>
                            ))}
                            {row.warnings.map((warning) => (
                              <p key={`${row.id}-${warning}`} className="text-amber-700">
                                {warning}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      ) : null}

      <SectionCard
        title="Supported columns"
        description="Incoming headers can be mapped manually if the spreadsheet does not already use these names."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.fieldDefinitions.map((field) => (
            <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {field.label}
                {field.required ? " *" : ""}
              </p>
              <p className="mt-1 text-xs text-slate-600">{field.aliases.join(", ")}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
