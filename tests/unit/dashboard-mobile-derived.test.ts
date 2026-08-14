import { describe, expect, it } from "vitest";

import {
  buildDailySeries,
  buildWeekdayAverages,
  computePaceToYearEnd,
  summariseDailySeries,
} from "@/lib/dashboard/mobile-derived";
import type { DashboardInstallmentSummaryRow } from "@/lib/dashboard/summary";

function installment(
  installmentNo: number,
  dueDate: string | null,
  expectedAmount: number,
  overrides: Partial<DashboardInstallmentSummaryRow> = {},
): DashboardInstallmentSummaryRow {
  return {
    installmentNo,
    installmentLabel: `Installment ${installmentNo}`,
    dueDate,
    studentCount: 100,
    expectedAmount,
    collectedAmount: 0,
    pendingAmount: expectedAmount,
    overdueAmount: 0,
    collectionRate: 0,
    ...overrides,
  };
}

/** The AY 2026-27 schedule from lib/config/fee-rules.ts, ₹25L a quarter. */
const SCHEDULE = [
  installment(1, "2026-04-20", 2_500_000),
  installment(2, "2026-07-20", 2_500_000),
  installment(3, "2026-10-20", 2_500_000),
  installment(4, "2027-01-20", 2_500_000),
];

describe("computePaceToYearEnd", () => {
  it("counts only the installments whose due date has passed, not a smooth ramp", () => {
    // 14 August: instalments 1 and 2 are due, 3 and 4 are not. A linear ramp
    // across the year would say ~37%; the school said 50%.
    const pace = computePaceToYearEnd({
      installmentSummary: SCHEDULE,
      currentYearExpected: 10_000_000,
      currentYearCollected: 5_000_000,
      todayIso: "2026-08-14",
    });

    expect(pace?.expectedToDate).toBe(5_000_000);
    expect(pace?.expectedPct).toBe(50);
  });

  it("reads on-pace when collections cover everything due so far", () => {
    const pace = computePaceToYearEnd({
      installmentSummary: SCHEDULE,
      currentYearExpected: 10_000_000,
      currentYearCollected: 5_000_000,
      todayIso: "2026-08-14",
    });

    expect(pace?.daysBehind).toBe(0);
    expect(pace?.catchUpPerDay).toBe(0);
  });

  it("dates the shortfall from the installment still being paid for", () => {
    // Only installment 1 is covered, so the school is still working on the one
    // that fell due on 20 July — 25 days before 14 August.
    const pace = computePaceToYearEnd({
      installmentSummary: SCHEDULE,
      currentYearExpected: 10_000_000,
      currentYearCollected: 2_500_000,
      todayIso: "2026-08-14",
    });

    expect(pace?.daysBehind).toBe(25);
    // ₹25L short, 18 days left in August (14th through 31st inclusive).
    expect(pace?.daysLeftInMonth).toBe(18);
    expect(pace?.catchUpPerDay).toBe(Math.ceil(2_500_000 / 18));
  });

  it("is not behind when collections have run ahead of the schedule", () => {
    const pace = computePaceToYearEnd({
      installmentSummary: SCHEDULE,
      currentYearExpected: 10_000_000,
      currentYearCollected: 7_500_000,
      todayIso: "2026-08-14",
    });

    expect(pace?.daysBehind).toBe(0);
    expect(pace?.catchUpPerDay).toBe(0);
    expect(pace?.collectedPct).toBe(75);
  });

  it("ignores carry-forward rows, which belong to old balance", () => {
    const withCarryForward = [
      ...SCHEDULE,
      installment(91, "2026-04-20", 1_860_000, { isCarryForward: true }),
    ];

    const pace = computePaceToYearEnd({
      installmentSummary: withCarryForward,
      currentYearExpected: 10_000_000,
      currentYearCollected: 5_000_000,
      todayIso: "2026-08-14",
    });

    expect(pace?.expectedToDate).toBe(5_000_000);
  });

  it("returns null rather than a figure when there is nothing to pace against", () => {
    expect(
      computePaceToYearEnd({
        installmentSummary: SCHEDULE,
        currentYearExpected: 0,
        currentYearCollected: 0,
        todayIso: "2026-08-14",
      }),
    ).toBeNull();

    expect(
      computePaceToYearEnd({
        installmentSummary: [],
        currentYearExpected: 10_000_000,
        currentYearCollected: 0,
        todayIso: "2026-08-14",
      }),
    ).toBeNull();

    // A schedule with no due dates cannot say where the year should be.
    expect(
      computePaceToYearEnd({
        installmentSummary: [installment(1, null, 2_500_000)],
        currentYearExpected: 10_000_000,
        currentYearCollected: 0,
        todayIso: "2026-08-14",
      }),
    ).toBeNull();
  });

  it("survives a month boundary, counting the last day as one day left", () => {
    const pace = computePaceToYearEnd({
      installmentSummary: SCHEDULE,
      currentYearExpected: 10_000_000,
      currentYearCollected: 0,
      todayIso: "2026-08-31",
    });

    expect(pace?.daysLeftInMonth).toBe(1);
    expect(pace?.catchUpPerDay).toBe(5_000_000);
  });
});

