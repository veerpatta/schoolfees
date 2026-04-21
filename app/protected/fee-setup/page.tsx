import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/lib/fees/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  saveClassDefaultsAction,
  saveSchoolDefaultsAction,
  saveStudentOverrideAction,
} from "./actions";

export default async function FeeSetupPage() {
  const [staff, data] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData(),
  ]);

  const canEdit = hasStaffPermission(staff, "fees:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="School, class, and student fee defaults"
        description="Manage school-wide defaults, per-class settings, and per-student overrides with clear, traceable save flows."
        actions={
          canEdit ? (
            <StatusBadge label="Admin write access" tone="good" />
          ) : (
            <StatusBadge label="Read-only mode" tone="warning" />
          )
        }
      />

      <FeeSetupClient
        data={data}
        canEdit={canEdit}
        saveSchoolDefaultsAction={saveSchoolDefaultsAction}
        saveClassDefaultsAction={saveClassDefaultsAction}
        saveStudentOverrideAction={saveStudentOverrideAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
      />
    </div>
  );
}
