"use client";

import { useMemo, useRef, useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import {
  PAYMENT_IMPORT_COMMIT_CHUNK_SIZE,
  type PaymentImportBatchSummary,
  type PaymentImportRowView,
} from "@/lib/payments/bulk/types";
import { cn } from "@/lib/utils";

type Phase = "upload" | "review" | "committing" | "done";

const STATUS_BADGE: Record<PaymentImportRowView["validationStatus"], string> = {
  valid: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  error: "bg-destructive-soft text-destructive-soft-foreground",
  pending: "bg-surface-2 text-muted-foreground",
};

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export function BulkPaymentWorkflow({ sessionLabel }: { sessionLabel: string }) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [summary, setSummary] = useState<PaymentImportBatchSummary | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const postableRows = useMemo(() => {
    if (!summary) return [];
    return summary.rows.filter(
      (row) =>
        !row.postedAt &&
        (row.validationStatus === "valid" ||
          (row.validationStatus === "warning" &&
            (row.duplicateAcknowledged || acknowledgedIds.has(row.id)))),
    );
  }, [summary, acknowledgedIds]);

  const blockedWarnings = useMemo(() => {
    if (!summary) return 0;
    return summary.rows.filter(
      (row) =>
        !row.postedAt &&
        row.validationStatus === "warning" &&
        !row.duplicateAcknowledged &&
        !acknowledgedIds.has(row.id),
    ).length;
  }, [summary, acknowledgedIds]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("importFile", file);
      formData.set("sessionLabel", sessionLabel);
      const response = await fetch("/api/imports/payments/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        summary?: PaymentImportBatchSummary;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? "Upload failed.");
      }
      setSummary(payload.summary);
      setAcknowledgedIds(new Set());
      setPhase("review");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!summary || postableRows.length === 0) return;
    setPhase("committing");
    setError(null);
    const ids = postableRows.map((row) => row.id);
    const acknowledged = [
      ...new Set(
        postableRows
          .filter((row) => row.validationStatus === "warning")
          .map((row) => row.id),
      ),
    ];
    const chunks = chunkIds(ids, PAYMENT_IMPORT_COMMIT_CHUNK_SIZE);
    setProgress({ done: 0, total: ids.length });

    let latestSummary: PaymentImportBatchSummary | null = summary;
    try {
      for (const chunk of chunks) {
        const response = await fetch(`/api/imports/payments/batch/${summary.batchId}/commit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowIds: chunk, acknowledgedRowIds: acknowledged }),
        });
        const payload = (await response.json()) as {
          summary?: PaymentImportBatchSummary;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Posting failed part-way. Re-open the batch to resume.");
        }
        if (payload.summary) {
          latestSummary = payload.summary;
          setSummary(payload.summary);
        }
        setProgress((previous) => ({ ...previous, done: previous.done + chunk.length }));
      }
      setPhase("done");
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : "Posting failed part-way. Already-posted rows are safe; retry to resume.",
      );
      setSummary(latestSummary);
      setPhase("review");
    }
  }

  function toggleAcknowledged(rowId: string) {
    setAcknowledgedIds((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  const postedRows = summary?.rows.filter((row) => row.postedAt) ?? [];
  const postedTotal = postedRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive-soft-foreground"
        >
          {error}
        </p>
      ) : null}

      {phase === "upload" ? (
        <SectionCard
          title="1. Upload the filled template"
          description={`Columns: SR no, Amount, Payment date, Payment mode, Remarks. Max 200 rows. Session: ${sessionLabel}.`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <Button type="button" disabled={uploading} onClick={handleUpload}>
              {uploading ? "Validating..." : "Upload & validate"}
            </Button>
            <a
              href="/protected/payments/bulk/template"
              download
              className="text-sm font-medium text-info-soft-foreground underline-offset-4 hover:underline"
            >
              Download template
            </a>
          </div>
        </SectionCard>
      ) : null}

      {summary && phase !== "upload" ? (
        <SectionCard
          title={`2. Review — ${summary.fileName}`}
          description="Nothing has been posted yet unless a row shows a receipt number. Fix errors in the file and re-upload, or confirm flagged rows below."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryTile label="Rows" value={summary.totalRows} />
            <SummaryTile label="Ready" value={summary.validRows} tone="success" />
            <SummaryTile label="Need confirmation" value={summary.warningRows} tone="warning" />
            <SummaryTile label="Errors" value={summary.errorRows} tone="danger" />
            <SummaryTile label="Posted" value={summary.postedRows} tone="success" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">SR no</th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 text-muted-foreground">{row.rowNumber}</td>
                    <td className="py-2 pr-3">{row.admissionNo ?? "—"}</td>
                    <td className="py-2 pr-3">{row.studentName ?? "—"}</td>
                    <td className="py-2 pr-3">{row.amount !== null ? formatInr(row.amount) : "—"}</td>
                    <td className="py-2 pr-3">{row.paymentDate ?? "—"}</td>
                    <td className="py-2 pr-3">{row.paymentMode ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          row.postedAt
                            ? STATUS_BADGE.valid
                            : STATUS_BADGE[row.validationStatus],
                        )}
                      >
                        {row.postedAt ? "Posted" : row.validationStatus}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {row.postedAt && row.receiptNumber ? (
                        <span className="font-medium text-success-soft-foreground">
                          Receipt {row.receiptNumber}
                        </span>
                      ) : null}
                      {row.postError ? (
                        <span className="block text-destructive">{row.postError}</span>
                      ) : null}
                      {row.validationMessages.map((message) => (
                        <span key={message} className="block">
                          {message}
                        </span>
                      ))}
                      {!row.postedAt && row.validationStatus === "warning" ? (
                        <label className="mt-1 flex items-center gap-2 text-foreground">
                          <input
                            type="checkbox"
                            className="size-3.5 accent-destructive"
                            checked={row.duplicateAcknowledged || acknowledgedIds.has(row.id)}
                            disabled={row.duplicateAcknowledged || phase === "committing"}
                            onChange={() => toggleAcknowledged(row.id)}
                          />
                          Confirmed — separate payment
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {phase === "committing"
                ? `Posting ${progress.done}/${progress.total}...`
                : `${postableRows.length} row${postableRows.length === 1 ? "" : "s"} ready to post` +
                  (blockedWarnings > 0
                    ? ` · ${blockedWarnings} flagged row${blockedWarnings === 1 ? "" : "s"} awaiting confirmation`
                    : "")}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={phase === "committing"}
                onClick={() => {
                  setPhase("upload");
                  setSummary(null);
                  setAcknowledgedIds(new Set());
                  setError(null);
                }}
              >
                Start over
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={phase === "committing" || postableRows.length === 0}
                onClick={handleCommit}
              >
                {phase === "committing"
                  ? "Posting..."
                  : `Post ${postableRows.length} payment${postableRows.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {phase === "done" && summary ? (
        <SectionCard title="3. Done" description="Posted receipts are live in Transactions and Receipts.">
          <p className="text-sm text-foreground">
            Posted <span className="font-semibold">{postedRows.length}</span> payment
            {postedRows.length === 1 ? "" : "s"} totalling{" "}
            <span className="font-semibold">{formatInr(postedTotal)}</span>. Rows that could not
            post keep their error above — fix and re-post, or handle them at the Payment Desk.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold text-foreground",
          tone === "success" && value > 0 && "text-success-soft-foreground",
          tone === "warning" && value > 0 && "text-warning-soft-foreground",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
