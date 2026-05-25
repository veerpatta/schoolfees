"use client";

import { useEffect, useMemo, useState } from "react";

import { runStudentImportDryRunAction } from "@/app/protected/imports/actions";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ImportBatchDetail, ImportFieldDefinition, ImportMode } from "@/lib/import/types";

const MAPPING_STORAGE_KEY_PREFIX = "vpps.import.mapping.";

function hashHeaders(headers: readonly string[]): string {
  const joined = [...headers].map((header) => header.trim().toLowerCase()).sort().join("|");
  let hash = 5381;
  for (let index = 0; index < joined.length; index += 1) {
    hash = ((hash << 5) + hash + joined.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function loadStoredMapping(headers: readonly string[]): Record<string, string> | null {
  if (typeof window === "undefined" || headers.length === 0) return null;
  try {
    const raw = window.localStorage.getItem(`${MAPPING_STORAGE_KEY_PREFIX}${hashHeaders(headers)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return null;
  }
}

function saveStoredMapping(headers: readonly string[], mapping: Record<string, string>): void {
  if (typeof window === "undefined" || headers.length === 0) return;
  try {
    window.localStorage.setItem(
      `${MAPPING_STORAGE_KEY_PREFIX}${hashHeaders(headers)}`,
      JSON.stringify(mapping),
    );
  } catch {
    // Ignore quota/serialize errors — auto-fill is best-effort.
  }
}

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
  const requiredFields = fieldDefinitions.filter(
    (field) => field.required && (mode === "update" || field.key !== "studentId"),
  );
  const headerSet = useMemo(() => new Set(batch.detectedHeaders), [batch.detectedHeaders]);

  // Merge persisted-from-prior-import mapping into the form's initial values
  // only for fields the current batch hasn't mapped yet AND where the stored
  // column still exists in this file's headers.
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { ...(batch.columnMapping as Record<string, string>) };
    if (!isLocked && typeof window !== "undefined") {
      const stored = loadStoredMapping(batch.detectedHeaders);
      if (stored) {
        for (const [key, value] of Object.entries(stored)) {
          if (!initial[key] && headerSet.has(value)) {
            initial[key] = value;
          }
        }
      }
    }
    return initial;
  });

  const [autoFilledFromMemory, setAutoFilledFromMemory] = useState(false);

  useEffect(() => {
    if (isLocked) return;
    const stored = loadStoredMapping(batch.detectedHeaders);
    if (!stored) return;
    const currentMapping = batch.columnMapping as Record<string, string>;
    const applied = Object.entries(stored).some(
      ([key, value]) =>
        typeof value === "string" && headerSet.has(value) && !currentMapping[key],
    );
    setAutoFilledFromMemory(applied);
  }, [isLocked, batch.columnMapping, batch.detectedHeaders, headerSet]);

  const hasRequiredMappingGap = requiredFields.some((field) => !mapping[field.key]);

  function updateMapping(key: string, value: string) {
    setMapping((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    try {
      await runStudentImportDryRunAction(formData);
      // Persist this mapping for future imports with the same headers.
      saveStoredMapping(batch.detectedHeaders, mapping);
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

        {autoFilledFromMemory ? (
          <p className="rounded-lg border border-info-soft bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
            Auto-filled from your last import with the same column headers. Review before continuing.
          </p>
        ) : null}

        <details className="rounded-xl border border-border bg-card" open={hasRequiredMappingGap}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
            Advanced column mapping
          </summary>
          <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-3">
            {fieldDefinitions
              .filter((field) => mode === "update" || field.key !== "studentId")
              .map((field) => (
                <div key={field.key} className="rounded-xl border border-border bg-surface-2 p-4">
                  <Label htmlFor={`mapping-${field.key}`} className="text-sm font-semibold text-foreground">
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <select
                    id={`mapping-${field.key}`}
                    name={`mapping:${field.key}`}
                    value={mapping[field.key] ?? ""}
                    onChange={(event) => updateMapping(field.key, event.target.value)}
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
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{field.description}</p>
                </div>
              ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {mode === "update"
              ? "Required for update: Student ID or SR no. Blank update cells mean no change."
              : "Required for add: student name and class. Blank SR no gets a temporary SR no."}
          </p>
          <Button type="submit" disabled={!canManage || isLocked || submitting}>
            {submitting ? "Checking rows..." : "Re-check rows"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
