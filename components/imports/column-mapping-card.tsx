"use client";

import { useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { runStudentImportDryRunAction } from "@/app/protected/imports/actions";
import type { ImportBatchDetail, ImportFieldDefinition } from "@/lib/import/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type ColumnMappingCardProps = {
  batch: ImportBatchDetail;
  fieldDefinitions: readonly ImportFieldDefinition[];
  canManage: boolean;
};

export function ColumnMappingCard({
  batch,
  fieldDefinitions,
  canManage,
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
      title="2. Map columns and run dry-run QA"
      description="Dry-run checks duplicates, class/route mapping, DOB validity, parent details, and placeholder values without writing students."
    >
      <form action={handleSubmit} className="space-y-5">
        <input type="hidden" name="batchId" value={batch.id} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fieldDefinitions.map((field) => (
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

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-600">Required fields: student name, class, and SR no / admission no.</p>
          <Button type="submit" disabled={!canManage || isLocked || submitting}>
            {submitting ? "Running QA…" : "Run dry-run QA"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
