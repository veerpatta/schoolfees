import { DashboardShell } from "@/components/admin/dashboard-shell";
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

  return (
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
    </DashboardShell>
  );
}
