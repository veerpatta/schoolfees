import { AuthButton } from "@/components/auth-button";
import { DashboardShell } from "@/components/admin/dashboard-shell";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthenticatedStaff();

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Internal Staff Panel
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Only authorized school office and accounts users should access
              this area.
            </p>
          </div>
          <AuthButton />
        </div>
        {children}
      </div>
    </DashboardShell>
  );
}
