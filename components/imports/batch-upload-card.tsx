"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadStudentImportBatchAction } from "@/app/protected/imports/actions";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { SupportedImportFormat } from "@/lib/import/types";
import type { ImportMode } from "@/lib/import/types";

type BatchUploadCardProps = {
  canManage: boolean;
  mode: ImportMode;
  currentSessionLabel: string | null;
  sessionOptions: Array<{ value: string; label: string }>;
  supportedFormats: readonly SupportedImportFormat[];
};

export function BatchUploadCard({
  canManage,
  mode,
  currentSessionLabel,
  sessionOptions,
  supportedFormats,
}: BatchUploadCardProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const defaultSessionLabel = currentSessionLabel ?? sessionOptions[0]?.value ?? "";
  const templateHref = appendSessionParam(
    `/protected/imports/template?mode=${mode}&sessionLabel=${encodeURIComponent(defaultSessionLabel)}`,
    defaultSessionLabel,
  );

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    try {
      await uploadStudentImportBatchAction(formData);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="1. Upload file"
      description={mode === "update"
        ? "Upload the edited existing-students file. Blank cells mean no change."
        : "Upload the add-students file. Student name and class are enough to create a row."}
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={templateHref}>
            {mode === "update" ? "Download Existing Students for Update" : "Download Add Template"}
          </Link>
        </Button>
      }
    >
      <form ref={formRef} action={handleSubmit} encType="multipart/form-data" className="space-y-4">
        <input type="hidden" name="importMode" value={mode} />
        <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div>
            <Label htmlFor="importFile">Spreadsheet file</Label>
            <input
              id="importFile"
              name="importFile"
              type="file"
              accept=".csv,.xlsx"
              disabled={!canManage || submitting}
              className="mt-2 block w-full rounded-md border border-border px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              required
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Supported formats: {supportedFormats.map((format) => format.toUpperCase()).join(", ")}. File size limit: 10 MB.
            </p>
          </div>
          <div>
            <Label htmlFor="sessionLabel">Academic session</Label>
            <select
              id="sessionLabel"
              name="sessionLabel"
              defaultValue={defaultSessionLabel}
              disabled={!canManage || submitting}
              className="mt-2 block w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              required={mode === "add"}
            >
              <option value="">Use current session</option>
              {sessionOptions.map((sessionOption) => (
                <option key={sessionOption.value} value={sessionOption.value}>
                  {sessionOption.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              The selected session is stored with the batch and used for validation and dues generation.
            </p>
          </div>
          <Button type="submit" disabled={!canManage || submitting}>
            {submitting ? "Uploading..." : "Upload file"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
