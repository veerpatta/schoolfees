"use client";

import { usePathname } from "next/navigation";

import { roleLabels, type StaffRole } from "@/lib/auth/roles";
import { getProtectedRouteMeta } from "@/lib/config/navigation";
import { schoolProfile } from "@/lib/config/school";

import { LogoutButton } from "../logout-button";
import { SidebarNav } from "./sidebar-nav";
import { StatusBadge } from "./status-badge";

type AppTopBarProps = {
  staffEmail: string;
  staffRole: StaffRole;
};

export function AppTopBar({ staffEmail, staffRole }: AppTopBarProps) {
  const pathname = usePathname();
  const routeMeta = getProtectedRouteMeta(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {schoolProfile.shortName}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                {routeMeta.label}
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {routeMeta.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatusBadge label={roleLabels[staffRole]} tone="neutral" />
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {staffEmail}
              </div>
              <LogoutButton />
            </div>
          </div>

          <SidebarNav mode="topbar" className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
