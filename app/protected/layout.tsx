import { CommandHost } from "@/components/command/command-host";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { CollectDrawer } from "@/components/payments/collect/collect-drawer";
import { CollectProvider } from "@/lib/payments/collect-context";
import { getVisibleProtectedNavigation } from "@/lib/config/navigation";
import { hasRolePermission } from "@/lib/auth/roles";
import { getAppMode } from "@/lib/env";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [staff, resolvedSession] = await Promise.all([
    requireAuthenticatedStaff(),
    getViewSessionCookie().then((cookieSession) =>
      resolveViewSession({ cookieSession }),
    ),
  ]);
  const isTestDatabase = getAppMode() === "test";
  const navigation = getVisibleProtectedNavigation(staff.appRole);
  const canViewStudents = hasRolePermission(staff.appRole, "students:view");
  const canViewReceipts = hasRolePermission(staff.appRole, "receipts:view");

  return (
    <CollectProvider>
      <DashboardShell
        staffEmail={staff.email ?? "Authorized staff"}
        staffRole={staff.appRole}
        viewSessionLabel={resolvedSession.sessionLabel}
        viewSessionIsTest={resolvedSession.isTest}
      >
        {isTestDatabase ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-destructive-foreground shadow-sm">
            TEST DATABASE - Staging deployment
          </div>
        ) : null}
        {children}
        <CommandHost
          navigation={navigation}
          canViewStudents={canViewStudents}
          canViewReceipts={canViewReceipts}
        />
        <CollectDrawer />
      </DashboardShell>
    </CollectProvider>
  );
}
