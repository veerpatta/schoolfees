import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { ReadinessChecklist, SetupFlowList } from "@/components/setup/readiness-checklist";
import { SetupWizardClient } from "@/components/setup/setup-wizard-client";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getSetupWizardData } from "@/lib/setup/data";
import { INITIAL_SETUP_ACTION_STATE } from "@/lib/setup/types";

import {
  completeSetupStageAction,
  saveSetupClassDefaultsAction,
  saveSetupClassesAction,
  saveSetupPolicyAction,
  saveSetupRoutesAction,
  saveSetupSchoolDefaultsAction,
} from "./actions";

export default async function SetupPage() {
  await requireStaffPermission("settings:write", { onDenied: "redirect" });
  const data = await getSetupWizardData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="First-time Setup"
        title="First-time Setup and Collection Readiness"
        description="Use this only for first-time go-live preparation. For yearly fee changes, use Fee Setup."
        actions={
          <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
            {data.setupLocked ? (
              <StatusBadge label="Setup complete" tone="good" />
            ) : data.readiness.collectionDeskReady ? (
              <StatusBadge label="Collection desk ready" tone="good" />
            ) : (
              <StatusBadge label="Setup in progress" tone="warning" />
            )}
            <Button asChild size="sm">
              <Link href="/protected/fee-setup">Go to Fee Setup</Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Use this only for first-time go-live preparation. After setup is complete, yearly fee
        changes must go through Fee Setup so preview, publish, and audit logging stay attached.
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Readiness checklist"
          description="This checklist shows what is complete, what is still missing, and what blocks collections."
        >
          <ReadinessChecklist readiness={data.readiness} />
        </SectionCard>

        <SectionCard
          title="Operational path"
          description="The office should move through setup, import, review, ledger recalculation, and collections in this order."
        >
          <SetupFlowList items={data.flow} />
        </SectionCard>
      </section>

      <SetupWizardClient
        data={data}
        saveSetupPolicyAction={saveSetupPolicyAction}
        saveSetupClassesAction={saveSetupClassesAction}
        saveSetupRoutesAction={saveSetupRoutesAction}
        saveSetupSchoolDefaultsAction={saveSetupSchoolDefaultsAction}
        saveSetupClassDefaultsAction={saveSetupClassDefaultsAction}
        completeSetupStageAction={completeSetupStageAction}
        initialState={INITIAL_SETUP_ACTION_STATE}
      />
    </div>
  );
}
