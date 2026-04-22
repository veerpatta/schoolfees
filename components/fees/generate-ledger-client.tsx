"use client";

import { useEffect, useActionState } from "react";
import { AlertCircle, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import type {
  LedgerRegenerationActionState,
  LedgerRegenerationReviewRow,
} from "@/lib/fees/types";

type GenerateLedgerClientProps = {
  initialState: LedgerRegenerationActionState;
  action: (
    previous: LedgerRegenerationActionState,
    formData: FormData,
  ) => Promise<LedgerRegenerationActionState>;
};

function AlertBox({
  tone,
  title,
  message,
}: {
  tone: "error" | "success" | "preview";
  title: string;
  message: string;
}) {
  const palette =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

  return (
    <div className={`flex gap-3 rounded-lg border p-4 text-sm ${palette}`}>
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p>{message}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function getBalanceTone(value: LedgerRegenerationReviewRow["balanceStatus"]) {
  if (value === "paid") {
    return "text-emerald-700";
  }

  if (value === "partial") {
    return "text-amber-700";
  }

  if (value === "waived" || value === "cancelled") {
    return "text-slate-500";
  }

  return "text-slate-700";
}

export function GenerateLedgerClient({ initialState, action }: GenerateLedgerClientProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  const preview = state.preview;
  const canApply = Boolean(preview && state.batchId && state.status !== "success");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/protected/fee-setup">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fee Setup
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            <span>Ledger recalculation</span>
          </CardTitle>
          <CardDescription>
            Preview how the current fee policy affects future and unpaid installment rows before
            applying any updates. Rows with payments, partial payments, or adjustments are left
            untouched and flagged for manual review.
          </CardDescription>
        </CardHeader>

        <form action={formAction}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for regeneration</Label>
              <textarea
                id="reason"
                name="reason"
                required
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:border-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                placeholder="Describe why dues are being recalculated, such as a session fee change or updated installment dates."
                defaultValue={preview?.reason ?? ""}
              />
              <p className="text-xs text-slate-500">
                This reason is recorded with the regeneration batch for audit review.
              </p>
            </div>

            {state.message && state.status === "error" ? (
              <AlertBox tone="error" title="Preview failed" message={state.message} />
            ) : null}

            {preview ? (
              <div className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                      Preview ready
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">
                      {preview.policyRevisionLabel}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Policy revision: {preview.policyRevisionId ?? "default policy"}.
                    </p>
                  </div>
                  <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700">
                    {preview.reviewRowsTotal} rows need manual review
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Rows recalculated"
                    value={preview.rowsRecalculated}
                    hint={`${preview.rowsInserted} inserts, ${preview.rowsUpdated} updates, ${preview.rowsCancelled} cancellations`}
                  />
                  <MetricCard label="Rows skipped" value={preview.rowsSkipped} />
                  <MetricCard label="Students affected" value={preview.affectedStudents} />
                  <MetricCard
                    label="Manual review"
                    value={preview.rowsRequiringReview}
                    hint={`${preview.paidInstallments} paid, ${preview.partiallyPaidInstallments} partially paid, ${preview.unpaidInstallments} unpaid, ${preview.futureInstallments} future`}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Students in session" value={preview.studentsInAcademicSession} />
                  <MetricCard label="Students resolved" value={preview.studentsWithResolvedSettings} />
                  <MetricCard label="Students missing settings" value={preview.studentsMissingSettings} />
                  <MetricCard label="Existing installment rows" value={preview.existingInstallments} />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Regeneration reason</p>
                  <p className="mt-1 text-sm text-slate-600">{preview.reason}</p>
                </div>

                {preview.reviewRows.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Rows requiring review</p>
                        <p className="text-xs text-slate-500">
                          Showing {preview.reviewRows.length} of {preview.reviewRowsTotal} flagged rows.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full min-w-[840px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                          <tr>
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Installment</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Outstanding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.reviewRows.map((row) => (
                            <tr key={`${row.studentId}-${row.installmentNo}`} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-950">{row.studentLabel}</p>
                                <p className="text-xs text-slate-500">{row.classLabel}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-900">{row.installmentLabel}</p>
                                <p className="text-xs text-slate-500">{row.dueDate}</p>
                              </td>
                              <td className={`px-4 py-3 capitalize ${getBalanceTone(row.balanceStatus)}`}>
                                {row.balanceStatus}
                              </td>
                              <td className="px-4 py-3 text-slate-700">{row.reasonLabel}</td>
                              <td className="px-4 py-3 text-slate-900">
                                {formatInr(row.outstandingAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    No rows currently require manual review.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                Enter a reason, preview the recalculation, and then apply it if the preview looks
                correct. Only rows without payments or adjustments will be updated automatically.
              </div>
            )}

            {state.message && state.status === "success" ? (
              <AlertBox tone="success" title="Recalculation applied" message={state.message} />
            ) : null}

            {state.message && state.status === "preview" ? (
              <AlertBox tone="preview" title="Preview summary" message={state.message} />
            ) : null}

            {state.batchId ? <input type="hidden" name="batchId" value={state.batchId} /> : null}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              Payments, receipts, and payment adjustments remain append-only. This workflow only
              recalculates future or unpaid rows and leaves paid history intact.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                name="_intent"
                value="preview"
                variant="outline"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Working...
                  </>
                ) : (
                  "Preview recalculation"
                )}
              </Button>

              <Button type="submit" name="_intent" value="apply" disabled={!canApply || pending}>
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply recalculation"
                )}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
