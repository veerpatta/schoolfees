import { ReactNode } from "react";
import Link from "next/link";

import { type StaffRole } from "@/lib/auth/roles";
import { schoolProfile } from "@/lib/config/school";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

import { AppTopBar } from "./app-topbar";
import { SidebarNav } from "./sidebar-nav";

type DashboardShellProps = {
  children: ReactNode;
  staffEmail: string;
  staffRole: StaffRole;
};

export async function DashboardShell({
  children,
  staffEmail,
  staffRole,
}: DashboardShellProps) {
  const policy = await getFeePolicySummary();
  const homeHref = getDefaultProtectedHref(staffRole);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f5ee_0%,#f1f5f9_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white/95 print:hidden lg:block">
          <div className="sticky top-0 flex h-screen flex-col px-4 py-5">
            <Link href={homeHref} className="block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {schoolProfile.shortName}
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950">
                Fee Admin
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">
                Simple office workflow for fees, payments, and dues.
              </p>
            </Link>

            <div className="mt-6">
              <SidebarNav staffRole={staffRole} />
            </div>

            <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Active Policy
              </p>
              <ul className="mt-2.5 space-y-1.5 text-sm leading-5 text-slate-700">
                <li>Session: {policy.academicSessionLabel}</li>
                <li>Late fee: {formatInr(policy.lateFeeFlatAmount)}</li>
                <li>
                  Due: {policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}
                </li>
              </ul>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <AppTopBar staffEmail={staffEmail} staffRole={staffRole} />
          <main className="mx-auto max-w-6xl px-4 py-4 print:max-w-none print:px-0 print:py-0 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
