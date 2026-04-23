import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/lib/fees/types";
import { getMasterDataPageData } from "@/lib/master-data/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import { saveWorkbookFeeSetupAction } from "./actions";
import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import {
  copySessionAction,
  createClassAction,
  createRouteAction,
  createSessionAction,
  deleteClassAction,
  deleteRouteAction,
  deleteSessionAction,
  updateClassAction,
  updateRouteAction,
  updateSessionAction,
} from "@/app/protected/master-data/actions";

const INITIAL_MASTER_DATA_ACTION_STATE: MasterDataActionState = {
  status: "idle",
  message: "",
};

export default async function FeeSetupPage() {
  const [staff, data, masterData] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData(),
    getMasterDataPageData(),
  ]);

  const canEdit = hasStaffPermission(staff, "fees:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Fee setup"
        description="Manage academic sessions, fee policy, class fees, route fees, fee heads, and the live review/apply step on one cleaner admin page."
        actions={
          canEdit ? (
            <StatusBadge label="Admin editable" tone="good" />
          ) : (
            <StatusBadge label="View only" tone="warning" />
          )
        }
      />

      <FeeSetupClient
        data={data}
        masterData={{
          sessions: masterData.sessions,
          classes: masterData.classes,
          routes: masterData.routes,
        }}
        canEdit={canEdit}
        saveWorkbookFeeSetupAction={saveWorkbookFeeSetupAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
        initialMasterDataState={INITIAL_MASTER_DATA_ACTION_STATE}
        actions={{
          createSessionAction,
          updateSessionAction,
          deleteSessionAction,
          copySessionAction,
          createClassAction,
          updateClassAction,
          deleteClassAction,
          createRouteAction,
          updateRouteAction,
          deleteRouteAction,
        }}
      />
    </div>
  );
}
