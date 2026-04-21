import { ReactNode } from "react";

import { activeFeeRules } from "@/lib/config/fee-rules";
import { schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";

import { SidebarNav } from "./sidebar-nav";

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.12),_transparent_28%),linear-gradient(180deg,_#f8f4ea_0%,_#f7f7f7_45%,_#edf2f7_100%)] text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-4 py-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:px-6 lg:py-6">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[30px] border border-slate-200/80 bg-white/90 p-5 shadow-xl shadow-slate-200/40 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {schoolProfile.shortName}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Fee Operations
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Single-school internal workspace for admissions, fee planning,
              collections, and audit-safe reporting.
            </p>
            <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white">
              Internal admin only. No parent-facing access.
            </div>
            <div className="mt-6">
              <SidebarNav />
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200/80 bg-white/85 p-5 shadow-sm shadow-slate-200/60 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Active Defaults
            </p>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Late fee</p>
                <p className="mt-1 text-slate-600">
                  {formatInr(activeFeeRules.lateFeeFlatRupees)} flat
                </p>
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">Due dates</p>
                <p className="mt-1 text-slate-600">
                  {activeFeeRules.installmentDueDates.join(", ")}
                </p>
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-900">
                  Class 12 Science
                </p>
                <p className="mt-1 text-slate-600">
                  {formatInr(activeFeeRules.class12ScienceAnnualFeeRupees)}
                </p>
              </li>
            </ul>
          </div>
        </aside>

        <main className="rounded-[32px] border border-white/70 bg-white/88 p-4 shadow-2xl shadow-slate-200/60 backdrop-blur md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
