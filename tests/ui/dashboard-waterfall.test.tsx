import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1 — proves the dashboard page no longer serialises its two independent
 * reads (aboveFold + today's activity counts). Rather than a flaky wall-clock
 * assertion we record an ordered event log: if the reads run concurrently,
 * `activity:start` is observed BEFORE `aboveFold:end`. If they were chained,
 * `aboveFold:end` would come first.
 *
 * Building the page element with the mocked data also exercises the refactored
 * data flow end-to-end (the synchronous prop expressions read kpis /
 * collectionTrend), so a successful build is a correctness check too.
 */

const events: string[] = [];

const requireStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();
const getViewSessionCookie = vi.fn();
const resolveViewSession = vi.fn();
const getDashboardAboveFoldData = vi.fn();
const getDashboardPageData = vi.fn();
const getRouteCollectionSummary = vi.fn();
const scheduleDashboardAutoPrepare = vi.fn();
const getTodayActivityCounts = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
  );
  return {
    getTranslations: async (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace }),
  };
});

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/lib/session/cookie", () => ({ getViewSessionCookie }));
vi.mock("@/lib/session/resolver", () => ({ resolveViewSession }));

vi.mock("@/lib/dashboard/data", () => ({
  getDashboardAboveFoldData,
  getDashboardPageData,
  getRouteCollectionSummary,
  scheduleDashboardAutoPrepare,
}));

vi.mock("@/lib/activity/events", () => ({ getTodayActivityCounts }));

const KPIS = {
  totalStudents: 560,
  totalCollected: 1_000_000,
  totalExpectedFees: 2_000_000,
  totalPending: 1_000_000,
  todaysCollection: 50_000,
  receiptsToday: 12,
  collectionRate: 50,
  overdueAmount: 200_000,
  thisMonthCollection: 300_000,
};

const ABOVE_FOLD = {
  currentSession: "TEST-2026-27",
  currentInstallment: {
    label: "Installment 1",
    dueDate: "2026-04-20T00:00:00.000Z",
    status: "due" as const,
  },
  generatedAt: "2026-05-31T06:00:00.000Z",
  kpis: KPIS,
  todayPaymentModeBreakdown: [],
  recentPayments: [],
  followUpQueue: [],
  emptyState: { hasStudents: true, hasReceipts: true, hasFinancialData: true },
  studentsWithPending: 40,
  totalRefundDue: 0,
  canPostPayments: true,
  collectionTrend: [],
  loadWarnings: [],
  syncError: false,
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("dashboard data waterfall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events.length = 0;
    requireStaffPermission.mockResolvedValue({ id: "staff-1", appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
    getViewSessionCookie.mockResolvedValue("TEST-2026-27");
    resolveViewSession.mockResolvedValue({ sessionLabel: "TEST-2026-27" });
    getDashboardAboveFoldData.mockImplementation(async () => {
      events.push("aboveFold:start");
      await delay(40);
      events.push("aboveFold:end");
      return ABOVE_FOLD;
    });
    getTodayActivityCounts.mockImplementation(async () => {
      events.push("activity:start");
      await delay(40);
      events.push("activity:end");
      return { payments: 3 };
    });
  });

  it("runs aboveFold and today's activity counts concurrently", async () => {
    const { default: DashboardPage } = await import("@/app/protected/dashboard/page");
    const element = await DashboardPage({ searchParams: Promise.resolve({}) });

    // The element built without throwing — the refactored data flow is intact.
    expect(element).toBeTruthy();
    expect(getDashboardAboveFoldData).toHaveBeenCalledTimes(1);
    expect(getTodayActivityCounts).toHaveBeenCalledTimes(1);

    // Concurrency: activity started before aboveFold finished. If the reads
    // were still chained, aboveFold:end would precede activity:start.
    const activityStart = events.indexOf("activity:start");
    const aboveFoldEnd = events.indexOf("aboveFold:end");
    expect(activityStart).toBeGreaterThanOrEqual(0);
    expect(aboveFoldEnd).toBeGreaterThanOrEqual(0);
    expect(activityStart).toBeLessThan(aboveFoldEnd);
  });

  it("resolves the view session before fetching protected dashboard data", async () => {
    const { default: DashboardPage } = await import("@/app/protected/dashboard/page");
    await DashboardPage({ searchParams: Promise.resolve({}) });

    // Auth gate must precede the protected reads.
    const authOrder = requireStaffPermission.mock.invocationCallOrder[0];
    const aboveFoldOrder = getDashboardAboveFoldData.mock.invocationCallOrder[0];
    expect(authOrder).toBeLessThan(aboveFoldOrder);
    expect(resolveViewSession).toHaveBeenCalledWith({
      searchParamSession: undefined,
      cookieSession: "TEST-2026-27",
    });
  });
});
