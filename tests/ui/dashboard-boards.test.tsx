import { readFileSync } from "node:fs";
import { join } from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ClassesBoard,
  CollectionBoard,
  DiscountsBoard,
  LateFeeBoard,
  RecoveryBoard,
} from "@/modules/dashboard/ui/boards";
import { MoneyBand } from "@/modules/dashboard/ui/money-band";
import { StatTile } from "@/modules/dashboard/ui/tiles";
import type { DashboardAnalytics } from "@/modules/dashboard/data/analytics";

/**
 * The boards render from the shape get_dashboard_analytics actually returns.
 *
 * The fixture below is the live 2026-27 payload from 2026-08-12, trimmed --
 * including the numbers that started this whole change: Rs 8,66,000 of late fee
 * charged, Rs 8,50,000 of it waived automatically, Rs 12,000 left owing, and
 * Rs 4,58,000 due to land on the next due date with nobody deciding anything.
 */
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
    {
      classId: "class-2",
      classLabel: "Class 2",
      expected: 400000,
      collected: 340000,
      feesPending: 60000,
      lateFeePending: 0,
      studentsAtRisk: 4,
      students: 38,
      recoveryRate: 85,
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

describe("dashboard boards", () => {
  it("the money band keeps fees and the late fee in separate slots", () => {
    const html = renderToStaticMarkup(
      <MoneyBand
        collectedToday={24000}
        collectedThisYear={2900000}
        expectedThisYear={13242175}
        feesPending={10558591}
        lateFeePending={12000}
        receiptsToday={3}
        todayDelta={null}
        sessionLabel="2026-27"
        labels={{
          today: "Collected today",
          thisYear: "Collected this year",
          expectedThisYear: "of",
          feesPending: "Fees pending",
          lateFeePending: "Late fee pending",
          receipts: "receipts",
          lateFeeHint: "Tracked separately — never part of fees",
        }}
      />,
    );

    expect(html).toContain("Fees pending");
    expect(html).toContain("Late fee pending");
    // The hint is the whole point: the two numbers sit side by side and the
    // band says out loud that one is not part of the other.
    expect(html).toContain("never part of fees");
    // Expected this year went missing when the hero KPIs were replaced. The
    // collected figure now reads against it, so the target is visible and the
    // collection rate comes back with it.
    expect(html).toContain("Collected this year");
    expect(html).toContain("22%");
    expect(html).toContain("1,32,42,175");
    // Ink recipe, so the band prints and reads correctly in dark mode.
    expect(html).toContain("bg-nav");
  });

  it("the late-fee board explains where the money went", () => {
    const html = renderToStaticMarkup(
      <LateFeeBoard analytics={ANALYTICS} sessionLabel="2026-27" />,
    );

    expect(html).toContain("Late fee still owed");
    expect(html).toContain("12 students");

    // The Rs 8.5 lakh nobody decided to forgive, and what it was.
    expect(html).toContain("Waived without anyone deciding");
    expect(html).toContain("Waived automatically by a rule change");
    expect(html).toContain("Carried over from the old waiver pool");

    // And the cliff ahead.
    expect(html).toContain("Next accrual");
    expect(html).toContain("20 Oct 2026");
    expect(html).toContain("458 installments");
  });

  it("the discounts board splits policy from manual and keeps close-outs out of the total", () => {
    const html = renderToStaticMarkup(
      <DiscountsBoard analytics={ANALYTICS} sessionLabel="2026-27" />,
    );

    // The reconciling split: 13,05,500 + 57,100 = 13,62,600. All three appear,
    // and the total is labelled as a reduction of what is owed, not a payment.
    expect(html).toContain("13,62,600");
    expect(html).toContain("13,05,500");
    expect(html).toContain("57,100");
    expect(html).toContain("not a payment");

    // Per-policy rollup, including the combined-label case: a student holding
    // two policies is one row, never two, because the lower tuition wins.
    expect(html).toContain("RTE");
    expect(html).toContain("Staff Child, 3rd Child Policy");
    expect(html).toContain("46 students");

    // Zero close-outs renders as an honest empty state, not a Rs 0 figure that
    // reads like a measurement.
    expect(html).toContain("No balance has been written off as a discount");
  });

  it("the discounts board survives a payload that predates it entirely", () => {
    // A cached analytics object written before v3-discounts has no `discounts`
    // key at all. The board must render its empty states, not throw into the
    // error boundary and blank the page.
    const stale = { ...ANALYTICS, discounts: undefined } as unknown as typeof ANALYTICS;
    const html = renderToStaticMarkup(
      <DiscountsBoard analytics={stale} sessionLabel="2026-27" />,
    );

    expect(html).toContain("No conventional discount policy is in use");
  });

  it("the recovery board reports how old the debt is and whether it is concentrated", () => {
    const html = renderToStaticMarkup(
      <RecoveryBoard
        analytics={ANALYTICS}
        oldBalance={{ original: 800000, recovered: 200000, pending: 600000 }}
      />,
    );

    expect(html).toContain("Over 90 days");
    expect(html).toContain("days old");

    // 18% across the top 50 is diffuse, and the board says so rather than
    // leaving the reader to work out whether a shortlist would help.
    expect(html).toContain("no shortlist clears this");
    expect(html).toContain("484 families");
  });

  it("the classes board ranks by fees pending and flags who is behind", () => {
    const html = renderToStaticMarkup(
      <ClassesBoard analytics={ANALYTICS} sessionLabel="2026-27" />,
    );

    expect(html).toContain("Class 1");
    expect(html).toContain("30% collected");
    expect(html).toContain("30 of 40 behind");
    expect(html).toContain("Classes above 75%");
    expect(html).toContain("Classes below 50%");
    // Rows link into the class, so a finding is one click from the students.
    expect(html).toContain("classId=class-1");
  });

  it("the collection board projects from the run rate and labels it as a projection", () => {
    const html = renderToStaticMarkup(<CollectionBoard analytics={ANALYTICS} />);

    expect(html).toContain("Collection by month");
    expect(html).toContain("Monthly run rate");
    expect(html).toContain("average carried forward");
    expect(html).toContain("Payment mix");
  });

  it("every bar is announced, so the boards are not charts screen readers cannot read", () => {
    const html = renderToStaticMarkup(
      <RecoveryBoard
        analytics={ANALYTICS}
        oldBalance={{ original: 0, recovered: 0, pending: 0 }}
      />,
    );

    const bars = html.match(/role="progressbar"/g) ?? [];
    expect(bars.length).toBeGreaterThan(0);
    // Every progressbar carries a label. A bar a screen reader announces as
    // "progress bar" and nothing else is decoration pretending to be data.
    const labelled = html.match(/role="progressbar"[^>]*aria-label="/g) ?? [];
    expect(labelled.length).toBe(bars.length);
  });

  it("a board survives an analytics payload that predates one of its fields", () => {
    // The data cache keeps objects across deployments, so a payload written by
    // the previous build can arrive missing a field the current build reads.
    // That is not hypothetical: routeRecovery did exactly this and
    // `analytics.routeRecovery.length` took the whole below-fold area down
    // behind the error boundary. A missing field must degrade to an empty
    // panel, never throw.
    const stale = JSON.parse(JSON.stringify(ANALYTICS)) as Record<string, unknown>;
    delete stale.routeRecovery;
    delete stale.debtAge;
    delete (stale.lateFee as Record<string, unknown>).byWaiverSource;

    const asAnalytics = stale as unknown as DashboardAnalytics;
    expect(() =>
      renderToStaticMarkup(<LateFeeBoard analytics={asAnalytics} sessionLabel="2026-27" />),
    ).not.toThrow();
    expect(() =>
      renderToStaticMarkup(
        <RecoveryBoard
          analytics={asAnalytics}
          oldBalance={{ original: 0, recovered: 0, pending: 0 }}
        />,
      ),
    ).not.toThrow();
  });

  it("switching boards does not throw the page to the top", () => {
    const switcher = readFileSync(
      join(process.cwd(), "src/modules/dashboard/ui/view-switcher.tsx"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "src/app/protected/dashboard/page.tsx"),
      "utf8",
    );

    // Link scrolls to top by default. The switcher and the board under it both
    // sit below the money band, so that threw the reader off what they were
    // looking at on every click. These are tabs, not page navigations.
    expect(switcher).toContain("scroll={false}");

    // And the board area keeps a floor, so swapping a full board for the
    // loading skeleton cannot collapse the page and then push it back down.
    expect(page).toContain('min-h-[32rem]');
  });

  it("the delta line reads as a sentence, not a percent next to a rupee figure", () => {
    // KpiDelta.comparator is the comparison AMOUNT. Rendering it beside the
    // percentage produced "▼ 100% 4450" on the live dashboard -- two unrelated
    // numbers touching. The type already formats the sentence.
    const html = renderToStaticMarkup(
      <MoneyBand
        collectedToday={0}
        collectedThisYear={195331}
        expectedThisYear={1718500}
        feesPending={1522669}
        lateFeePending={18250}
        receiptsToday={0}
        todayDelta={{
          comparator: 4450,
          deltaPct: -100,
          label: "▼ 100% vs Wed avg",
          tone: "danger",
        }}
        sessionLabel="TEST-2026-27"
        labels={{
          today: "Today collection",
          thisYear: "This year collected",
          expectedThisYear: "of",
          feesPending: "Fees pending",
          lateFeePending: "Late fee pending",
          receipts: "receipts",
          lateFeeHint: "Tracked separately — never part of fees",
        }}
      />,
    );

    expect(html).toContain("▼ 100% vs Wed avg");
    expect(html).not.toContain("4450");
  });

  it("counts are not dressed up as rupees", () => {
    // Seen in the browser on the live dashboard: "Classes tracked Rs 19",
    // "Families with fees due Rs 73", and a roster donut reading "Overdue
    // Rs 416". Those are people and classes, not money. Rendering a count
    // through <Money> is not a smaller version of the truth -- it is a
    // different fact, on a screen whose whole job is money.
    // The primitive, precisely: a count tile renders a bare grouped number.
    const countTile = renderToStaticMarkup(
      <StatTile label="Classes tracked" value={19} format="count" />,
    );
    expect(countTile).toContain("19");
    expect(countTile).not.toContain("₹");

    // And a money tile still renders money, so the opt-out did not leak.
    const moneyTile = renderToStaticMarkup(<StatTile label="Fees pending" value={1234} />);
    expect(moneyTile).toContain("₹");

    const classes = renderToStaticMarkup(
      <ClassesBoard analytics={ANALYTICS} sessionLabel="2026-27" />,
    );
    expect(classes).toContain("Classes tracked");

    const recovery = renderToStaticMarkup(
      <RecoveryBoard
        analytics={ANALYTICS}
        oldBalance={{ original: 0, recovered: 0, pending: 0 }}
      />,
    );
    expect(recovery).toContain("Families with fees due");
    // 484 families, rendered as a plain grouped number.
    expect(recovery).toContain("484");
    expect(recovery).not.toContain("₹484");
  });

  it("charts use design-system tokens, never raw hex", () => {
    const html = [
      renderToStaticMarkup(<LateFeeBoard analytics={ANALYTICS} sessionLabel="2026-27" />),
      renderToStaticMarkup(<ClassesBoard analytics={ANALYTICS} sessionLabel="2026-27" />),
      renderToStaticMarkup(<CollectionBoard analytics={ANALYTICS} />),
    ].join("");

    expect(html).toContain("hsl(var(--");
    // docs/design/design-system.md §6: semantic tokens only. A hard-coded hue
    // is the thing that breaks dark mode and print six months later.
    expect(html).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
