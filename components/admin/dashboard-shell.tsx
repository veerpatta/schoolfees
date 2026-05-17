import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { CalendarDays, Coins } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import { SchoolBrand } from "@/components/branding/school-brand";
import { MobileSessionPill } from "@/components/admin/mobile-session-pill";
import { OfficeSyncListener } from "@/components/admin/office-sync-listener";
import { SessionPill } from "@/components/admin/session-pill";
import { SessionSwitchOverlayMount } from "@/components/admin/session-switch-overlay";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { SessionSwitchingProvider } from "@/lib/session/switching-context";

import { AppTopBar, MobileHeader } from "./app-topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { RouteProgress } from "./route-progress";
import { ScrollRestoringMain } from "./scroll-restoring-main";
import { SidebarNav } from "./sidebar-nav";

type DashboardShellProps = {
  children: ReactNode;
  staffEmail: string;
  staffRole: StaffRole;
  viewSessionLabel: string;
  viewSessionIsTest: boolean;
};

export async function DashboardShell({
  children,
  staffEmail,
  staffRole,
  viewSessionLabel,
  viewSessionIsTest,
}: DashboardShellProps) {
  const [policy, sessionSwitcher] = await Promise.all([
    getFeePolicyForSession(viewSessionLabel),
    getSessionSwitcherData(),
  ]);
  const homeHref = getDefaultProtectedHref(staffRole);

  return (
    <SessionSwitchingProvider>
      <div className="min-h-svh bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <Suspense fallback={null}>
        <RouteProgress />
        <OfficeSyncListener sessionLabel={viewSessionLabel} />
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
            <span className="font-medium">Viewing {viewSessionLabel}</span>
          </p>
          <p className="mt-1.5 flex items-center gap-2">
            <Coins className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Late fee {formatInr(policy.lateFeeFlatAmount)} · Receipt{" "}
            <span className="font-medium text-foreground">{policy.receiptPrefix}</span>
          </p>
        </footer>
      </aside>

      <div className="relative min-w-0 lg:ml-[252px] lg:h-screen lg:overflow-y-auto">
        <SessionSwitchOverlayMount />
        <MobileHeader
          staffEmail={staffEmail}
          staffRole={staffRole}
          sessionPill={
            <MobileSessionPill
              currentLabel={viewSessionLabel}
              isTest={viewSessionIsTest}
              initialSessions={sessionSwitcher.availableSessions}
            />
          }
          homeHref={homeHref}
        />
        <AppTopBar
          staffEmail={staffEmail}
          staffRole={staffRole}
          sessionPill={
            <SessionPill
              currentLabel={viewSessionLabel}
              isTest={viewSessionIsTest}
              initialSessions={sessionSwitcher.availableSessions}
            />
          }
        />
        <ScrollRestoringMain
          className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7 mobile-bottom-nav-clearance md:pb-6 lg:pb-8 print:max-w-none print:px-0 print:py-0"
        >
          <div className="anim-fade-in">{children}</div>
        </ScrollRestoringMain>
        <MobileBottomNav staffRole={staffRole} />
      </div>
      </div>
    </SessionSwitchingProvider>
  );
}
