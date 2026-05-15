import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/lib/fees/types";
import { getMasterDataPageData } from "@/lib/master-data/data";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
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

export const revalidate = 60;

type FeeSetupPageProps = {
  searchParams?: Promise<{ session?: string }>;
};

export default async function FeeSetupPage({ searchParams }: FeeSetupPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const [staff, data, masterData] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData({ sessionLabel: viewSession.sessionLabel }),
    getMasterDataPageData(),
  ]);

  const canEdit =
    hasStaffPermission(staff, "fees:write") &&
    viewSession.sessionLabel === data.globalPolicy.academicSessionLabel;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Academic Year Fee Setup"
        description="Set yearly fees, due dates, class fees, transport fees, then review and publish."
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
        initialSelectedSessionLabel={viewSession.sessionLabel}
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
