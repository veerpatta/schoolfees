import { PageHeader } from "@/components/admin/page-header";
import { MasterDataClient } from "@/components/master-data/master-data-client";
import {
  createClassAction,
  createFeeHeadAction,
  createRouteAction,
  createSessionAction,
  deleteClassAction,
  deleteFeeHeadAction,
  deleteRouteAction,
  deleteSessionAction,
  INITIAL_MASTER_DATA_ACTION_STATE,
  setPaymentModeActiveAction,
  updateClassAction,
  updateFeeHeadAction,
  updateRouteAction,
  updateSessionAction,
} from "@/app/protected/master-data/actions";
import { getMasterDataPageData } from "@/lib/master-data/data";
import { requireStaffPermission } from "@/lib/supabase/session";

export default async function MasterDataPage() {
  await requireStaffPermission("settings:write", { onDenied: "redirect" });
  const data = await getMasterDataPageData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Master Data Management"
        description="Manage sessions, classes, routes, fee heads, and payment modes from one source of truth with safe delete guards and inactive flows."
      />

      <MasterDataClient
        sessions={data.sessions}
        classes={data.classes}
        routes={data.routes}
        feeHeads={data.feeHeads}
        paymentModes={data.paymentModes}
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
  );
}
