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
        <details className="rounded-[28px] border border-slate-200 bg-white/80 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950">
            Supporting lists, fee heads, and payment modes
          </summary>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Open this only when you need to maintain sessions, classes, routes, custom fee heads,
            or allowed payment modes. Keeping it collapsed reduces scrolling in the main fee
            setup workflow.
          </p>
          <div className="mt-4">
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
        </details>
      ) : null}
    </div>
  );
}
