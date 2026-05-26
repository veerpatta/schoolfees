import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { StaffManagementClient } from "@/components/staff/staff-management-client";
import {
  createStaffAccountAction,
  resetStaffPasswordAction,
  updateStaffAccountAction,
} from "@/app/protected/staff/actions";
import { staffRoles } from "@/lib/auth/roles";
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
  // All five roles (admin, accountant, teacher, fee_collector, view_only)
  // are first-class once the rebalance migration has shipped. No more
  // rollout flag — admins can assign any role from this page.
  const assignableRoles = staffRoles;

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
          <p className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
            Login can still work for already-seeded accounts. Admin staff
            management features stay blocked until the server-only service role
            key is configured.
          </p>
        </SectionCard>
      ) : (
        <StaffManagementClient
          currentStaffId={staff.id ?? staff.sub ?? ""}
          accounts={accounts}
          assignableRoles={assignableRoles}
          initialState={INITIAL_STAFF_FORM_ACTION_STATE}
          createStaffAccountAction={createStaffAccountAction}
          updateStaffAccountAction={updateStaffAccountAction}
          resetStaffPasswordAction={resetStaffPasswordAction}
        />
      )}
    </div>
  );
}
