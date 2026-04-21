import { ReactNode } from "react";
import Link from "next/link";

import { type StaffRole } from "@/lib/auth/roles";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";

import { AppTopBar } from "./app-topbar";
import { SidebarNav } from "./sidebar-nav";

type DashboardShellProps = {
  children: ReactNode;
  staffEmail: string;
  staffRole: StaffRole;
};

export function DashboardShell({
  children,
  staffEmail,
  staffRole,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f5ee_0%,#f1f5f9_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white/95 lg:block">
          <div className="sticky top-0 flex h-screen flex-col px-5 py-6">
            <Link href="/protected" className="block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {schoolProfile.shortName}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                Fee Admin
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Internal school workspace for fee setup, payment entry, and
                daily follow-up.
              </p>
            </Link>

            <div className="mt-8">
              <SidebarNav />
            </div>

            <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Active Policy
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                <li>Late fee: {formatInr(activeFeeRules.lateFeeFlatRupees)}</li>
                <li>
                  Due dates: {activeFeeRules.installmentDueDates.join(", ")}
                </li>
                <li>Mode: internal-admin</li>
              </ul>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <AppTopBar staffEmail={staffEmail} staffRole={staffRole} />
          <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
