"use client";

import { useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { recordDuplicateAuditDecisionAction } from "@/app/protected/imports/actions";
import type {
  DuplicateAuditDecision,
  DuplicateAuditMatchKind,
  DuplicateAuditRow,
  DuplicateAuditSummary,
  ImportMode,
} from "@/lib/import/types";

type DuplicateAuditPanelProps = {
  batchId: string;
  mode: ImportMode;
  summary: DuplicateAuditSummary;
  canManage: boolean;
};

function matchKindLabel(kind: DuplicateAuditMatchKind) {
  return kind === "name_father"
    ? "Name + father match"
    : "Phone number match";
}

function decisionLabel(decision: DuplicateAuditDecision | null) {
  if (decision === "proceed_new") return "Proceed as new";
  if (decision === "mark_duplicate") return "Skip — duplicate of existing";
  if (decision === "mark_update") return "Update existing student";
  return null;
}

function RowChoice({
  batchId,
  mode,
  row,
  canManage,
  busy,
  onSubmit,
}: {
  batchId: string;
  mode: ImportMode;
  row: DuplicateAuditRow;
  canManage: boolean;
  busy: boolean;
  onSubmit: (formData: FormData) => Promise<void> | void;
}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState(
    row.decisionTargetStudentId ?? row.candidates[0]?.studentId ?? "",
  );

  return (
    <li className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-foreground">
            Row {row.rowIndex}: {row.fullName || "(unnamed)"}
          </p>
          <p className="text-xs text-muted-foreground">
            Class {row.classLabel || "?"} · SR {row.admissionNo || "(blank)"}
            {row.fatherName ? ` · Father: ${row.fatherName}` : ""}
            {row.primaryPhone ? ` · Phone: ${row.primaryPhone}` : ""}
            {row.secondaryPhone ? ` · Alt: ${row.secondaryPhone}` : ""}
          </p>
        </div>
        {row.decision ? (
          <span className="rounded-full border border-success-strong/30 bg-success-soft px-2 py-1 text-xs font-medium text-success-soft-foreground">
            {decisionLabel(row.decision)}
          </span>
        ) : (
          <span className="rounded-full border border-warning-strong/30 bg-warning-soft px-2 py-1 text-xs font-medium text-warning-soft-foreground">
            Awaiting decision
          </span>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Matched existing students</p>
        <ul className="space-y-1">
          {row.candidates.map((candidate) => (
            <li key={candidate.studentId} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`audit-target-${row.rowId}`}
                  value={candidate.studentId}
                  checked={selectedCandidateId === candidate.studentId}
                  onChange={(event) => setSelectedCandidateId(event.target.value)}
                  disabled={!canManage}
                  className="accent-primary"
                />
                <span className="text-foreground">
                  {candidate.fullName} · Class {candidate.classLabel || "?"} · SR {candidate.admissionNo}
                </span>
              </label>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {candidate.matchKinds.map(matchKindLabel).join(" + ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          action={onSubmit}
          className="contents"
        >
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="rowId" value={row.rowId} />
          <input type="hidden" name="importMode" value={mode} />
          <input type="hidden" name="decision" value="mark_update" />
          <input type="hidden" name="targetStudentId" value={selectedCandidateId} />
          <Button
            type="submit"
            size="sm"
            disabled={!canManage || busy || !selectedCandidateId}
          >
            Mark as update
          </Button>
        </form>

        <form action={onSubmit} className="contents">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="rowId" value={row.rowId} />
          <input type="hidden" name="importMode" value={mode} />
          <input type="hidden" name="decision" value="mark_duplicate" />
          <Button type="submit" size="sm" variant="outline" disabled={!canManage || busy}>
            Mark as duplicate (skip)
          </Button>
        </form>

        <form action={onSubmit} className="contents">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="rowId" value={row.rowId} />
          <input type="hidden" name="importMode" value={mode} />
          <input type="hidden" name="decision" value="proceed_new" />
          <Button type="submit" size="sm" variant="ghost" disabled={!canManage || busy}>
            Proceed as new
          </Button>
        </form>

        {row.decision ? (
          <form action={onSubmit} className="contents">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="rowId" value={row.rowId} />
            <input type="hidden" name="importMode" value={mode} />
            <input type="hidden" name="decision" value="clear" />
            <Button type="submit" size="sm" variant="ghost" disabled={!canManage || busy}>
              Reset decision
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}

export function DuplicateAuditPanel({
  batchId,
  mode,
  summary,
  canManage,
}: DuplicateAuditPanelProps) {
  const [busy, setBusy] = useState(false);
  const [showDecided, setShowDecided] = useState(false);

  if (summary.rows.length === 0) {
    return null;
  }

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    try {
      await recordDuplicateAuditDecisionAction(formData);
    } finally {
      setBusy(false);
    }
  }

  const pendingRows = summary.rows.filter((row) => row.decision === null);
  const decidedRows = summary.rows.filter((row) => row.decision !== null);
  const visibleRows = showDecided ? summary.rows : pendingRows;

  return (
    <SectionCard
      title="2.5 Pre-import duplicate audit"
      description={
        mode === "update"
          ? "Update mode already matches by Student ID / SR. This audit is informational only."
          : "These rows look like existing students. Choose how each one should be handled before importing."
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          {summary.pendingCount > 0
            ? `${summary.pendingCount} row${summary.pendingCount === 1 ? "" : "s"} need a decision. Decided: ${summary.decidedCount}.`
            : `All ${summary.decidedCount} flagged row${summary.decidedCount === 1 ? "" : "s"} ${summary.decidedCount === 1 ? "has" : "have"} a decision.`}
        </div>

        {decidedRows.length > 0 ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowDecided((value) => !value)}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              {showDecided ? "Hide decided rows" : `Show ${decidedRows.length} decided row${decidedRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}

        <ul className="space-y-3">
          {visibleRows.map((row) => (
            <RowChoice
              key={row.rowId}
              batchId={batchId}
              mode={mode}
              row={row}
              canManage={canManage}
              busy={busy}
              onSubmit={handleSubmit}
            />
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}