describe("buildDailySeries", () => {
  const HEATMAP = [
    { date: "2026-08-10", amount: 12_000 },
    { date: "2026-08-12", amount: 30_000 },
    { date: "2026-08-14", amount: 18_000 },
  ];

  it("puts back the days nobody paid on", () => {
    const series = buildDailySeries(HEATMAP, "2026-08-14", 14);

    expect(series).toHaveLength(5);
    expect(series.map((point) => point.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    expect(series.map((point) => point.amount)).toEqual([12_000, 0, 30_000, 0, 18_000]);
  });

  it("clamps to the first collection date instead of inventing pre-session zeros", () => {
    // A 30-day window over a session that opened 5 days ago is 5 points, not 30.
    expect(buildDailySeries(HEATMAP, "2026-08-14", 30)).toHaveLength(5);
  });

  it("honours a window narrower than the session", () => {
    const series = buildDailySeries(HEATMAP, "2026-08-14", 3);

    expect(series.map((point) => point.date)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("returns nothing for a session with no collections at all", () => {
    expect(buildDailySeries([], "2026-08-14", 14)).toEqual([]);
  });
});

describe("summariseDailySeries", () => {
  it("averages over every day in the window, including the quiet ones", () => {
    const series = buildDailySeries(
      [
        { date: "2026-08-10", amount: 12_000 },
        { date: "2026-08-12", amount: 30_000 },
        { date: "2026-08-14", amount: 18_000 },
      ],
      "2026-08-14",
      14,
    );

    expect(summariseDailySeries(series)).toEqual({
      average: 12_000, // 60,000 over 5 days, not over the 3 that had receipts
      best: 30_000,
      zeroDays: 2,
    });
  });

  it("does not divide by zero on an empty series", () => {
    expect(summariseDailySeries([])).toEqual({ average: 0, best: 0, zeroDays: 0 });
  });

  it("handles a single-day series", () => {
    expect(summariseDailySeries([{ date: "2026-08-14", amount: 9_000 }])).toEqual({
      average: 9_000,
      best: 9_000,
      zeroDays: 0,
    });
  });
});

describe("buildWeekdayAverages", () => {
  it("divides by every occurrence of the weekday, not only the paid ones", () => {
    // 2 Aug, 9 Aug and 16 Aug 2026 are Sundays. Only one took money.
    const averages = buildWeekdayAverages(
      [
        { date: "2026-08-02", amount: 0 },
        { date: "2026-08-09", amount: 30_000 },
        { date: "2026-08-16", amount: 0 },
      ],
      "2026-08-16",
    );

    expect(averages[0]).toBe(10_000);
  });

  it("keeps weekdays apart", () => {
    // 14 Aug 2026 is a Friday, 15 Aug a Saturday.
    const averages = buildWeekdayAverages(
      [
        { date: "2026-08-14", amount: 100_000 },
        { date: "2026-08-15", amount: 20_000 },
      ],
      "2026-08-15",
    );

    expect(averages[5]).toBe(100_000);
    expect(averages[6]).toBe(20_000);
    // Nothing happened on the other five, and nothing is claimed about them.
    expect(averages.filter((value) => value === 0)).toHaveLength(5);
  });

  it("extends the padding to today when the last receipt is older", () => {
    // 10 Aug 2026 is a Monday; 17 Aug is the next one. Two Mondays, one paid.
    const averages = buildWeekdayAverages([{ date: "2026-08-10", amount: 40_000 }], "2026-08-17");

    expect(averages[1]).toBe(20_000);
  });

  it("returns seven zeros for a session with no collections", () => {
    expect(buildWeekdayAverages([], "2026-08-14")).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
