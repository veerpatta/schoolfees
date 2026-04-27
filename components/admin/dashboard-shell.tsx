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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.15),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_22%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_40%,#f8fbff_100%)] text-slate-900 lg:h-screen lg:overflow-hidden">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-white/60 bg-white/74 backdrop-blur-xl print:hidden lg:block">
        <div className="brand-grid flex h-full flex-col gap-4 overflow-y-auto px-4 py-5">
          <Link
            href={homeHref}
            className="glass-panel block rounded-[30px] p-4 transition duration-200 hover:-translate-y-0.5"
          >
            <SchoolBrand variant="sidebar" priority />
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Internal fee workspace for collection desks, workbook-style dues
              review, and audit-safe admin operations.
            </p>
            <div className="mt-3 inline-flex rounded-full border border-sky-100 bg-sky-50/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
              {schoolProfile.shortName}
            </div>
          </Link>

          <div className="glass-panel rounded-[28px] p-3">
            <SidebarNav staffRole={staffRole} />
          </div>

          <div className="mt-auto rounded-[28px] border border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(239,246,255,0.92))] p-4 shadow-[0_20px_50px_-30px_rgba(37,99,235,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
              Active Policy
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>Session: {policy.academicSessionLabel}</li>
              <li>Late fee: {formatInr(policy.lateFeeFlatAmount)}</li>
              <li>
                Due dates:{" "}
                {policy.installmentSchedule
                  .map((item) => item.dueDateLabel)
                  .join(", ")}
              </li>
            </ul>
            <div className="mt-4 rounded-2xl border border-sky-100 bg-white/85 px-3 py-2 text-xs leading-5 text-slate-600">
              Receipt prefix <span className="font-semibold text-slate-950">{policy.receiptPrefix}</span> is active across the payment desk and receipts.
            </div>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0 lg:ml-[264px] lg:h-screen lg:overflow-y-auto">
        <div className="relative min-w-0">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_58%)]" />
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
