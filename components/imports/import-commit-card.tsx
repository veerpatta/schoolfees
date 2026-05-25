"use client";

import { useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { approveAllSafeRowsAction } from "@/app/protected/imports/actions";
import { commitStudentImportBatchAction } from "@/app/protected/imports/actions";
import { resumeStudentImportBatchAction } from "@/app/protected/imports/actions";
import type { ImportBatchDetail, ImportMode } from "@/lib/import/types";

type ImportCommitCardProps = {
  batch: ImportBatchDetail;
  canManage: boolean;
  mode: ImportMode;
};

export function ImportCommitCard({ batch, canManage, mode }: ImportCommitCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [approvingSafeRows, setApprovingSafeRows] = useState(false);
  const hasApprovedRows = batch.reviewSummary.readyToImportRows > 0;
  const isLocked = batch.status === "completed" || batch.status === "importing";
  const approvedCreates = batch.reviewSummary.readyCreateRows;
  const approvedUpdates = batch.reviewSummary.readyUpdateRows;
  const safePendingRows = Math.max(0, batch.reviewSummary.pendingSafeRows);
  const failedRowCount = Math.max(0, batch.failedRows);
  const canResume =
    batch.status === "failed" && failedRowCount > 0 && batch.importedRows > 0;
  const firstFailedRowIndex = canResume
    ? batch.rows.find(
        (row) => row.status === "invalid" && row.reviewStatus === "pending",
      )?.rowIndex ?? null
    : null;

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

  async function handleResume(formData: FormData) {
    setResuming(true);

    try {
      await resumeStudentImportBatchAction(formData);
    } finally {
      setResuming(false);
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
          <div className="rounded-xl border bg-success-soft px-4 py-3 text-center">
            <p className="text-sm font-medium text-success-soft-foreground">Ready to import</p>
            <p className="mt-1 text-2xl font-semibold text-success-soft-foreground">{batch.reviewSummary.readyToImportRows}</p>
          </div>
          <div className="rounded-xl border bg-warning-soft px-4 py-3 text-center">
            <p className="text-sm font-medium text-warning-soft-foreground">Pending decisions</p>
            <p className="mt-1 text-2xl font-semibold text-warning-soft-foreground">{batch.reviewSummary.pendingRows}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-center">
            <p className="text-sm font-medium text-muted-foreground">Already imported</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{batch.importedRows}</p>
          </div>
        </div>

        {safePendingRows > 0 && !isLocked ? (
          <form action={handleApproveSafeRows} className="rounded-xl border bg-info-soft px-4 py-3">
            <input type="hidden" name="batchId" value={batch.id} />
            <input type="hidden" name="importMode" value={mode} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-info-soft-foreground">
                {safePendingRows} valid row{safePendingRows === 1 ? " is" : "s are"} pending. Approve all safe rows in one click.
              </p>
              <Button type="submit" size="sm" variant="outline" disabled={!canManage || approvingSafeRows}>
                {approvingSafeRows ? "Approving..." : "Approve all safe rows"}
              </Button>
            </div>
          </form>
        ) : null}

        {canResume ? (
          <form action={handleResume} className="rounded-xl border bg-warning-soft px-4 py-3">
            <input type="hidden" name="batchId" value={batch.id} />
            <input type="hidden" name="importMode" value={mode} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 text-sm text-warning-soft-foreground">
                <p className="font-semibold">
                  Last import stopped after {batch.importedRows} of {batch.totalRows} row{batch.totalRows === 1 ? "" : "s"}.
                </p>
                <p>
                  {failedRowCount} row{failedRowCount === 1 ? "" : "s"} failed at the save step
                  {firstFailedRowIndex !== null ? ` (starting at row ${firstFailedRowIndex})` : ""}.
                  Resume retries them; already-imported rows are skipped.
                </p>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={!canManage || resuming}>
                {resuming
                  ? "Resuming..."
                  : firstFailedRowIndex !== null
                    ? `Resume from row ${firstFailedRowIndex}`
                    : "Resume failed import"}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold text-foreground">What happens when you import:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>{approvedCreates} row{approvedCreates === 1 ? "" : "s"} will create new student records</li>
            <li>{approvedUpdates} row{approvedUpdates === 1 ? "" : "s"} will update existing students by Student ID or SR no</li>
            <li>Each imported student gets a permanent record linked back to this batch</li>
            <li>Blank optional cells in update rows leave existing values unchanged</li>
            <li>Class, route, or fee-profile changes prepare dues for affected students</li>
            <li>Unapproved rows (pending, held, skipped) stay in Rows needing correction for follow-up</li>
            <li>You can edit imported students afterwards through the student edit page</li>
          </ul>
        </div>

        <form action={handleSubmit}>
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="importMode" value={mode} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isLocked
                ? batch.status === "completed"
                  ? "Students imported. Unresolved rows remain available for follow-up."
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
                  ? "Students imported"
                  : "Import valid students"}
            </Button>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
