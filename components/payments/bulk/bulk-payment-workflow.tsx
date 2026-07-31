"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Link2, RotateCcw, ShieldCheck } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatInr } from "@/lib/helpers/currency";
import {
  PAYMENT_IMPORT_COMMIT_CHUNK_SIZE,
  type PaymentImportBatchSummary,
  type PaymentImportRowView,
} from "@/lib/payments/bulk/types";
import { cn } from "@/lib/utils";

type Phase = "upload" | "loading" | "review" | "committing" | "done";

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

function isRowReady(
  row: PaymentImportRowView,
  acknowledgedIds: ReadonlySet<string>,
) {
  if (row.postedAt) return false;
  if (row.validationStatus === "valid") return true;
  return (
    row.validationStatus === "warning" &&
    (row.duplicateAcknowledged || acknowledgedIds.has(row.id))
  );
}

export function getDefaultSelectedPaymentRowIds(summary: PaymentImportBatchSummary) {
  return new Set(
    summary.rows
      .filter(
        (row) =>
          !row.postedAt &&
          (row.validationStatus === "valid" ||
            (row.validationStatus === "warning" && row.duplicateAcknowledged)),
      )
      .map((row) => row.id),
  );
}

function updateBatchUrl(batchId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (batchId) url.searchParams.set("batch", batchId);
  else url.searchParams.delete("batch");
  const query = url.searchParams.toString();
  window.history.replaceState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}

type BulkPaymentWorkflowProps = {
  sessionLabel: string;
  initialBatchId?: string;
};

