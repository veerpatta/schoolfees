import Link from "next/link";

import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
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
        title="Live fee rules and defaults"
        description="Update fee rules, school defaults, class defaults, route defaults, and student exceptions with review-first safety before anything changes live."
        actions={
          canEdit ? (
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              <StatusBadge label="Admin write access" tone="good" />
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
        canEdit={canEdit}
        saveGlobalPolicyAction={saveGlobalPolicyAction}
        saveSchoolDefaultsAction={saveSchoolDefaultsAction}
        saveClassDefaultsAction={saveClassDefaultsAction}
        saveTransportDefaultsAction={saveTransportDefaultsAction}
        saveStudentOverrideAction={saveStudentOverrideAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
      />
    </div>
  );
}
