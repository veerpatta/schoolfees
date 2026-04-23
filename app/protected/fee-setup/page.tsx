import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { getFeeSetupPageData } from "@/lib/fees/data";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/lib/fees/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import { saveWorkbookFeeSetupAction } from "./actions";

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
        title="Workbook-style fee setup"
        description="Set the academic session, installment due dates, flat late fee, new/old academic fee, class-wise annual tuition, and route-wise annual transport fee on one direct admin screen."
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
    </div>
  );
}
