import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MobileDashboardBoards } from "@/components/dashboard/mobile-boards";
import { DASHBOARD_VIEWS, type DashboardAnalytics } from "@/lib/dashboard/analytics";
import type { DashboardPageData } from "@/lib/dashboard/data";
import type { DashboardKpis } from "@/lib/dashboard/summary";
import type { RepaymentDashboardSummary } from "@/lib/repayment-plans/data";

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), "src/messages", "en.json"), "utf-8"),
  );
  return {
    getTranslations: async (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace }),
  };
});

function readRepoFile(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

/** The same trimmed live payload the desk board test uses. */
const ANALYTICS: DashboardAnalytics = {
  sessionLabel: "2026-27",
  debtAge: [
    { bucket: "0-30", feesPending: 2354894, rows: 407, students: 407 },
    { bucket: "90+", feesPending: 1939085, rows: 316, students: 316 },
  ],
  lateFee: {
    charged: 866000,
    waived: 850000,
    pending: 12000,
    studentsWithPending: 12,
    byWaiverSource: [
      { source: "grandfather", rows: 750, students: 442, amount: 750000 },
      { source: "migration", rows: 100, students: 81, amount: 100000 },
    ],
    nextAccrual: { dueDate: "2026-10-20", amount: 458000, installments: 458 },
  },
  monthlyCollection: [
    {
      month: "2026-04",
      amount: 921785,
      receipts: 116,
      students: 95,
      byMode: { cash: 671798, upi: 213987 },
    },
    {
      month: "2026-07",
      amount: 1205875,
      receipts: 132,
      students: 126,
      byMode: { cash: 745375, upi: 103500 },
    },
  ],
  classRecovery: [
    {
      classId: "class-1",
      classLabel: "Class 1",
      expected: 500000,
      collected: 150000,
      feesPending: 350000,
      lateFeePending: 2000,
      studentsAtRisk: 30,
      students: 40,
      recoveryRate: 30,
    },
  ],
  routeRecovery: [
    {
      routeId: "route-1",
      routeLabel: "Amet Bus",
      studentCount: 86,
      expectedAmount: 1979600,
      collectedAmount: 491000,
      pendingAmount: 1489600,
      collectionRate: 25,
    },
  ],
  concentration: {
    studentsWithDues: 484,
    totalPending: 9945416,
    top10Amount: 406900,
    top10Pct: 4,
    top50Amount: 1805200,
    top50Pct: 18,
  },
  discounts: {
    totalDiscount: 1362600,
    conventionalDiscount: 1305500,
    manualDiscount: 57100,
    studentsWithDiscount: 100,
    byPolicy: [
      { label: "RTE", students: 46, amount: 887000 },
      { label: "Staff Child", students: 17, amount: 192500 },
      { label: "3rd Child Policy", students: 14, amount: 182500 },
      { label: "Staff Child, 3rd Child Policy", students: 2, amount: 24500 },
      { label: "RTE, 3rd Child Policy", students: 1, amount: 19000 },
    ],
    closeouts: { amount: 0, students: 0 },
  },
};

const KPIS = {
  totalStudents: 507,
  totalExpectedFees: 13242175,
  totalCollected: 2900000,
  totalPending: 10558591,
  currentYearExpected: 13242175,
  currentYearCollected: 8660000,
  currentYearPending: 3120000,
  previousYearOriginal: 1860000,
  previousYearCollected: 1190000,
  previousYearPending: 670000,
  lateFeePending: 12000,
  overdueAmount: 2840000,
  todaysCollection: 124500,
  thisMonthCollection: 480000,
  receiptsToday: 18,
  collectionRate: 61,
} satisfies DashboardKpis;

const PAGE_DATA = {
  currentSession: "2026-27",
  currentInstallment: { label: "Installment 2", dueDate: "2026-07-20", status: "overdue" },
  generatedAt: "2026-08-14T04:00:00.000Z",
  kpis: KPIS,
  collectionTrend: [],
  // Two days with money and a gap between them, so the padded series is five
  // days long and the average has to divide by five.
  collectionHeatmap: [
    { date: "2026-08-10", amount: 120000 },
    { date: "2026-08-12", amount: 300000 },
    { date: "2026-08-14", amount: 124500 },
  ],
  classSummary: [
    {
      classId: "class-1",
      sessionLabel: "2026-27",
      classLabel: "Class 1",
      totalStudents: 40,
      studentsWithGeneratedDues: 40,
      missingDuesStudents: 0,
      expectedAmount: 500000,
      collectedAmount: 150000,
      pendingAmount: 350000,
      overdueAmount: 120000,
      overdueStudents: 22,
      studentsWithPending: 30,
      collectionRate: 30,
    },
  ],
  installmentSummary: [
    {
      installmentNo: 1,
      installmentLabel: "Installment 1",
      dueDate: "2026-04-20",
      studentCount: 481,
      expectedAmount: 4390000,
      collectedAmount: 4210000,
      pendingAmount: 180000,
      overdueAmount: 0,
      collectionRate: 96,
    },
  ],
  classInstallmentMatrix: [
    {
      classId: "class-1",
      classLabel: "Class 1",
      installments: [
        { installmentNo: 1, installmentLabel: "Installment 1", pendingAmount: 0 },
        { installmentNo: 2, installmentLabel: "Installment 2", pendingAmount: 180000 },
      ],
      totalPendingAmount: 180000,
    },
  ],
  followUpQueue: [],
  recentPayments: [],
  todayPaymentModeBreakdown: [],
  alerts: [],
  emptyState: { hasStudents: true, hasClasses: true, hasFeeSettings: true, hasReceipts: true },
  loadWarnings: [],
  totalStudents: 507,
  totalDue: 13242175,
  totalCollected: 8660000,
  totalPending: 3120000,
  totalRefundDue: 0,
  overdueInstallmentCount: 316,
  studentsWithPending: 440,
  paidStudents: 17,
  partlyPaidStudents: 24,
  overdueStudents: 440,
  notStartedStudents: 0,
  systemSyncHealth: null,
  syncError: false,
} as unknown as DashboardPageData;

const EMI = {
  sessionLabel: "2026-27",
  activePlans: 34,
  onTrack: 21,
  dueNow: 9,
  missed: 4,
  completed: 3,
  planReviewNeeded: 0,
  openingBalanceTotal: 1500000,
  remainingTotal: 1130000,
  catchUpTotal: 78000,
  expectedThisMonth: 240000,
  collectedThisMonth: 162000,
  topPriorityStudents: [],
} satisfies RepaymentDashboardSummary;

async function renderBoard(
  view: (typeof DASHBOARD_VIEWS)[number],
  overrides: Partial<{ analytics: DashboardAnalytics; data: DashboardPageData }> = {},
) {
  const element = await MobileDashboardBoards({
    view,
    sessionLabel: "2026-27",
    kpis: KPIS,
    data: overrides.data ?? PAGE_DATA,
    analytics: overrides.analytics ?? ANALYTICS,
    emiSummary: EMI,
    collectionWindowDays: 14,
    todayIso: "2026-08-14",
  });
  return renderToStaticMarkup(element);
}

describe("phone analytics boards", () => {
  it("carries the same boards as the desk, off the same view names", async () => {
    for (const view of DASHBOARD_VIEWS) {
      const html = await renderBoard(view);
      // Every board ends with the read-only note, so a board that rendered
      // nothing at all is still distinguishable from one that threw.
      expect(html).toContain("Nothing here can be edited.");
    }
  });

  it("the discounts board keeps the write-off out of the discount total", async () => {
    const html = await renderBoard("discounts");

    // The reconciling split, from the live fixture.
    expect(html).toContain("13,62,600");
    expect(html).toContain("13,05,500");
    expect(html).toContain("57,100");
    expect(html).toContain("not a payment");

    // Per-policy rows, including the combined label.
    expect(html).toContain("RTE");
    expect(html).toContain("Staff Child, 3rd Child Policy");

    // Zero close-outs: the card simply does not render, rather than showing a
    // Rs 0 that reads like a measurement.
    expect(html).not.toContain("Written off as discount");
  });

  it("puts the year card on Overview, where the phone home used to carry it", async () => {
    const html = await renderBoard("overview");

    expect(html).toContain("Expected this year");
    expect(html).toContain("Where the roster stands");
    expect(html).toContain("Installment progress");
  });

  it("averages the daily series over quiet days, not only days with receipts", async () => {
    const html = await renderBoard("collection");

    // 10 Aug 120000 + 12 Aug 300000 + 14 Aug 124500 = 544500 over FIVE days
    // (the 11th and 13th are padded to zero) = 108900 -> Rs 1.1L.
    expect(html).toContain("Avg ₹1.1L a day");
    expect(html).toContain("best ₹3.0L");
    expect(html).toContain("2 days with nothing");
  });

  it("says money taken, never fees collected, because the series includes late fee", async () => {
    const html = await renderBoard("collection");

    expect(html).toContain("Money taken");
    expect(html).not.toContain("Fees collected");
  });

  it("links the 14 and 30 day windows rather than toggling client state", async () => {
    const html = await renderBoard("collection");

    expect(html).toContain("view=collection&amp;days=14");
    expect(html).toContain("view=collection&amp;days=30");
  });

  it("keeps the late fee out of every fees figure and shows what was actually paid", async () => {
    const html = await renderBoard("latefee");

    // charged 866000 - waived 850000 - pending 12000 = 4000 actually paid.
    expect(html).toContain("₹4,000");
    expect(html).toContain("₹12,000");
    expect(html).toContain("A late fee is never part of fees pending");
  });

  it("sends the reader to the real list for a figure it cannot stand behind", async () => {
    const html = await renderBoard("recovery");

    // Students who left owing are a roster segment, not a dashboard field.
    expect(html).toContain("seg=leftOwing");
    expect(html).toContain("Students who left owing");
  });

  it("announces every chart, so a board is not pictures a screen reader cannot read", async () => {
    for (const view of DASHBOARD_VIEWS) {
      const html = await renderBoard(view);
      const images = html.match(/role="img"/g) ?? [];
      const labelled = html.match(/role="img"[^>]*aria-label="/g) ?? [];
      expect(labelled.length, `board ${view}`).toBe(images.length);
    }
  });

  it("draws in tokens only, so the boards follow the theme instead of a hex", async () => {
    for (const view of DASHBOARD_VIEWS) {
      const html = await renderBoard(view);
      expect(html, `board ${view}`).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(html, `board ${view}`).not.toMatch(/\bhsl\(\d/i);
    }
  });

  it("survives an analytics payload written by an older build", async () => {
    // The data cache keeps objects across deployments, so a payload can arrive
    // missing a field this build maps over. That took the whole below-fold
    // area down once already, behind the error boundary.
    const stale = JSON.parse(JSON.stringify(ANALYTICS)) as Record<string, unknown>;
    delete stale.routeRecovery;
    delete stale.debtAge;
    delete stale.monthlyCollection;
    delete (stale.lateFee as Record<string, unknown>).byWaiverSource;
    const analytics = stale as unknown as DashboardAnalytics;

    const thinData = { ...PAGE_DATA, collectionHeatmap: [], classInstallmentMatrix: [] };

    for (const view of DASHBOARD_VIEWS) {
      await expect(renderBoard(view, { analytics, data: thinData })).resolves.toBeTypeOf("string");
    }
  });

  it("reads the analytics payload the page already loaded, never its own", () => {
    // One fetch per render. unstable_cache does not de-duplicate concurrent
    // callers, so a loader inside a board would fire a second Mumbai round
    // trip alongside the first on every cold cache.
    const boards = readRepoFile("src/components/dashboard/mobile-boards.tsx");
    expect(boards).not.toContain("getDashboardAnalytics");
    expect(boards).not.toContain("getDashboardPageData");
    expect(boards).not.toContain("getRepaymentDashboardSummary");

    const page = readRepoFile("src/app/protected/dashboard/page.tsx");
    expect(page.match(/getDashboardAnalytics\(/g) ?? []).toHaveLength(1);
    expect(page.match(/getRepaymentDashboardSummary\(/g) ?? []).toHaveLength(1);
  });

  it("gives the phone the board switcher the desk has had all along", () => {
    const home = readRepoFile("src/components/dashboard/mobile-dashboard-screen.tsx");
    expect(home).toContain("<ViewSwitcher");
    // Both switchers read one label map, so the same ?view= cannot read as two
    // different boards depending on the screen it was opened on.
    const page = readRepoFile("src/app/protected/dashboard/page.tsx");
    expect(page).toContain("boardLabels");
    expect(page.match(/labels=\{boardLabels\}/g) ?? []).toHaveLength(1);
  });
});
