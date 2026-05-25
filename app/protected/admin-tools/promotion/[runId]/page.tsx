import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import { getPromotionRun } from "@/lib/promotion/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import {
  applyPromotionRunAction,
  rollbackPromotionRunAction,
  updatePromotionEntryDecisionAction,
} from "../actions";

type Props = {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{
    error?: string;
    notice?: string;
  }>;
};

const DECISION_LABEL: Record<string, string> = {
  pending: "Pending",
  promote: "Promote",
  graduate: "Graduate",
  skip: "Skip",
  manual: "Manual",
};

const DECISION_TONE: Record<string, string> = {
  promote: "border-success/30 bg-success-soft text-success-soft-foreground",
  graduate: "border-info/30 bg-info-soft text-info-soft-foreground",
  pending: "border-border bg-surface-2 text-muted-foreground",
  skip: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  manual: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function PromotionDetailPage({ params, searchParams }: Props) {
  await requireStaffPermission("students:write", { onDenied: "redirect" });
  const { runId } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const detail = await getPromotionRun(runId);

  if (!detail) {
    notFound();
  }

  const { run, entries } = detail;
  const isPreview = run.status === "preview";
  const isApplied = run.status === "applied";

  const promoteCount = entries.filter((entry) => entry.decision === "promote").length;
  const graduateCount = entries.filter((entry) => entry.decision === "graduate").length;
  const pendingCount = entries.filter((entry) => entry.decision === "pending" || entry.decision === "manual").length;
  const creditTotal = entries.reduce((sum, entry) => sum + entry.openingCreditAmount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools · Promotion"
        title={`${run.sourceSessionLabel} → ${run.targetSessionLabel}`}
        description={`Triggered ${formatDateTime(run.triggeredAt)} · status ${run.status}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/protected/admin-tools/promotion">Back to runs</Link>
          </Button>
        }
      />

      {resolved?.error ? (
        <div className="rounded-xl border bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground">
          {resolved.error}
        </div>
      ) : null}
      {resolved?.notice ? (
        <div className="rounded-xl border bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">
          {resolved.notice}
        </div>
      ) : null}

      <SectionCard
        title="Summary"
        description="Counts derived from per-student decisions. Review carefully before applying."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-surface-2 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold">{run.previewCount}</p>
          </div>
          <div className="rounded-xl border bg-success-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-success-soft-foreground">To promote</p>
            <p className="mt-1 text-2xl font-semibold text-success-soft-foreground">{promoteCount}</p>
          </div>
          <div className="rounded-xl border bg-info-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-info-soft-foreground">To graduate</p>
            <p className="mt-1 text-2xl font-semibold text-info-soft-foreground">{graduateCount}</p>
          </div>
          <div className="rounded-xl border bg-warning-soft px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-warning-soft-foreground">Need attention</p>
            <p className="mt-1 text-2xl font-semibold text-warning-soft-foreground">{pendingCount}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Credit to carry forward: <strong>{formatInr(creditTotal)}</strong>
        </p>
      </SectionCard>

      {isPreview ? (
        <SectionCard
          title="Apply this promotion"
          description="Once you apply, every promote/graduate entry is committed. Type APPLY in the box to confirm."
        >
          <form action={applyPromotionRunAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <div>
              <Label htmlFor="confirmation">Confirmation</Label>
              <Input
                id="confirmation"
                name="confirmation"
                placeholder="APPLY"
                className="mt-2 h-10 w-40"
                required
              />
            </div>
            <Button type="submit">Apply promotion ({promoteCount + graduateCount} students)</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Verify the next-year fee setup is in place. Dues are re-prepared automatically afterwards.
          </p>
        </SectionCard>
      ) : null}

      {isApplied ? (
        <SectionCard
          title="Roll back this promotion"
          description="Reverses the class/status changes and undoes credit carry-forward. Type ROLLBACK to confirm."
        >
          <form action={rollbackPromotionRunAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <div>
              <Label htmlFor="rollbackConfirmation">Confirmation</Label>
              <Input
                id="rollbackConfirmation"
                name="confirmation"
                placeholder="ROLLBACK"
                className="mt-2 h-10 w-40"
                required
              />
            </div>
            <Button type="submit" variant="destructive">Roll back applied promotion</Button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Per-student plan" description="Review each row. Switch decisions if needed.">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">Decision</th>
                {isPreview ? <th className="px-3 py-2">Change</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-2/40">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{entry.studentName}</div>
                    <div className="text-xs text-muted-foreground">SR {entry.studentAdmissionNo || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.previousClassLabel}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground">
                    {entry.decision === "graduate" ? "Graduated" : entry.newClassLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {entry.openingCreditAmount > 0 ? formatInr(entry.openingCreditAmount) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${DECISION_TONE[entry.decision] ?? DECISION_TONE.pending}`}>
                      {DECISION_LABEL[entry.decision] ?? entry.decision}
                    </span>
                    {entry.reason ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{entry.reason}</p>
                    ) : null}
                  </td>
                  {isPreview ? (
                    <td className="px-3 py-2">
                      <form action={updatePromotionEntryDecisionAction} className="flex items-center gap-2">
                        <input type="hidden" name="runId" value={run.id} />
                        <input type="hidden" name="entryId" value={entry.id} />
                        <select
                          name="decision"
                          defaultValue={entry.decision}
                          className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                        >
                          <option value="pending">Pending</option>
                          <option value="promote" disabled={!entry.newClassId}>Promote</option>
                          <option value="graduate">Graduate</option>
                          <option value="skip">Skip</option>
                          <option value="manual">Mark manual</option>
                        </select>
                        <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">
                          Save
                        </Button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
