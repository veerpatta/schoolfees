import Link from "next/link";

import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { getMasterDataPageData } from "@/lib/master-data/data";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/lib/fees/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  saveGlobalPolicyAction,
  saveClassDefaultsAction,
  saveSchoolDefaultsAction,
  saveStudentOverrideAction,
  saveTransportDefaultsAction,
} from "./actions";
import {
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  createClassAction,
  updateClassAction,
  deleteClassAction,
  createRouteAction,
  updateRouteAction,
  deleteRouteAction,
} from "../master-data/actions";

export default async function FeeSetupPage() {
  const [staff, data, structureData] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData(),
    getMasterDataPageData(),
  ]);

  const canEdit = hasStaffPermission(staff, "fees:write");
  const canStructureEdit = hasStaffPermission(staff, "settings:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Setup"
        title="Live fee rules and defaults"
        description="Set the school year, classes, transport routes, academic fees, other fee types, installments, due dates, late fee, and saved defaults in one clearer admin workflow."
        actions={
          canEdit || canStructureEdit ? (
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              <StatusBadge
                label={canStructureEdit ? "Admin write access" : "Fee-only write access"}
                tone="good"
              />
              <Button asChild size="sm">
                <Link href="/protected/fee-setup/generate">Recalculate Dues</Link>
              </Button>
            </div>
          ) : (
            <StatusBadge label="Read-only mode" tone="warning" />
          )
        }
      />

      <FeeSetupClient
        data={data}
        structureData={structureData}
        canEdit={canEdit}
        canStructureEdit={canStructureEdit}
        saveGlobalPolicyAction={saveGlobalPolicyAction}
        saveSchoolDefaultsAction={saveSchoolDefaultsAction}
        saveClassDefaultsAction={saveClassDefaultsAction}
        saveTransportDefaultsAction={saveTransportDefaultsAction}
        saveStudentOverrideAction={saveStudentOverrideAction}
        createSessionAction={createSessionAction}
        updateSessionAction={updateSessionAction}
        deleteSessionAction={deleteSessionAction}
        createClassAction={createClassAction}
        updateClassAction={updateClassAction}
        deleteClassAction={deleteClassAction}
        createRouteAction={createRouteAction}
        updateRouteAction={updateRouteAction}
        deleteRouteAction={deleteRouteAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
        structureInitialState={{ status: "idle", message: "" }}
      />
    </div>
  );
}
