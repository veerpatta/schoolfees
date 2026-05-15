import { DashboardShell } from "@/components/admin/dashboard-shell";
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

  return (
    <DashboardShell
      staffEmail={staff.email ?? "Authorized staff"}
      staffRole={staff.appRole}
      viewSessionLabel={resolvedSession.sessionLabel}
      viewSessionIsTest={resolvedSession.isTest}
    >
      {children}
    </DashboardShell>
  );
}
