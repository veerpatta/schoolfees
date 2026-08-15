import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile UX roadmap implementation", () => {
  it("serves a role-aware PWA manifest with the VPPS brand colors", () => {
    const layout = readRepoFile("app/layout.tsx");
    const staticManifest = readRepoFile("public/manifest.webmanifest");
    const apiManifest = readRepoFile("app/api/manifest/route.ts");

    expect(layout).toContain('manifest: "/api/manifest"');
    expect(staticManifest).toContain('"theme_color": "#c0521a"');
    expect(staticManifest).toContain('"background_color": "#faf9f6"');
    expect(apiManifest).toContain("getAuthenticatedStaff");
    expect(apiManifest).toContain("hasRolePermission(role, \"payments:write\")");
    expect(apiManifest).toContain("Payment Desk");
    expect(apiManifest).toContain("Cache-Control");
    expect(apiManifest).not.toContain('"Collect Payment"');
  });

  it("launches the PWA on the role's home rather than the /protected redirect hop", () => {
    const apiManifest = readRepoFile("app/api/manifest/route.ts");

    // `/protected` exists only to redirect() to the role's default route from a
    // Server Component. Pointing start_url at it put a render-time redirect on
    // every PWA launch, which is where SCHOOLFEES-8 ("Rendered more hooks than
    // during the previous render") fired. Keep the launch direct.
    expect(apiManifest).toContain("start_url: getDefaultProtectedHref(role)");
    expect(apiManifest).not.toContain('start_url: "/protected"');
  });

  it("adds runtime caching for mobile office shell data without caching writes", () => {
    const serviceWorker = readRepoFile("public/service-worker.js");

    expect(serviceWorker).toContain("RUNTIME_CACHE_VERSION");
    expect(serviceWorker).toContain("vpps-navigation-data-v1");
    expect(serviceWorker).toContain("vpps-student-index-v1");
    expect(serviceWorker).toContain("STALE_WHILE_REVALIDATE_TTL_MS");
    expect(serviceWorker).toContain("isRuntimeCacheRequest");
    expect(serviceWorker).toContain("cache.put(new Request(request.url), cachedResponse)");
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).not.toContain('url.pathname === "/protected/dashboard"');
  });

  it("keeps touch-sized mobile payment controls and the requested success haptic pattern", () => {
    const paymentDesk = readRepoFile("components/payments/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("components/payments/mobile-payment-flow-sheet.tsx");

    expect(paymentDesk).toContain(`triggerHaptic("success")`);
    // Touch-sized controls in the Ledger Calm composer: the mode segmented row
    // keeps a 48px minimum target and the amount echo renders display-size.
    expect(mobileSheet).toContain("min-h-12");
    // The amount echo and the input are now ONE element (mobile v2): the
    // field itself is the display-serif hero, so there is no second place
    // the figure could disagree with itself.
    expect(mobileSheet).toContain("font-display-money w-auto min-w-0 max-w-full bg-transparent text-[46px]");
    expect(mobileSheet).toContain('aria-label="Amount received"');
    expect(mobileSheet).toContain("pattern=\"[0-9]*\"");
  });

  it("makes the dashboard mobile view complete instead of hiding secondary data", () => {
    const dashboard = readRepoFile("app/protected/dashboard/page.tsx");
    // Dashboard copy now lives in the next-intl Dashboard namespace.
    const englishMessages = JSON.parse(readRepoFile("messages/en.json")) as {
      Dashboard: Record<string, string>;
    };

    expect(dashboard).toContain("MobileDashboardScreen");
    expect(englishMessages.Dashboard.totalExpected).toBe("Total expected");
    expect(englishMessages.Dashboard.activeStudents).toBe("Active students");
    expect(englishMessages.Dashboard.thisMonth).toBe("This month");
    // The phone home screen reads its copy from the MobileApp namespace, so
    // assert the keys here and the strings in the catalogues below. The year
    // card moved onto the Overview board when the phone gained the board
    // switcher, so "expected this year" is asserted against that file — the
    // figure still has to be on a phone, just not on the home screen.
    const mobileHome = readRepoFile("components/dashboard/mobile-dashboard-screen.tsx");
    const mobileBoards = readRepoFile("components/dashboard/mobile-boards.tsx");
    expect(mobileBoards).toContain('t("expectedThisYear")');
    expect(mobileHome).toContain('t("oldBalance")');
    expect(mobileHome).toContain('t("collectCta")');

    const mobileMessages = (
      JSON.parse(readRepoFile("messages/en.json")) as { MobileApp: Record<string, string> }
    ).MobileApp;
    expect(mobileMessages.expectedThisYear).toBe("Expected this year");
    expect(mobileMessages.oldBalance).toBe("Old balance");
    expect(mobileMessages.collectCta).toBe("Collect a fee");
    expect(dashboard).toContain("style={{ width: `${Math.min(100, row.collectionRate)}%` }}");
    expect(englishMessages.Dashboard.openDesk).toBe("Open Desk");
    expect(dashboard).toContain("bottom-[calc(var(--mobile-bottom-nav-offset)+12px)]");
    expect(dashboard).toContain("fromDate=${point.date}&toDate=${point.date}");
  });

  it("adds mobile WhatsApp follow-up and collapsible filters to Defaulters", () => {
    const defaulters = readRepoFile("app/protected/defaulters/page.tsx");
    const filters = readRepoFile("components/defaulters/defaulter-filters.tsx");
    const workspace = readRepoFile("components/defaulters/defaulters-workspace.tsx");
    const englishMessages = JSON.parse(readRepoFile("messages/en.json")) as {
      Defaulters: Record<string, string>;
    };

    expect(defaulters).toContain("activeFilterCount");
    expect(defaulters).toContain('t("callQueueFilterTitle"');
    expect(defaulters).toContain('t("filtersMobileToggleCount"');
    expect(filters).toContain("AutoSubmitForm");
    expect(filters).not.toContain("Apply filters");
    expect(englishMessages.Defaulters.filtersMobileToggleCount).toContain("Filters");
    expect(englishMessages.Defaulters.callQueueDescription).toContain("Call queue");
    // Mobile-first defaulters surface: workspace exposes a selected card,
    // one-tap WhatsApp, quick log, and a way to move through the queue.
    //
    // That last one used to be a sticky MobileNextBar. It is gone: it was
    // `lg:hidden` while the tab bar it cleared is `md:hidden`, so in the
    // 768-1023px band it reserved space for a bar that no longer existed; its
    // containing block ended before the page did, so it pinned and then
    // scrolled away; and it rendered as a dead grey slab when both buttons
    // were disabled. The design advances the queue two other ways, both of
    // which already existed underneath it.
    expect(defaulters).toContain("DefaultersWorkspace");
    expect(workspace).toContain("callQueueSkipForNow");
    expect(workspace).toContain("callQueueAutoAdvance");
    expect(workspace).not.toContain("MobileNextBar");
  });

  it("uses a More overflow tab for the eight-module mobile workspace", () => {
    const mobileNav = readRepoFile("components/admin/mobile-bottom-nav.tsx");
    const navigation = readRepoFile("lib/config/navigation.ts");

    expect(navigation).toContain("getMobilePrimaryNavigation");
    // The visible "More" label and the overflow's open/close aria-labels are
    // now driven by the next-intl Navigation namespace (see messages/en.json).
    expect(mobileNav).toContain("getMobileMoreGroups(staffRole)");
    expect(mobileNav).toContain("overflowOpen");
    expect(mobileNav).toContain('t("openMore")');
    expect(mobileNav).toContain('t("more")');
    expect(mobileNav).toContain("bg-accent/10 text-accent");
  });

  it("bumps the mobile session pill to a 44px touch target", () => {
    const sessionPill = readRepoFile("components/admin/mobile-session-pill.tsx");

    expect(sessionPill).toContain("h-11");
    expect(sessionPill).not.toContain("inline-flex h-8");
  });

  it("keeps Money tabular for all amount surfaces", () => {
    const money = readRepoFile("components/ui/money.tsx");

    expect(money).toContain("tabular");
  });

  // This used to assert the route did NOT exist — it was deliberately out of
  // scope for the mobile work, which shipped receipts as HTML plus
  // window.print(). The receipt PDF has since been built on purpose, so the
  // guard becomes a contract: it exists, and it is gated on the permission that
  // governs issuing a parent-facing receipt rather than merely reading one.
  it("serves the receipt PDF from a print-gated server route", () => {
    const routePath = "app/protected/receipts/[receiptId]/pdf/route.ts";
    expect(existsSync(join(process.cwd(), routePath))).toBe(true);

    const route = readRepoFile(routePath);
    expect(route).toContain('requireStaffPermission("receipts:print")');
    expect(route).toContain('export const runtime = "nodejs"');
    // @react-pdf reads font and logo files off disk; without a tracing entry the
    // route works locally and 500s on Vercel.
    expect(readRepoFile("next.config.ts")).toContain("/protected/receipts/[receiptId]/pdf");
  });
});
