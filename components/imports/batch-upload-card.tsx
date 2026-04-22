"use client";

import { useRef, useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadStudentImportBatchAction } from "@/app/protected/imports/actions";
import type { SupportedImportFormat } from "@/lib/import/types";

type BatchUploadCardProps = {
  canManage: boolean;
  supportedFormats: readonly SupportedImportFormat[];
};

export function BatchUploadCard({ canManage, supportedFormats }: BatchUploadCardProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);

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
      title="1. Upload new batch"
      description="Use one CSV or XLSX file per run. Files stay traceable by batch and row."
    >
      <form ref={formRef} action={handleSubmit} encType="multipart/form-data" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Label htmlFor="importFile">Spreadsheet file</Label>
            <input
              id="importFile"
              name="importFile"
              type="file"
              accept=".csv,.xlsx"
              disabled={!canManage || submitting}
              className="mt-2 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              required
            />
            <p className="mt-2 text-xs text-slate-500">
              Supported formats: {supportedFormats.map((format) => format.toUpperCase()).join(", ")}. File size limit: 10 MB.
            </p>
          </div>
          <Button type="submit" disabled={!canManage || submitting}>
            {submitting ? "Uploading…" : "Upload batch"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
