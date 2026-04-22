import { PageHeader } from "@/components/admin/page-header";
import { MasterDataClient } from "@/components/master-data/master-data-client";
import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import {
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
        title="Master Data Management"
        description="Manage sessions, classes, and routes from one source of truth with safe delete guards. Live fee-head and payment-mode policy changes now run through fee setup so preview/apply logging stays consistent."
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
        }}
      />
    </div>
  );
}