export function BulkPaymentWorkflow({
  sessionLabel,
  initialBatchId,
}: BulkPaymentWorkflowProps) {
  const [phase, setPhase] = useState<Phase>(initialBatchId ? "loading" : "upload");
  const [summary, setSummary] = useState<PaymentImportBatchSummary | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reconciled, setReconciled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialBatchId) return;
    const batchId = initialBatchId;

    let cancelled = false;
    async function loadBatch() {
      setPhase("loading");
      setError(null);
      try {
        const response = await fetch(
          `/api/imports/payments/batch/${encodeURIComponent(batchId)}/summary`,
        );
        const payload = (await response.json()) as {
          summary?: PaymentImportBatchSummary;
          error?: string;
        };
        if (!response.ok || !payload.summary) {
          throw new Error(payload.error ?? "The saved batch could not be loaded.");
        }
        if (payload.summary.sessionLabel !== sessionLabel) {
          throw new Error(
            `This batch belongs to ${payload.summary.sessionLabel}, but the page is showing ${sessionLabel}. Switch to the matching session before resuming it.`,
          );
        }
        if (cancelled) return;
        setSummary(payload.summary);
        setAcknowledgedIds(new Set());
        setSelectedIds(getDefaultSelectedPaymentRowIds(payload.summary));
        setReconciled(false);
        setPhase(payload.summary.status === "committed" ? "done" : "review");
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The saved batch could not be loaded.",
        );
        setPhase("upload");
      }
    }
    void loadBatch();

    return () => {
      cancelled = true;
    };
  }, [initialBatchId, sessionLabel]);

  const readyRows = useMemo(() => {
    if (!summary) return [];
    return summary.rows.filter((row) => isRowReady(row, acknowledgedIds));
  }, [summary, acknowledgedIds]);

  const selectedRows = useMemo(
    () => readyRows.filter((row) => selectedIds.has(row.id)),
    [readyRows, selectedIds],
  );

  const selectedTotal = useMemo(
    () => selectedRows.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    [selectedRows],
  );

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

  const allReadySelected =
    readyRows.length > 0 && readyRows.every((row) => selectedIds.has(row.id));

  async function handleUpload() {
    const file = selectedFile ?? fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose the filled CSV or XLSX file first.");
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
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
      setSelectedIds(getDefaultSelectedPaymentRowIds(payload.summary));
      setReconciled(false);
      updateBatchUrl(payload.summary.batchId);
      setPhase("review");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!summary || selectedRows.length === 0 || !reconciled) return;
    setPhase("committing");
    setError(null);
    setNotice(null);
    const rowsToPost = [...selectedRows];
    const ids = rowsToPost.map((row) => row.id);
    const acknowledged = [
      ...new Set(
        rowsToPost
          .filter((row) => row.validationStatus === "warning")
          .map((row) => row.id),
      ),
    ];
    const chunks = chunkIds(ids, PAYMENT_IMPORT_COMMIT_CHUNK_SIZE);
    setProgress({ done: 0, total: ids.length });

    let latestSummary: PaymentImportBatchSummary = summary;
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
          throw new Error(
            payload.error ??
              "Posting stopped part-way. Already-posted rows are safe; this batch link can resume the rest.",
          );
        }
        if (payload.summary) {
          latestSummary = payload.summary;
          setSummary(payload.summary);
        }
        setSelectedIds((previous) => {
          const next = new Set(previous);
          chunk.forEach((id) => next.delete(id));
          return next;
        });
        setProgress((previous) => ({ ...previous, done: previous.done + chunk.length }));
      }

      const remainingRows = latestSummary.rows.filter(
        (row) => !row.postedAt && row.validationStatus !== "error",
      );
      setReconciled(false);
      if (remainingRows.length > 0) {
        setNotice(
          `Posted the selected ${ids.length} payment${ids.length === 1 ? "" : "s"}. ${remainingRows.length} staged row${remainingRows.length === 1 ? "" : "s"} remain unposted.`,
        );
        setPhase("review");
      } else {
        setPhase("done");
      }
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : "Posting stopped part-way. Already-posted rows are safe; retry this batch to resume.",
      );
      setSummary(latestSummary);
      setReconciled(false);
      setPhase("review");
    }
  }

  function toggleAcknowledged(rowId: string) {
    const willAcknowledge = !acknowledgedIds.has(rowId);
    setAcknowledgedIds((previous) => {
      const next = new Set(previous);
      if (willAcknowledge) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
    setSelectedIds((current) => {
      const selected = new Set(current);
      if (willAcknowledge) selected.add(rowId);
      else selected.delete(rowId);
      return selected;
    });
    setReconciled(false);
  }

  function toggleSelected(rowId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
    setReconciled(false);
  }

  function selectAllReady() {
    setSelectedIds(new Set(readyRows.map((row) => row.id)));
    setReconciled(false);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setReconciled(false);
  }

  function startOver() {
    setPhase("upload");
    setSummary(null);
    setAcknowledgedIds(new Set());
    setSelectedIds(new Set());
    setReconciled(false);
    setSelectedFile(null);
    setError(null);
    setNotice(null);
    updateBatchUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-success-soft-foreground"
        >
          {notice}
        </p>
      ) : null}

      {phase === "loading" ? (
        <SectionCard
          title="Resuming saved review"
          description="Loading the staged rows from this batch link. No payment is posted by opening the link."
        >
          <p className="text-sm text-muted-foreground">Checking the saved batch…</p>
        </SectionCard>
      ) : null}

      {phase === "upload" ? (
        <SectionCard
          title="1. Prepare and upload"
          description={`Use the guided template, then upload up to 200 payment rows for ${sessionLabel}. Uploading only stages rows for review.`}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="rounded-xl border border-dashed border-border-strong bg-surface-2/70 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-card text-info-soft-foreground shadow-sm">
                  <FileSpreadsheet className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="bulk-payment-file"
                    className="cursor-pointer text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    Choose the filled CSV or XLSX file
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keep the first-row headers unchanged. The review step checks students, dates,
                    modes, duplicates, and totals before posting.
                  </p>
                  {selectedFile ? (
                    <p className="mt-2 truncate text-sm font-medium text-foreground">
                      Selected: {selectedFile.name}
                    </p>
                  ) : null}
                </div>
              </div>
              <input
                ref={fileInputRef}
                id="bulk-payment-file"
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
            </div>

            <div className="flex flex-col justify-center gap-2 sm:flex-row lg:flex-col">
              <a
                href="/protected/payments/bulk/template"
                download
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-2"
              >
                <Download className="size-4" aria-hidden="true" />
                Download guided template
              </a>
              <Button
                type="button"
                disabled={uploading || !selectedFile}
                onClick={handleUpload}
              >
                {uploading ? "Validating…" : "Upload and review"}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {summary && phase !== "upload" && phase !== "loading" ? (
        <SectionCard
          title={`2. Review and reconcile — ${summary.fileName}`}
          description="Select only the rows to post. Red rows never post; yellow rows require an explicit duplicate confirmation."
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/20 bg-info-soft/60 px-3 py-2 text-xs text-info-soft-foreground">
            <span className="inline-flex items-center gap-2">
              <Link2 className="size-3.5" aria-hidden="true" />
              This staged review is saved in the current URL, so a refresh can safely resume it.
            </span>
            <span className="font-semibold">Session: {summary.sessionLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <SummaryTile label="Rows" value={summary.totalRows} />
            <SummaryTile label="Valid" value={summary.validRows} tone="success" />
            <SummaryTile label="Confirm" value={summary.warningRows} tone="warning" />
            <SummaryTile label="Errors" value={summary.errorRows} tone="danger" />
            <SummaryTile label="Posted" value={summary.postedRows} tone="success" />
            <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Selected total</p>
              <p className="text-lg font-semibold text-foreground">{formatInr(selectedTotal)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {selectedRows.length} of {readyRows.length} ready row
              {readyRows.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={phase === "committing" || allReadySelected}
                onClick={selectAllReady}
              >
                Select all ready
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={phase === "committing" || selectedIds.size === 0}
                onClick={clearSelection}
              >
                Clear selection
              </Button>
            </div>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-3 py-2">
                    <span className="sr-only">Post</span>
                  </th>
                  <th className="py-2 pr-3">Row</th>
                  <th className="py-2 pr-3">SR no</th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => {
                  const rowReady = isRowReady(row, acknowledgedIds);
                  const rowSelected = rowReady && selectedIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/60 align-top last:border-b-0",
                        rowSelected && "bg-primary/[0.035]",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <Checkbox
                          aria-label={`Select spreadsheet row ${row.rowNumber} for posting`}
                          checked={rowSelected}
                          disabled={!rowReady || phase === "committing"}
                          onCheckedChange={() => toggleSelected(row.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{row.rowNumber}</td>
                      <td className="py-2.5 pr-3 font-medium">{row.admissionNo ?? "—"}</td>
                      <td className="py-2.5 pr-3">{row.studentName ?? "—"}</td>
                      <td className="py-2.5 pr-3 font-medium">
                        {row.amount !== null ? formatInr(row.amount) : "—"}
                      </td>
                      <td className="py-2.5 pr-3">{row.paymentDate ?? "—"}</td>
                      <td className="py-2.5 pr-3">{row.paymentMode ?? "—"}</td>
                      <td className="py-2.5 pr-3">
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
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
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
                          <label className="mt-2 flex items-start gap-2 text-foreground">
                            <Checkbox
                              className="mt-0.5"
                              checked={
                                row.duplicateAcknowledged || acknowledgedIds.has(row.id)
                              }
                              disabled={row.duplicateAcknowledged || phase === "committing"}
                              onCheckedChange={() => toggleAcknowledged(row.id)}
                            />
                            <span>Confirmed as a separate payment</span>
                          </label>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">Final posting check</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedRows.length} payment{selectedRows.length === 1 ? "" : "s"} selected
                    for {summary.sessionLabel}, totalling{" "}
                    <span className="font-semibold text-foreground">
                      {formatInr(selectedTotal)}
                    </span>
                    .
                  </p>
                </div>
              </div>
              <label className="flex max-w-xl items-start gap-2 text-sm text-foreground">
                <Checkbox
                  className="mt-0.5"
                  checked={reconciled}
                  disabled={phase === "committing" || selectedRows.length === 0}
                  onCheckedChange={(checked) => setReconciled(checked === true)}
                />
                <span>
                  I checked the session, student matches, selected row count, and selected total
                  against the collection record.
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {phase === "committing"
                ? `Posting ${progress.done}/${progress.total}…`
                : blockedWarnings > 0
                  ? `${blockedWarnings} flagged row${blockedWarnings === 1 ? "" : "s"} awaiting confirmation`
                  : "All flagged rows are resolved."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={phase === "committing"}
                onClick={startOver}
                className="gap-2"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Start over
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={
                  phase === "committing" || selectedRows.length === 0 || !reconciled
                }
                onClick={handleCommit}
              >
                {phase === "committing"
                  ? "Posting…"
                  : `Post ${selectedRows.length} · ${formatInr(selectedTotal)}`}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {phase === "done" && summary ? (
        <SectionCard
          title="3. Posting complete"
          description="Posted receipts are live in Transactions and Receipts."
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-success-soft-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-foreground">
              Posted <span className="font-semibold">{postedRows.length}</span> payment
              {postedRows.length === 1 ? "" : "s"} totalling{" "}
              <span className="font-semibold">{formatInr(postedTotal)}</span>. Rows that could
              not post keep their error above; correct them in a new file or handle them at the
              Payment Desk.
            </p>
          </div>
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
