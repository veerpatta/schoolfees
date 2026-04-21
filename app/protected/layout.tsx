import { AuthButton } from "@/components/auth-button";
import { DashboardShell } from "@/components/admin/dashboard-shell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Internal Staff Panel
          </p>
          <p className="text-sm text-slate-600">
            Only authorized school office and accounts users should access this
            area.
          </p>
        </div>
        <AuthButton />
      </div>
      {children}
    </DashboardShell>
  );
}
