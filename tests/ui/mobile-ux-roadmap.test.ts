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

    expect(paymentDesk).toContain("triggerHaptic([50, 30, 80])");
    expect(mobileSheet).toContain("min-h-11 min-w-[4rem]");
    expect(mobileSheet).toContain("text-center text-3xl font-bold text-accent");
    expect(mobileSheet).toContain("pattern=\"[0-9]*\"");
  });

  it("makes the dashboard mobile view complete instead of hiding secondary data", () => {
    const dashboard = readRepoFile("app/protected/dashboard/page.tsx");

    expect(dashboard).toContain("MobileSecondaryKpis");
    expect(dashboard).toContain("Total expected");
    expect(dashboard).toContain("Active students");
    expect(dashboard).toContain("This month");
    expect(dashboard).toContain("className=\"space-y-2 md:hidden\"");
    expect(dashboard).toContain("style={{ width: `${Math.min(100, row.collectionRate)}%` }}");
    expect(dashboard).toContain("Open Desk");
    expect(dashboard).toContain("bottom-[calc(var(--mobile-bottom-nav-offset)+12px)]");
    expect(dashboard).toContain("fromDate=${point.date}&toDate=${point.date}");
  });

  it("adds mobile WhatsApp follow-up and collapsible filters to Defaulters", () => {
    const defaulters = readRepoFile("app/protected/defaulters/page.tsx");
    const filters = readRepoFile("components/defaulters/defaulter-filters.tsx");

    expect(filters).toContain("activeFilterCount");
    expect(filters).toContain("Filters {activeFilterCount > 0");
    expect(filters).toContain("open={activeFilterCount > 0}");
    expect(defaulters).toContain("buildWhatsAppHref");
    expect(defaulters).toContain("https://wa.me/91");
    expect(defaulters).toContain("WhatsApp");
  });

  it("uses a More overflow tab for the eight-module mobile workspace", () => {
    const mobileNav = readRepoFile("components/admin/mobile-bottom-nav.tsx");
    const navigation = readRepoFile("lib/config/navigation.ts");

    expect(navigation).toContain("getMobilePrimaryNavigation");
    expect(mobileNav).toContain("More");
    expect(mobileNav).toContain("getVisibleProtectedNavigation(staffRole)");
    expect(mobileNav).toContain("overflowOpen");
    expect(mobileNav).toContain("aria-label=\"Open more workspace modules\"");
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

  it("does not add the out-of-scope server PDF route from the future roadmap", () => {
    expect(existsSync(join(process.cwd(), "app/protected/receipts/[receiptId]/pdf/route.ts"))).toBe(false);
  });
});
