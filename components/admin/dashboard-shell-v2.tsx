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
 * SHELL_V2 dashboard shell — P2.2.
 *
 * Differences from the V1 shell (components/admin/dashboard-shell.tsx):
 * - **Tighter sidebar**: 224px instead of 252px, denser footer block.
 * - **Header chip cluster**: the SessionPill renders inside a contiguous
 *   chip row in the top bar, visually grouped with the role badge.
 * - **Palette hint**: the AppTopBar's CommandTrigger already exposes the
 *   palette (Cmd/Ctrl+K) globally; V2 keeps it but pairs the hint label
 *   with a kbd accent so it's discoverable to office staff who haven't
 *   discovered the shortcut yet (the CommandTrigger component already
 *   renders the kbd; V2 simply doesn't add extra chrome around it).
 * - **Consistent spacing**: main content padding tightens from py-7 to
 *   py-6 on lg, matching the page-header rhythm everywhere.
 *
 * Role-aware navigation is unchanged — the SidebarNav already uses
 * `getVisibleProtectedNavigation(staffRole)`, so defaulter_followup sees
 * only Defaulters, teacher sees Students + Defaulters, etc.
 *
 * Old shell remains the fallback when SHELL_V2 is off (default in prod).
 */

type DashboardShellV2Props = {
  children: ReactNode;
  staffEmail: string;
  staffRole: StaffRole;
  viewSessionLabel: string;
  viewSessionIsTest: boolean;
};

export async function DashboardShellV2({
  children,
  staffEmail,
  staffRole,
  viewSessionLabel,
  viewSessionIsTest,
}: DashboardShellV2Props) {
  const [policy, sessionSwitcher] = await Promise.all([
    getFeePolicyForSession(viewSessionLabel),
    getSessionSwitcherData(),
  ]);
  const homeHref = getDefaultProtectedHref(staffRole);
  const localeSwitcher = isLocaleSwitcherEnabled() ? <LocaleSwitcher /> : null;

  return (
    <SessionSwitchingProvider>
      <div
        className="min-h-svh bg-background text-foreground lg:h-screen lg:overflow-hidden"
        data-shell="v2"
      >
        <Suspense fallback={null}>
          <RouteProgress />
          <OfficeSyncListener sessionLabel={viewSessionLabel} />
        </Suspense>

        {/* Sidebar — 224px (V2 is 28px tighter than V1's 252px) */}
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden w-[224px] border-r border-border bg-card print:hidden lg:flex lg:flex-col"
          aria-label="Workspace sidebar"
        >
          <Link
            href={homeHref}
            className="flex items-center gap-2.5 border-b border-border px-3 py-3 transition-colors hover:bg-surface-2"
          >
            <SchoolBrand variant="sidebar" priority />
          </Link>

          <div className="flex-1 overflow-y-auto px-1.5 py-2.5">
            <SidebarNav staffRole={staffRole} />
          </div>

          <footer className="border-t border-border px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <p className="flex items-center gap-2 text-foreground">
              <CalendarDays className="size-3.5 text-accent" aria-hidden="true" />
              <span className="font-medium">{viewSessionLabel}</span>
              {viewSessionIsTest ? (
                <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold uppercase text-warning-soft-foreground">
                  TEST
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground/80">
              Late fee {formatInr(policy.lateFeeFlatAmount)} · {policy.receiptPrefix}
            </p>
          </footer>
        </aside>

        <div className="relative min-w-0 lg:ml-[224px] lg:h-screen lg:overflow-y-auto">
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
            className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-7 lg:py-6 mobile-bottom-nav-clearance md:pb-6 lg:pb-7 print:max-w-none print:px-0 print:py-0"
          >
            <div className="anim-fade-in">{children}</div>
          </ScrollRestoringMain>
          <MobileBottomNav staffRole={staffRole} />
        </div>
      </div>
    </SessionSwitchingProvider>
  );
}
