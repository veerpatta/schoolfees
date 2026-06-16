import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import {
  getPrevYearImportRows,
  listPrevYearImportBatches,
  summarizeBatchRows,
} from "@/lib/prev-year-dues/data";
import { CARRY_FORWARD_LABEL } from "@/lib/prev-year-dues/constants";
import { requireAnyStaffPermission } from "@/lib/supabase/session";

export const revalidate = 0;

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function statusTone(status: string): "good" | "warning" | "info" {
  if (status === "applied") return "good";
  if (status === "failed" || status === "rolled_back") return "warning";
  return "info";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default async function PrevYearDuesPage() {
  await requireAnyStaffPermission(["fees:view", "finance:view"], { onDenied: "redirect" });

  const batches = await listPrevYearImportBatches();
  const latest = batches[0] ?? null;
  const rows = latest ? await getPrevYearImportRows(latest.id) : [];
  const breakdown = summarizeBatchRows(rows);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Previous Year Dues"
        description="Carry-forward of unpaid prior-year tuition balances into the current collection workflow. Read-only audit of each import batch."
      />

      <OfficeNotice title="How this works" tone="info">
        Each confirmed row becomes a single carry-forward installment with{" "}
        <strong>zero late fee</strong>, dated ahead of the first current-year installment so it is
        collected first. Carry-forward lines are protected from Fee Setup regeneration. To import a
        new file, run the dry run (<code>scripts/prev-year-dues-dry-run.mjs</code>) and apply only
        after owner approval — see the runbook.
      </OfficeNotice>

      {!latest ? (
        <SectionCard title="No imports yet" description="No previous-year dues have been carried forward.">
          <p className="text-sm text-muted-foreground">
            Once a confirmed spreadsheet is imported, its batch summary and per-row results appear here.
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title={`Latest batch — ${latest.sessionLabel}`}
            description={`${latest.fileName} · imported ${
              latest.appliedAt ? new Date(latest.appliedAt).toLocaleString("en-IN") : "—"
            }`}
            actions={<StatusBadge label={latest.status.toUpperCase()} tone={statusTone(latest.status)} />}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Candidate rows" value={String(latest.candidateRowCount)} />
              <Metric label="Confirmed (Y)" value={`${latest.confirmedRowCount} · ${inr(latest.confirmedSubtotal)}`} />
              <Metric label="Applied" value={`${latest.appliedRowCount} · ${inr(latest.appliedSubtotal)}`} />
              <Metric label="Not applied" value={String(breakdown.skipped + breakdown.error + breakdown.pending)} />
            </div>
            {latest.applyNotes ? (
              <p className="mt-4 text-sm text-muted-foreground">{latest.applyNotes}</p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Reconciliation:{" "}
              {latest.appliedSubtotal === breakdown.appliedSubtotal ? (
                <span className="font-semibold text-success-soft-foreground">
                  applied subtotal matches inserted rows ({inr(breakdown.appliedSubtotal)}).
                </span>
              ) : (
                <span className="font-semibold text-warning-soft-foreground">
                  mismatch — batch {inr(latest.appliedSubtotal)} vs rows {inr(breakdown.appliedSubtotal)}.
                </span>
              )}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">SHA-256: {latest.fileSha256}</p>
          </SectionCard>

          {breakdown.notApplied.length > 0 ? (
            <SectionCard
              title={`Not carried forward (${breakdown.notApplied.length})`}
              description="Rows the owner did not confirm, or that could not be matched to a current student."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="py-2 pr-3">Old Adm#</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3 text-right">Due</th>
                      <th className="py-2 pr-3">Decision</th>
                      <th className="py-2 pr-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.notApplied.map((row) => (
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-mono text-xs">{row.sourceAdmissionNo ?? "—"}</td>
                        <td className="py-2 pr-3">{row.sourceName ?? "—"}</td>
                        <td className="py-2 pr-3 text-right">{row.prevYearDue != null ? inr(row.prevYearDue) : "—"}</td>
                        <td className="py-2 pr-3 capitalize">{row.ownerDecision.replace("_", " ")}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.skipReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Rollback" description="Scoped to carry-forward lines only.">
            <p className="text-sm text-muted-foreground">
              Carry-forward lines are identifiable by{" "}
              <code>installments.is_carry_forward = true</code> and the label{" "}
              <code>{CARRY_FORWARD_LABEL}</code>. To reverse this batch, delete those installments
              (they hold no payments). The pre-insert snapshot is saved alongside the import run.
            </p>
          </SectionCard>

          {batches.length > 1 ? (
            <SectionCard title="Earlier batches" description="Previous import runs.">
              <ul className="space-y-2 text-sm">
                {batches.slice(1).map((batch) => (
                  <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span>
                      {batch.sessionLabel} · {batch.fileName} ·{" "}
                      {batch.appliedAt ? new Date(batch.appliedAt).toLocaleDateString("en-IN") : "—"}
                    </span>
                    <span className="text-muted-foreground">
                      {batch.appliedRowCount} applied · {inr(batch.appliedSubtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
