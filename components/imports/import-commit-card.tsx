"use client";

import { useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { approveAllSafeRowsAction } from "@/app/protected/imports/actions";
import { commitStudentImportBatchAction } from "@/app/protected/imports/actions";
import type { ImportBatchDetail, ImportMode } from "@/lib/import/types";

type ImportCommitCardProps = {
  batch: ImportBatchDetail;
  canManage: boolean;
  mode: ImportMode;
};

export function ImportCommitCard({ batch, canManage, mode }: ImportCommitCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [approvingSafeRows, setApprovingSafeRows] = useState(false);
  const hasApprovedRows = batch.reviewSummary.readyToImportRows > 0;
  const isLocked = batch.status === "completed" || batch.status === "importing";
  const approvedCreates = batch.reviewSummary.readyCreateRows;
  const approvedUpdates = batch.reviewSummary.readyUpdateRows;
  const safePendingRows = Math.max(0, batch.reviewSummary.pendingSafeRows);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);

    try {
      await commitStudentImportBatchAction(formData);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApproveSafeRows(formData: FormData) {
    setApprovingSafeRows(true);

    try {
      await approveAllSafeRowsAction(formData);
    } finally {
      setApprovingSafeRows(false);
    }
  }

  return (
    <SectionCard
      title="4. Import valid students"
      description={mode === "update"
        ? "Only approved valid rows update existing students. Blank cells are treated as no change."
        : "Only approved valid rows create new students. Problem rows remain available for correction."}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
            <p className="text-sm font-medium text-emerald-700">Ready to import</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{batch.reviewSummary.readyToImportRows}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="text-sm font-medium text-amber-700">Pending decisions</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{batch.reviewSummary.pendingRows}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
            <p className="text-sm font-medium text-slate-600">Already imported</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{batch.importedRows}</p>
          </div>
        </div>

        {safePendingRows > 0 && !isLocked ? (
          <form action={handleApproveSafeRows} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <input type="hidden" name="batchId" value={batch.id} />
            <input type="hidden" name="importMode" value={mode} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-blue-900">
                {safePendingRows} valid row{safePendingRows === 1 ? " is" : "s are"} pending. Approve all safe rows in one click.
              </p>
              <Button type="submit" size="sm" variant="outline" disabled={!canManage || approvingSafeRows}>
                {approvingSafeRows ? "Approving..." : "Approve all safe rows"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">What happens when you import:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
            <li>{approvedCreates} row{approvedCreates === 1 ? "" : "s"} will create new student records</li>
            <li>{approvedUpdates} row{approvedUpdates === 1 ? "" : "s"} will update existing students by Student ID or SR no</li>
            <li>Each imported student gets a permanent record linked back to this batch</li>
            <li>Blank optional cells in update rows leave existing values unchanged</li>
            <li>Class, route, or fee-profile changes trigger scoped dues regeneration for affected students</li>
            <li>Unapproved rows (pending, held, skipped) stay in Rows needing correction for follow-up</li>
            <li>You can edit imported students afterwards through the student edit page</li>
          </ul>
        </div>

        <form action={handleSubmit}>
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="importMode" value={mode} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {isLocked
                ? batch.status === "completed"
                  ? "This batch is complete. Unresolved rows remain available for follow-up."
                  : "Import is in progress..."
                : "Import runs only for reviewed approved rows. This keeps risky rows pending for manual follow-up."}
            </p>
            <Button
              type="submit"
              disabled={!canManage || !hasApprovedRows || isLocked || submitting}
            >
              {submitting
                ? "Importing..."
                : isLocked
                  ? "Import complete"
                  : "Import valid students"}
            </Button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
