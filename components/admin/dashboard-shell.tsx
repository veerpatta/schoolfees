import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import { SchoolBrand } from "@/components/branding/school-brand";
import { MobileSessionPill } from "@/components/admin/mobile-session-pill";
import { OfficeSyncListener } from "@/components/admin/office-sync-listener";
import { SessionPill } from "@/components/admin/session-pill";
import { SessionSwitchOverlayMount } from "@/components/admin/session-switch-overlay";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { getShellPulse } from "@/lib/dashboard/shell-metrics";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { SessionSwitchingProvider } from "@/lib/session/switching-context";

import { isLocaleSwitcherEnabled } from "@/lib/env";

import { AppTopBar, MobileHeader } from "./app-topbar";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { RouteProgress } from "./route-progress";
import { ScrollRestoringMain } from "./scroll-restoring-main";
import { SidebarNav } from "./sidebar-nav";

/**
 * "Ledger Calm 2.0" workspace shell.
 *
 * - Ink sidebar (232px, bg --nav) with grouped navigation: the four daily
 *   screens on top, records below; live count pills for Payment Desk
 *   (receipts today) and Defaulters (overdue students).
 * - Sidebar footer is a "Day so far" card: today's collected total in the
 *   display serif + receipt count, so the desk clerk always sees the day's
 *   money without leaving the current screen.
 */

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
  const [policy, sessionSwitcher, pulse] = await Promise.all([
    getFeePolicyForSession(viewSessionLabel),
    getSessionSwitcherData(),
    getShellPulse(viewSessionLabel),
  ]);
  const homeHref = getDefaultProtectedHref(staffRole);
  const localeSwitcher = isLocaleSwitcherEnabled() ? <LocaleSwitcher /> : null;
  const navCounts: Record<string, number> = {
    "/protected/payments": pulse.todayReceiptCount,
    "/protected/defaulters": pulse.overdueStudentCount,
  };

  return (
    <SessionSwitchingProvider>
      <div className="min-h-svh bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <Suspense fallback={null}>
        <RouteProgress />
        <OfficeSyncListener sessionLabel={viewSessionLabel} />
      </Suspense>

      {/* Sidebar (desktop) — ink surface */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-nav-border bg-nav text-nav-foreground print:hidden lg:flex lg:flex-col"
        aria-label="Workspace sidebar"
      >
        <Link
          href={homeHref}
          className="flex items-center gap-3 border-b border-nav-border px-4 py-4 transition-colors hover:bg-nav-hover"
        >
          <SchoolBrand variant="sidebar-ink" priority />
        </Link>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav staffRole={staffRole} tone="ink" counts={navCounts} />
        </div>

        <footer className="border-t border-nav-border px-3 py-3">
          <p className="flex items-center gap-2 px-1 text-xs leading-5 text-nav-muted">
            <CalendarDays className="size-3.5 text-accent" aria-hidden="true" />
            <span className="font-medium text-nav-foreground">{viewSessionLabel}</span>
            {viewSessionIsTest ? (
              <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold uppercase text-warning-soft-foreground">
                TEST
              </span>
            ) : null}
          </p>
          {/* Day so far */}
          <div className="mt-2 rounded-xl bg-nav-surface px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-muted">
              Day so far
            </p>
            <p className="font-display-money mt-0.5 text-xl leading-tight text-nav-foreground">
              {formatInr(pulse.todayTotalAmount)}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-nav-muted">
              {pulse.todayReceiptCount === 1
                ? "1 receipt today"
                : `${pulse.todayReceiptCount} receipts today`}
              {" · "}
              {policy.receiptPrefix}
            </p>
          </div>
        </footer>
      </aside>

      <div className="relative min-w-0 lg:ml-[232px] lg:h-screen lg:overflow-y-auto">
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
          localeSwitcher={localeSwitcher}
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
          localeSwitcher={localeSwitcher}
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
