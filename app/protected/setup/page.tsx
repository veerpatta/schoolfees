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
        eyebrow="Go-Live Setup"
        title="First-time setup and collection readiness"
        description="Use this admin-only wizard to initialize the active session, master data, fee defaults, ledger recalculation, and go-live checklist for Shri Veer Patta Senior Secondary School."
        actions={
          data.readiness.collectionDeskReady ? (
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
              <StatusBadge label="Collection desk ready" tone="good" />
              <Button asChild size="sm">
                <Link href="/protected/collections">Open Collections</Link>
              </Button>
            </div>
          ) : (
            <StatusBadge label="Setup in progress" tone="warning" />
          )
        }
      />

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
