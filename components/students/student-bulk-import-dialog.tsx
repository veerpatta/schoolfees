"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { ImportBatchDialogSummary, ImportMode } from "@/lib/import/types";
import type { StudentSessionOption } from "@/lib/students/types";

type UploadResponse = {
  batchId: string;
  autoValidated: boolean;
  targetSessionLabel: string | null;
  summary: ImportBatchDialogSummary;
};

type CommitResponse = {
  result: {
    batchId: string;
    createdCount: number;
    updatedCount: number;
    importedCount: number;
    failedCount: number;
    skippedCount: number;
    temporarySrGeneratedCount: number;
    ledgerSyncError: string | null;
    duesReadyCount: number;
    duesAttentionCount: number;
    duesReasonSummary: string | null;
    status: "completed" | "failed";
  };
  summary: ImportBatchDialogSummary;
};

function csvEscape(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function downloadErrorRows(summary: ImportBatchDialogSummary) {
  const rows = summary.problemRows.map((row) => {
    const studentName = row.normalizedPayload?.fullName ?? "";
    const classLabel = row.normalizedPayload?.classLabel ?? "";
    const admissionNo = row.normalizedPayload?.admissionNo ?? "";
    const issues = row.errors.map((issue) => issue.message).join("; ");
    return [
      String(row.rowIndex),
      studentName,
      classLabel,
      admissionNo,
      row.status,
      issues,
    ];
  });
  const csv = [
    ["Row", "Student name", "Class", "SR no", "Status", "Blocking issues"],
    ...rows,
  ]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `student-import-errors-${summary.batchId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function StudentBulkImportDialogTrigger({
  sessionOptions,
  defaultSessionLabel,
}: {
  sessionOptions: StudentSessionOption[];
  defaultSessionLabel: string;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("add");
  const [sessionLabel, setSessionLabel] = useState(defaultSessionLabel);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportBatchDialogSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse["result"] | null>(null);
  const [showAllReadyRows, setShowAllReadyRows] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const templateHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (mode === "add" || sessionLabel !== "__all__") {
      params.set("sessionLabel", sessionLabel);
    }
    return `/protected/imports/template?${params.toString()}`;
  }, [mode, sessionLabel]);

  function openDialog(nextMode: ImportMode) {
    setMode(nextMode);
    setSessionLabel(nextMode === "update" ? "__all__" : defaultSessionLabel);
    setSelectedFile(null);
    setUploadPercent(0);
    setStatusText(null);
    setSummary(null);
    setErrorText(null);
    setCommitResult(null);
    setShowAllReadyRows(false);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  function uploadAndValidate() {
    if (!selectedFile || uploading || committing) {
      return;
    }

    if (mode === "add" && !sessionLabel) {
      setErrorText("Select an academic year before uploading.");
      return;
    }

    setErrorText(null);
    setUploading(true);
    setCommitResult(null);
    setStatusText("Uploading file...");
    setUploadPercent(0);

    const formData = new FormData();
    formData.set("importFile", selectedFile);
    formData.set("mode", mode);
    if (mode === "add" || sessionLabel !== "__all__") {
      formData.set("sessionLabel", sessionLabel);
    }

    const request = new XMLHttpRequest();
    request.open("POST", "/api/imports/students/upload");

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const nextPercent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        setUploadPercent(nextPercent);
        if (nextPercent >= 100) {
          setStatusText("Reading spreadsheet...");
        }
      }
    };

    request.onload = () => {
      setUploading(false);
      if (request.status < 200 || request.status >= 300) {
        try {
          const payload = JSON.parse(request.responseText) as { error?: string };
          setErrorText(payload.error ?? "Upload failed.");
        } catch {
          setErrorText("Upload failed.");
        }
        return;
      }

      setStatusText("Checking rows...");
      const payload = JSON.parse(request.responseText) as UploadResponse;
      setSummary(payload.summary);
      setStatusText("Ready to import");
      setUploadPercent(100);
    };

    request.onerror = () => {
      setUploading(false);
      setErrorText("Upload failed. Please try again.");
    };

    request.send(formData);
  }

  async function importValidStudents() {
    if (!summary || committing || uploading) {
      return;
    }

    setErrorText(null);
    setCommitting(true);
    setStatusText("Importing students...");

    const response = await fetch(`/api/imports/students/batch/${summary.batchId}/commit`, {
      method: "POST",
    });
    const payload = (await response.json()) as CommitResponse | { error?: string };

    setCommitting(false);

    if (!response.ok || !("result" in payload)) {
      setErrorText(("error" in payload && payload.error) || "Unable to import valid students.");
      return;
    }

    setSummary(payload.summary);
    setCommitResult(payload.result);
    setStatusText(payload.result.ledgerSyncError ? "Dues need attention" : "Students imported and dues prepared");
    router.refresh();
  }

  const readyRows = showAllReadyRows
    ? summary?.readyPreviewRows ?? []
    : (summary?.readyPreviewRows ?? []).slice(0, 10);
  const duplicatesBlocked = summary
    ? summary.problemRows.filter((row) => row.status === "duplicate").length
    : 0;

  return (
    <>
      <Button variant="outline" onClick={() => openDialog("add")}>
        Bulk Add Students
      </Button>
      <Button variant="outline" onClick={() => openDialog("update")}>
        Bulk Update Existing Students
      </Button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-start justify-center bg-slate-900/50 p-4 pt-10 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
            >
              <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {mode === "update" ? "Bulk Update Existing Students" : "Bulk Add Students"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {mode === "update"
                        ? "Select session scope, upload edited sheet, preview changes, and confirm update."
                        : "Select academic year, upload sheet, review validation result, and import valid rows."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={closeDialog}>
                    Close
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-3">
                  <p>1. Select academic year</p>
                  <p>2. Download template and upload file</p>
                  <p>3. Import valid students</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr_auto] md:items-end">
                  <div>
                    <label htmlFor="bulk-session" className="text-sm font-medium text-slate-900">
                      Academic year
                    </label>
                    <select
                      id="bulk-session"
                      className="mt-2 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                      value={sessionLabel}
                      onChange={(event) => setSessionLabel(event.target.value)}
                      disabled={uploading || committing}
                    >
                      {mode === "update" ? <option value="__all__">All Existing Students</option> : null}
                      {sessionOptions.map((sessionOption) => (
                        <option key={sessionOption.value} value={sessionOption.value}>
                          {sessionOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bulk-file" className="text-sm font-medium text-slate-900">
                      Spreadsheet file
                    </label>
                    <input
                      id="bulk-file"
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                      className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={uploading || committing}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link href={templateHref}>
                        {mode === "update"
                          ? "Download Existing Students for Update"
                          : "Download Template"}
                      </Link>
                    </Button>
                    <Button onClick={uploadAndValidate} disabled={!selectedFile || uploading || committing}>
                      {uploading ? "Uploading..." : "Upload and Validate"}
                    </Button>
                  </div>
                </div>

                {statusText ? (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    {statusText}
                    {uploading ? ` (${uploadPercent}%)` : ""}
                  </div>
                ) : null}

                {errorText ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {errorText}
                  </div>
                ) : null}

                {summary ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-sm text-emerald-700">Ready to import</p>
                        <p className="text-2xl font-semibold text-emerald-900">{summary.reviewSummary.readyToImportRows}</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm text-amber-700">Needs correction</p>
                        <p className="text-2xl font-semibold text-amber-900">{summary.reviewSummary.correctionRows}</p>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm text-blue-700">Warnings</p>
                        <p className="text-2xl font-semibold text-blue-900">{summary.reviewSummary.warningRows}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm text-slate-700">Duplicates blocked</p>
                        <p className="text-2xl font-semibold text-slate-900">{duplicatesBlocked}</p>
                      </div>
                    </div>

                    {summary.warningSummary.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-900">Warnings summary</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {summary.warningSummary.map((item) => (
                            <p key={item.label} className="text-sm text-slate-700">
                              {item.count} x {item.label}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {summary.problemRows.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-900">Problem rows first</p>
                        <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                          {summary.problemRows.map((row) => (
                            <div key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                              <p className="font-medium text-amber-900">
                                Row {row.rowIndex} - {row.normalizedPayload?.fullName || "Unknown student"}
                              </p>
                              <p className="text-amber-800">
                                {row.errors.map((issue) => issue.message).join("; ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {readyRows.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-900">Ready row preview</p>
                        <div className="mt-2 max-h-48 overflow-auto text-sm text-slate-700">
                          {readyRows.map((row) => (
                            <p key={row.id}>
                              Row {row.rowIndex}: {row.normalizedPayload?.fullName} - {row.normalizedPayload?.classLabel}
                            </p>
                          ))}
                        </div>
                        {(summary.readyPreviewRows.length > 10 || showAllReadyRows) ? (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAllReadyRows((prev) => !prev)}
                          >
                            {showAllReadyRows ? "Show fewer" : "View more"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={importValidStudents}
                        disabled={committing || uploading || summary.reviewSummary.readyToImportRows === 0}
                      >
                        {committing ? "Importing students..." : "Import Valid Students"}
                      </Button>
                      <Button variant="outline" onClick={() => downloadErrorRows(summary)}>
                        Download error rows
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedFile(null);
                          setSummary(null);
                          setStatusText(null);
                          setUploadPercent(0);
                          setErrorText(null);
                        }}
                      >
                        Replace file
                      </Button>
                      <Button asChild variant="outline">
                        <Link href={`/protected/imports?mode=${summary.mode}&batchId=${summary.batchId}`}>
                          Import history
                        </Link>
                      </Button>
                    </div>

                {commitResult ? (
                  <div
                    className={`rounded-xl border p-3 text-sm ${
                      commitResult.ledgerSyncError
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    <p className="font-semibold">
                      {commitResult.ledgerSyncError
                        ? "Students imported, but dues need attention"
                        : "Students imported and dues prepared"}
                    </p>
                    <p className="mt-1">
                      Created: {commitResult.createdCount} | Updated: {commitResult.updatedCount} | Failed: {commitResult.failedCount} | Skipped: {commitResult.skippedCount}
                    </p>
                    <p className="mt-1">Temporary SR generated: {commitResult.temporarySrGeneratedCount}</p>
                    <p className="mt-1">
                      Ready for payment: {commitResult.duesReadyCount} | Dues not prepared: {commitResult.duesAttentionCount}
                    </p>
                    {commitResult.ledgerSyncError ? (
                      <div className="mt-2 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-amber-950">
                        <p className="font-medium">Dues could not be prepared.</p>
                        <p className="mt-1">{commitResult.duesReasonSummary ?? commitResult.ledgerSyncError}</p>
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href="/protected/students">Open Students list</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/protected/payments">Open Payment Desk</Link>
                      </Button>
                      {commitResult.ledgerSyncError ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/protected/fee-setup">Open Fee Setup</Link>
                        </Button>
                      ) : null}
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/protected/imports?mode=${summary.mode}&batchId=${summary.batchId}`}>
                              Import history
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
