"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/helpers/date";
import { updateStudentImportRowReviewAction } from "@/app/protected/imports/actions";
import type {
  ImportAnomalyCategory,
  ImportBatchDetail,
  ImportRowDetail,
} from "@/lib/import/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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

function RowReviewForm({
  row,
  batchId,
  canManage,
}: {
  row: ImportRowDetail;
  batchId: string;
  canManage: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    try {
      await updateStudentImportRowReviewAction(formData);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={row.id} />
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div>
          <Label htmlFor={`reviewStatus-${row.id}`}>Review action</Label>
          <select
            id={`reviewStatus-${row.id}`}
            name="reviewStatus"
            defaultValue={row.reviewStatus}
            disabled={!canManage || row.status === "imported" || submitting}
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
            disabled={!canManage || row.status === "imported" || submitting}
            className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            placeholder="Reason or follow-up note"
          />
        </div>
        <Button type="submit" disabled={!canManage || row.status === "imported" || submitting}>
          {submitting ? "Saving…" : "Save review"}
        </Button>
      </div>
    </form>
  );
}

function RawDataPreview({ row, batch }: { row: ImportRowDetail; batch: ImportBatchDetail }) {
  const [expanded, setExpanded] = useState(false);
  const mappingKeys = Object.keys(batch.columnMapping);

  if (mappingKeys.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-blue-700 underline"
      >
        {expanded ? "Hide raw data" : "Show raw data"}
      </button>
      {expanded ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Spreadsheet column</th>
                <th className="px-3 py-2 font-medium">Raw value</th>
                <th className="px-3 py-2 font-medium">Normalized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappingKeys.map((key) => {
                const header = batch.columnMapping[key as keyof typeof batch.columnMapping];
                const rawValue = header ? stringifyCellValue(row.rawPayload[header]) : "-";
                const normalized = row.normalizedPayload
                  ? stringifyCellValue((row.normalizedPayload as Record<string, unknown>)[key])
                  : "-";

                return (
                  <tr key={key}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-900">{key}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{header ?? "-"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{rawValue}</td>
                    <td className="px-3 py-1.5 text-slate-700">{normalized}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

type RowDetailCardProps = {
  row: ImportRowDetail;
  batch: ImportBatchDetail;
  canManage: boolean;
};

export function RowDetailCard({ row, batch, canManage }: RowDetailCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Row {row.rowIndex}: {row.normalizedPayload?.fullName ?? getMappedDisplayValue(batch, row, "fullName")}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={row.operation === "update" ? "Update existing" : "Create new"}
            tone={row.operation === "update" ? "accent" : "neutral"}
          />
          <StatusBadge label={getStatusLabel(row.status)} tone={getRowTone(row.status)} />
          <StatusBadge
            label={`Review: ${getStatusLabel(row.reviewStatus)}`}
            tone={getReviewTone(row.reviewStatus)}
          />
        </div>
      </div>

      <p className="mt-1 text-xs text-slate-600">
        Class: {row.normalizedPayload?.classLabel ?? getMappedDisplayValue(batch, row, "classLabel")} | SR no: {row.normalizedPayload?.admissionNo ?? getMappedDisplayValue(batch, row, "admissionNo")}
        {row.normalizedPayload?.dateOfBirth ? ` | DOB: ${row.normalizedPayload.dateOfBirth}` : ""}
        {row.normalizedPayload?.fatherName ? ` | Father: ${row.normalizedPayload.fatherName}` : ""}
      </p>

      {row.anomalyCategories.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.anomalyCategories.map((category) => (
            <span
              key={`${row.id}-${category}`}
              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
            >
              {CATEGORY_LABELS[category]}
            </span>
          ))}
        </div>
      ) : null}

      {row.errors.length > 0 || row.warnings.length > 0 ? (
        <div className="mt-3 space-y-1 text-sm">
          {row.errors.map((issue) => (
            <p key={`${row.id}-${issue.code}-${issue.message}`} className="text-red-700">
              ✕ {issue.message}
            </p>
          ))}
          {row.warnings.map((warning) => (
            <p key={`${row.id}-${warning}`} className="text-amber-700">
              ⚠ {cleanWarningMessage(warning)}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        {row.targetStudentId || row.duplicateStudentId ? (
          <Link href={`/protected/students/${row.targetStudentId ?? row.duplicateStudentId}/edit`} className="text-blue-700 underline">
            Review matched existing student
          </Link>
        ) : null}
        {row.importedStudentId ? (
          <Link href={`/protected/students/${row.importedStudentId}/edit`} className="text-blue-700 underline">
            Open saved student
          </Link>
        ) : null}
        {row.reviewedAt ? <span>Last reviewed: {formatShortDate(row.reviewedAt)}</span> : null}
        {row.reviewNote ? (
          <span className="italic text-slate-500">Note: {row.reviewNote}</span>
        ) : null}
      </div>

      <RawDataPreview row={row} batch={batch} />

      <div className="mt-3">
        <RowReviewForm row={row} batchId={batch.id} canManage={canManage} />
      </div>
    </div>
  );
}
