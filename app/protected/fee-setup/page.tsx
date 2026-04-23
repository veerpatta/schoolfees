import { MasterDataClient } from "@/components/master-data/master-data-client";
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
  createClassAction,
  createFeeHeadAction,
  createRouteAction,
  createSessionAction,
  deleteClassAction,
  deleteFeeHeadAction,
  deleteRouteAction,
  deleteSessionAction,
  setPaymentModeActiveAction,
  updateClassAction,
  updateFeeHeadAction,
  updateRouteAction,
  updateSessionAction,
} from "@/app/protected/master-data/actions";

const INITIAL_MASTER_DATA_ACTION_STATE: MasterDataActionState = {
  status: "idle",
  message: "",
};

export default async function FeeSetupPage() {
  const [staff, data] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData(),
  ]);

  const canEdit = hasStaffPermission(staff, "fees:write");
  const canManageSupportingLists = hasStaffPermission(staff, "settings:write");
  const masterData = canManageSupportingLists ? await getMasterDataPageData() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Workbook-style fee setup"
        description="Set the academic session, installment count, due dates, flat late fee, new/old academic fee, class-wise annual tuition, route-wise annual transport fee, and supporting fee lists on one direct admin screen."
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
        canEdit={canEdit}
        saveWorkbookFeeSetupAction={saveWorkbookFeeSetupAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
      />

      {masterData ? (
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white/70 px-5 py-4 text-sm leading-6 text-slate-600">
            Supporting lists live in the same fee setup area for convenience: academic sessions,
            classes, transport routes, custom fee heads, and accepted payment modes.
          </div>
          <MasterDataClient
            sessions={masterData.sessions}
            classes={masterData.classes}
            routes={masterData.routes}
            feeHeads={masterData.feeHeads}
            paymentModes={masterData.paymentModes}
            initialActionState={INITIAL_MASTER_DATA_ACTION_STATE}
            actions={{
              createSessionAction,
              updateSessionAction,
              deleteSessionAction,
              createClassAction,
              updateClassAction,
              deleteClassAction,
              createRouteAction,
              updateRouteAction,
              deleteRouteAction,
              createFeeHeadAction,
              updateFeeHeadAction,
              deleteFeeHeadAction,
              setPaymentModeActiveAction,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
