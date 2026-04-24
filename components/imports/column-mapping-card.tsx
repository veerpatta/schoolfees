"use client";

import { useState } from "react";

import { runStudentImportDryRunAction } from "@/app/protected/imports/actions";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ImportBatchDetail, ImportFieldDefinition, ImportMode } from "@/lib/import/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type ColumnMappingCardProps = {
  batch: ImportBatchDetail;
  fieldDefinitions: readonly ImportFieldDefinition[];
  canManage: boolean;
  mode: ImportMode;
};

export function ColumnMappingCard({
  batch,
  fieldDefinitions,
  canManage,
  mode,
}: ColumnMappingCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const isLocked = batch.importedRows > 0;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    try {
      await runStudentImportDryRunAction(formData);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="2. Match spreadsheet columns"
      description="The app auto-detects template columns. Open advanced mapping only when a column needs correction."
    >
      <form action={handleSubmit} className="space-y-5">
        <input type="hidden" name="batchId" value={batch.id} />
        <input type="hidden" name="importMode" value={mode} />

        <details className="rounded-xl border border-slate-200 bg-white" open={batch.status === "uploaded"}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
            Advanced column mapping
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
            {fieldDefinitions
              .filter((field) => mode === "update" || field.key !== "studentId")
              .map((field) => (
                <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <Label htmlFor={`mapping-${field.key}`} className="text-sm font-semibold text-slate-900">
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <select
                    id={`mapping-${field.key}`}
                    name={`mapping:${field.key}`}
                    defaultValue={batch.columnMapping[field.key] ?? ""}
                    disabled={!canManage || isLocked || submitting}
                    className={`${selectClassName} mt-2`}
                  >
                    <option value="">Do not map</option>
                    {batch.detectedHeaders.map((header) => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{field.description}</p>
                </div>
              ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">
            {mode === "update"
              ? "Required for update: Student ID or SR no. Blank update cells mean no change."
              : "Required for add: student name and class. Blank SR no gets a temporary SR no."}
          </p>
          <Button type="submit" disabled={!canManage || isLocked || submitting}>
            {submitting ? "Checking rows..." : "Check rows"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
