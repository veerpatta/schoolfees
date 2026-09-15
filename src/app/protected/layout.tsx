import { CommandHost } from "@/ui/command/command-host";
import { KeyboardOffsetProvider } from "@/ui/system/keyboard-offset-provider";
import { DashboardShell } from "@/ui/shell/dashboard-shell";
import { getVisibleProtectedNavigation } from "@/platform/config/navigation";
import { getEnabledFeatures } from "@/platform/features/flags";
import { hasRolePermission } from "@/platform/auth/roles";
import { getAppMode } from "@/platform/env";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { requireAuthenticatedStaff } from "@/platform/supabase/session";

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
  // Resolved here, once, and passed down: the sidebar is a client component
  // and cannot read the database. An item gated on a flag this staff member
  // does not have is dropped before it reaches the browser at all, rather than
  // rendered and hidden.
  const enabledFeatures = await getEnabledFeatures({ id: staff.id, role: staff.appRole });
  const isTestDatabase = getAppMode() === "test";
  // CommandHost is a client component. ProtectedNavigationItem.icon is a
  // LucideIcon (React component) which can't cross the server→client
  // boundary in Next.js App Router. We strip icons here and pass plain
  // JSON-serializable data; the nav provider on the client re-attaches
  // a generic icon. (Bug repro: leaving the icon in causes the protected
  // layout to render the generic "Check the deployment environment values"
  // error fallback in prod.)
  const navigation = getVisibleProtectedNavigation(staff.appRole, enabledFeatures).map((item) => ({
    href: item.href,
    label: item.label,
    description: item.description,
    aliases: item.aliases,
  }));
  const canViewStudents = hasRolePermission(staff.appRole, "students:view");
  const canViewReceipts = hasRolePermission(staff.appRole, "receipts:view");

  const shellChildren = (
    <>
      <KeyboardOffsetProvider />
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
    </>
  );

  return (
    <DashboardShell
      staffEmail={staff.email ?? "Authorized staff"}
      staffRole={staff.appRole}
      enabledFeatures={enabledFeatures}
      viewSessionLabel={resolvedSession.sessionLabel}
      viewSessionIsTest={resolvedSession.isTest}
    >
      {shellChildren}
    </DashboardShell>
  );
}
