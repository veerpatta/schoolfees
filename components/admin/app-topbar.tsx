"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { roleLabels, type StaffRole } from "@/lib/auth/roles";
import { getProtectedRouteMeta } from "@/lib/config/navigation";

import { LogoutButton } from "../logout-button";
import { Button } from "../ui/button";
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
    <header className="z-20 border-b border-slate-200 bg-white print:hidden md:sticky md:top-0">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 md:py-3 lg:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-base font-semibold text-slate-950 sm:text-lg md:text-xl">
              {routeMeta.label}
            </h1>
            <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-600 md:block">
              {routeMeta.description}
            </p>
          </div>

          <div className="hidden flex-wrap items-center gap-2 sm:flex lg:justify-end">
            <StatusBadge label={roleLabels[staffRole]} tone="neutral" />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {staffEmail}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/password">Change password</Link>
            </Button>
            <LogoutButton />
          </div>
          <div className="sm:hidden">
            <details className="relative">
              <summary className="list-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                Actions
              </summary>
              <div className="absolute right-0 top-11 z-50 w-56 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <p className="truncate text-xs text-slate-500">{staffEmail}</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href="/protected/password">Change password</Link>
                </Button>
                <LogoutButton className="w-full justify-center" />
              </div>
            </details>
          </div>
        </div>

        <SidebarNav staffRole={staffRole} mode="topbar" className="mt-3 hidden md:grid lg:hidden" />
      </div>
    </header>
  );
}
