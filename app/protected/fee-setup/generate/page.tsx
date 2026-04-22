import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { GenerateLedgerClient } from "@/components/fees/generate-ledger-client";
import { WorkflowGuard } from "@/components/office/office-ui";
import { INITIAL_LEDGER_REGENERATION_ACTION_STATE } from "@/lib/fees/types";
import { getOfficeHomeData } from "@/lib/office/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { requireStaffPermission } from "@/lib/supabase/session";
import { runLedgerRegenerationAction } from "./actions";

export default async function GenerateLedgerPage() {
  const staff = await requireStaffPermission("fees:write", { onDenied: "redirect" });
  const [setup, home] = await Promise.all([getSetupWizardData(), getOfficeHomeData()]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const recentBatches = home.ledgerRegenerationBatches.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Ledger recalculation"
        description="Preview how the current fee policy will recalculate future and unpaid installment rows for the active academic session before you apply it."
      />

      {!readiness.recalculateLedgers.isReady ? (
        <WorkflowGuard
          title={readiness.recalculateLedgers.title}
          detail={readiness.recalculateLedgers.detail}
          actionLabel={readiness.recalculateLedgers.actionLabel}
          actionHref={readiness.recalculateLedgers.actionHref}
        />
      ) : null}

      {recentBatches.length > 0 ? (
        <SectionCard
          title="Recent recalculation batches"
          description="Existing preview and apply batches remain visible even when new recalculation is blocked."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {recentBatches.map((batch) => (
              <div key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">{batch.policyRevisionLabel}</p>
                <p className="mt-1 text-sm text-slate-600">{batch.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {batch.rowsRecalculated} rows recalculated, {batch.rowsRequiringReview} rows for review.
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {readiness.recalculateLedgers.isReady ? (
        <GenerateLedgerClient
          initialState={INITIAL_LEDGER_REGENERATION_ACTION_STATE}
          action={runLedgerRegenerationAction}
        />
      ) : null}
    </div>
  );
}
