import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Coins } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import { SchoolBrand } from "@/components/branding/school-brand";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

import { AppTopBar, MobileHeader } from "./app-topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { RouteProgress } from "./route-progress";
import { ScrollRestoringMain } from "./scroll-restoring-main";
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
    <div className="min-h-svh bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>

      {/* Sidebar (desktop) */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[252px] border-r border-border bg-card print:hidden lg:flex lg:flex-col"
        aria-label="Workspace sidebar"
      >
        <Link
          href={homeHref}
          className="flex items-center gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-surface-2"
        >
          <SchoolBrand variant="sidebar" priority />
        </Link>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav staffRole={staffRole} />
        </div>

        <footer className="border-t border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
          <p className="flex items-center gap-2 text-foreground">
            <CalendarDays className="size-3.5 text-accent" aria-hidden="true" />
            <span className="font-medium">Session {policy.academicSessionLabel}</span>
          </p>
          <p className="mt-1.5 flex items-center gap-2">
            <Coins className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Late fee {formatInr(policy.lateFeeFlatAmount)} · Receipt{" "}
            <span className="font-medium text-foreground">{policy.receiptPrefix}</span>
          </p>
        </footer>
      </aside>

      <div className="relative min-w-0 lg:ml-[252px] lg:h-screen lg:overflow-y-auto">
        <MobileHeader
          staffEmail={staffEmail}
          staffRole={staffRole}
          sessionLabel={policy.academicSessionLabel}
          homeHref={homeHref}
        />
        <AppTopBar staffEmail={staffEmail} staffRole={staffRole} />
        <ScrollRestoringMain
          className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7 mobile-bottom-nav-clearance md:pb-6 lg:pb-8 print:max-w-none print:px-0 print:py-0"
        >
          <div className="anim-fade-in">{children}</div>
        </ScrollRestoringMain>
        <MobileBottomNav staffRole={staffRole} />
      </div>
    </div>
  );
}
