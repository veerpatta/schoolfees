"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SchoolBrand } from "@/components/branding/school-brand";
import { roleLabels, type StaffRole } from "@/lib/auth/roles";
import { getProtectedRouteMeta } from "@/lib/config/navigation";
import { schoolProfile } from "@/lib/config/school";

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
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/68 backdrop-blur-xl print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 lg:hidden">
                <SchoolBrand variant="icon" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
                {schoolProfile.shortName}
              </p>
              <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-slate-950">
                {routeMeta.label}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
                {routeMeta.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <StatusBadge label={roleLabels[staffRole]} tone="neutral" />
              <div className="rounded-full border border-white/70 bg-white/85 px-3 py-2 text-sm text-slate-700 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.4)]">
                {staffEmail}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/protected/password">Change password</Link>
              </Button>
              <LogoutButton />
            </div>
          </div>

          <SidebarNav staffRole={staffRole} mode="topbar" className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
