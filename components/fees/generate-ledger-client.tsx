"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CopyPlus, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type LedgerGenerationPreview } from "@/lib/fees/generator";

type GenerateLedgerClientProps = {
  previewAction: () => Promise<LedgerGenerationPreview>;
  submitAction: () => Promise<{ success: boolean; message: string }>;
};

function AlertBox({
  tone,
  title,
  message,
}: {
  tone: "error" | "success";
  title: string;
  message: string;
}) {
  const palette =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className={`flex space-x-3 rounded-lg border p-4 text-sm ${palette}`}>
      {tone === "error" ? (
        <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
      ) : (
        <CopyPlus className="h-5 w-5 shrink-0 text-emerald-600" />
      )}
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function GenerateLedgerClient({
  previewAction,
  submitAction,
}: GenerateLedgerClientProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<LedgerGenerationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    previewAction()
      .then(setPreview)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load preview."),
      )
      .finally(() => setLoading(false));
  }, [previewAction]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await submitAction();

      if (!result.success) {
        setError(result.message);
        return;
      }

      setSuccess(result.message);
      setPreview(await previewAction());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate =
    !loading &&
    !generating &&
    Boolean(preview) &&
    (preview?.installmentsToInsert ?? 0) +
      (preview?.installmentsToUpdate ?? 0) +
      (preview?.installmentsToCancel ?? 0) >
      0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/protected/fee-setup">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Fee Setup
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-xl">
            <CopyPlus className="h-5 w-5 text-blue-600" />
            <span>Session Ledger Sync</span>
          </CardTitle>
          <CardDescription>
            This workflow reads the canonical fee policy, class defaults, route defaults, and student overrides, then inserts or updates only unpaid installments. Installments with payments or adjustments stay locked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex animate-pulse flex-col items-center justify-center space-y-2 py-8 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <p>Analyzing current policy and unpaid ledgers...</p>
            </div>
          ) : null}

          {!loading && error && !preview ? (
            <AlertBox tone="error" title="Preview failed" message={error} />
          ) : null}

          {!loading && preview ? (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Preview summary</h3>
                  <p className="text-xs text-slate-500">
                    Academic session: {preview.academicSessionLabel}
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {preview.studentsWithResolvedSettings} of {preview.studentsInAcademicSession} session students have usable class defaults
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-slate-500">Active students</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.totalActiveStudents}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Students in session</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.studentsInAcademicSession}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Missing class defaults</dt>
                  <dd className="mt-1 text-2xl font-semibold text-amber-600">
                    {preview.studentsMissingSettings}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Insert unpaid rows</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.installmentsToInsert}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Update unpaid rows</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.installmentsToUpdate}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Cancel extra unpaid rows</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.installmentsToCancel}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Locked installments</dt>
                  <dd className="mt-1 text-2xl font-semibold text-amber-600">
                    {preview.lockedInstallments}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Existing installment rows</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.existingInstallments}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-500">Expected scheduled rows</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {preview.expectedScheduledInstallments}
                  </dd>
                </div>
              </dl>

              {preview.studentsWithResolvedSettings === 0 ? (
                <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">
                  Save class defaults for the current academic session before running this sync.
                </div>
              ) : null}

              {preview.lockedInstallments > 0 ? (
                <div className="rounded-md bg-slate-100 p-4 text-sm text-slate-700">
                  Locked installments already have payments or adjustments. They will stay untouched and remain auditable.
                </div>
              ) : null}
            </div>
          ) : null}

          {error && preview ? (
            <AlertBox tone="error" title="Sync failed" message={error} />
          ) : null}

          {success ? (
            <AlertBox tone="success" title="Sync completed" message={success} />
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-between bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-500">
            Paid history is append-only. This workflow changes only defaults and unpaid due-schedule rows.
          </p>
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              "Sync unpaid ledgers"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
