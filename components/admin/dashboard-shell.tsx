import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import { SchoolBrand } from "@/components/branding/school-brand";
import { OfficeSyncListener } from "@/components/admin/office-sync-listener";
import { ShellDayCard, ShellDayCardSkeleton } from "@/components/admin/shell-day-card";
import {
  ShellSessionPill,
  ShellSessionPillSkeleton,
} from "@/components/admin/shell-session-pill";
import { SessionSwitchOverlayMount } from "@/components/admin/session-switch-overlay";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { EMPTY_SHELL_PULSE, getShellPulse } from "@/lib/dashboard/shell-metrics";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { SessionSwitchingProvider } from "@/lib/session/switching-context";

import { isLocaleSwitcherEnabled } from "@/lib/env";

import { AppTopBar } from "./app-topbar";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileTakeoverBar } from "./mobile-takeover-bar";
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

export function DashboardShell({
  children,
  staffEmail,
  staffRole,
  viewSessionLabel,
  viewSessionIsTest,
}: DashboardShellProps) {
  // Started, not awaited. This function used to `await Promise.all([...])` on
  // these three, which meant no chrome was emitted until all three came back —
  // and because the layout was blocked, the child route's `loading.tsx` could
  // not paint either. Every carefully shaped skeleton in this app only appeared
  // *after* the slow part was over. They now resolve inside their own Suspense
  // boundaries below, so the frame and the skeleton go out first.
  //
  // Each `.catch()` is doing two jobs. An unawaited promise that rejects is an
  // unhandled rejection, and separately: a failed shell read used to take down
  // the whole workspace. A missing "Day so far" figure is not a reason nobody
  // can reach the Payment Desk.
  const pulsePromise = getShellPulse(viewSessionLabel).catch(() => EMPTY_SHELL_PULSE);
  const receiptPrefixPromise = getFeePolicyForSession(viewSessionLabel)
    .then((policy) => policy.receiptPrefix)
    .catch(() => null);
  const sessionSwitcherPromise = getSessionSwitcherData().catch(() => ({
    activeSessionLabel: viewSessionLabel,
    availableSessions: [],
  }));
  const navCountsPromise = pulsePromise.then((pulse) => ({
    "/protected/payments": pulse.todayReceiptCount,
    "/protected/defaulters": pulse.overdueStudentCount,
  }));
  // The phone bar gets only the follow-up count, same as before. A badge on
  // Collect would read as "3 payments waiting", which is not a thing. Derived
  // from the same promise, so it costs no second read.
  const mobileNavCountsPromise = pulsePromise.then((pulse) => ({
    "/protected/defaulters": pulse.overdueStudentCount,
  }));

  const homeHref = getDefaultProtectedHref(staffRole);
  const localeSwitcher = isLocaleSwitcherEnabled() ? <LocaleSwitcher /> : null;
  // School time, not server time — the greeting must match the clock on the
  // office wall, and it must be right on first paint (no post-hydration swap).
  const schoolHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );

  return (
    <SessionSwitchingProvider>
      <div className="min-h-svh w-full overflow-x-clip bg-background text-foreground lg:h-screen lg:overflow-hidden">
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
          className="flex items-center gap-3 border-b border-nav-border px-4 py-4 transition-colors hover:bg-nav-hover focus-ring-ink"
        >
          <SchoolBrand variant="sidebar-ink" priority />
        </Link>

        {/* no-scrollbar: a light OS scrollbar track on the ink panel reads as
            a rendering fault once the nav list overflows a short viewport. */}
        <div className="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav staffRole={staffRole} tone="ink" countsPromise={navCountsPromise} />
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
          <Suspense fallback={<ShellDayCardSkeleton />}>
            <ShellDayCard pulse={pulsePromise} receiptPrefix={receiptPrefixPromise} />
          </Suspense>
        </footer>
      </aside>

      <div className="relative min-w-0 lg:ml-[232px] lg:h-screen lg:overflow-y-auto">
        <SessionSwitchOverlayMount />
        {/* No phone app bar (mobile v2). The design gives every screen its
            own header and keeps only the tab bar as shared chrome. What this
            bar used to carry now lives where a phone user looks for it:
            greeting + session pill + avatar on Home, and language, appearance,
            password and sign-out in Settings. */}
        <AppTopBar
          staffEmail={staffEmail}
          staffRole={staffRole}
          schoolHour={schoolHour}
          sessionPill={
            <Suspense
              fallback={
                <ShellSessionPillSkeleton
                  currentLabel={viewSessionLabel}
                  isTest={viewSessionIsTest}
                />
              }
            >
              <ShellSessionPill
                currentLabel={viewSessionLabel}
                isTest={viewSessionIsTest}
                sessions={sessionSwitcherPromise}
              />
            </Suspense>
          }
          localeSwitcher={localeSwitcher}
        />
        <ScrollRestoringMain
          /* The back bar lives INSIDE the scroll region so it can pin with
             sticky instead of position:fixed, and so main can be exactly
             100dvh — a bar above main would make the document taller than the
             viewport and reintroduce page scrolling. */
          mobileBar={<MobileTakeoverBar />}
          /* Full-bleed on phones: main IS the scroll region (mobile-app-main),
             so it owns the viewport height and its own bottom-nav clearance.
             Document padding here would double the inset and push content
             under the tab bar. */
          className="mx-auto max-w-7xl md:px-6 md:py-5 lg:px-8 lg:py-7 2xl:max-w-[88rem] md:pb-6 lg:pb-8 print:max-w-none print:px-0 print:py-0"
        >
          {/* Phone padding lives inside the scroll region, not on main —
              main is the 100dvh viewport and must not be inset. */}
          <div className="anim-fade-in px-4 py-4 md:px-0 md:py-0">{children}</div>
        </ScrollRestoringMain>
        {/* Phone bar badges: only the follow-up count. A badge on Collect
            would read as "3 payments waiting", which is not a thing. */}
        <MobileBottomNav
          staffRole={staffRole}
          staffEmail={staffEmail}
          countsPromise={mobileNavCountsPromise}
        />
      </div>
      </div>
    </SessionSwitchingProvider>
  );
}
