import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { StaffManagementClient } from "@/components/staff/staff-management-client";
import {
  createStaffAccountAction,
  resetStaffPasswordAction,
  updateStaffAccountAction,
} from "@/app/protected/staff/actions";
import {
  INITIAL_STAFF_FORM_ACTION_STATE,
  isStaffManagementConfigured,
  listStaffAccounts,
} from "@/lib/staff-management/data";
import { requireStaffPermission } from "@/lib/supabase/session";

export default async function StaffPage() {
  const staff = await requireStaffPermission("staff:manage", {
    onDenied: "redirect",
  });
  const staffManagementConfigured = isStaffManagementConfigured();
  const accounts = staffManagementConfigured ? await listStaffAccounts() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Staff account management"
        description="Create internal staff accounts, assign roles, reset passwords, and deactivate access without exposing a public signup path."
        actions={<StatusBadge label="Admin only" tone="accent" />}
      />

      {!staffManagementConfigured ? (
        <SectionCard
          title="Server-side staff admin is not configured"
          description="Add SUPABASE_SERVICE_ROLE_KEY to the server environment before using staff account creation, password resets, or bootstrap provisioning."
        >
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Login can still work for already-seeded accounts. Admin staff
            management features stay blocked until the server-only service role
            key is configured.
          </p>
        </SectionCard>
      ) : (
        <StaffManagementClient
          currentStaffId={staff.id ?? staff.sub ?? ""}
          accounts={accounts}
          initialState={INITIAL_STAFF_FORM_ACTION_STATE}
          createStaffAccountAction={createStaffAccountAction}
          updateStaffAccountAction={updateStaffAccountAction}
          resetStaffPasswordAction={resetStaffPasswordAction}
        />
      )}
    </div>
  );
}
