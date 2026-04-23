import { PageHeader } from "@/components/admin/page-header";
import { MasterDataClient } from "@/components/master-data/master-data-client";
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
import { getMasterDataPageData } from "@/lib/master-data/data";
import { requireStaffPermission } from "@/lib/supabase/session";

const INITIAL_MASTER_DATA_ACTION_STATE: MasterDataActionState = {
  status: "idle",
  message: "",
};

export default async function MasterDataPage() {
  await requireStaffPermission("settings:write", { onDenied: "redirect" });
  const data = await getMasterDataPageData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="School Setup Lists"
        description="Manage academic sessions, classes, transport routes, custom fee heads, and payment modes in one place with safe delete guards."
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
