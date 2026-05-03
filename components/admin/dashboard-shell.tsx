import { ReactNode } from "react";
import Link from "next/link";

import { type StaffRole } from "@/lib/auth/roles";
import { SchoolBrand } from "@/components/branding/school-brand";
import { schoolProfile } from "@/lib/config/school";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

import { AppTopBar } from "./app-topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";
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
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] border-r border-slate-200 bg-white print:hidden lg:block">
        <div className="brand-grid flex h-full flex-col gap-3 overflow-y-auto px-3 py-4">
          <Link
            href={homeHref}
            className="block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
          >
            <SchoolBrand variant="sidebar" priority />
            <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              {schoolProfile.shortName}
            </div>
          </Link>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <SidebarNav staffRole={staffRole} />
          </div>

          <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Fee Setup
            </p>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-5 text-slate-700">
              <li>Session: {policy.academicSessionLabel}</li>
              <li>Late fee: {formatInr(policy.lateFeeFlatAmount)}</li>
              <li>
                Due dates:{" "}
                {policy.installmentSchedule
                  .map((item) => item.dueDateLabel)
                  .join(", ")}
              </li>
            </ul>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-4 text-slate-600">
              Receipt prefix <span className="font-semibold text-slate-950">{policy.receiptPrefix}</span> is active across the payment desk and receipts.
            </div>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0 lg:ml-[250px] lg:h-screen lg:overflow-y-auto">
        <div className="relative min-w-0">
          <div className="relative z-10">
            <AppTopBar staffEmail={staffEmail} staffRole={staffRole} />
            <main className="mx-auto max-w-7xl px-4 py-5 print:max-w-none print:px-0 print:py-0 sm:px-6 lg:px-8 lg:py-6 mobile-bottom-nav-clearance md:pb-5 lg:pb-6">
              {children}
            </main>
            <MobileBottomNav staffRole={staffRole} />
          </div>
        </div>
      </div>
    </div>
  );
}
