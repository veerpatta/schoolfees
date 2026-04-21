import { DashboardShell } from "@/components/admin/dashboard-shell";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireAuthenticatedStaff();

  return (
    <DashboardShell
      staffEmail={staff.email ?? "Authorized staff"}
      staffRole={staff.appRole}
    >
      {children}
    </DashboardShell>
  );
}
