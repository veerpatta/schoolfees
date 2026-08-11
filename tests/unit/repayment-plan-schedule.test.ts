import { describe, expect, it } from "vitest";

import { buildScheduleRows } from "@/lib/repayment-plans/data";
import {
  addMonthsClamped,
  buildRepaymentSchedule,
  calculateRepaymentTermMonths,
  minimumMonthlyAmountForMaxTerm,
  validateRepaymentPlanDraft,
} from "@/lib/repayment-plans/schedule";
import { REPAYMENT_PLAN_MAX_TERM_MONTHS } from "@/lib/repayment-plans/types";

/**
 * These mirror `private.repayment_plan_schedule` in
 * supabase/migrations/20260811073515_repayment_plan_schedule_pins_search_path.sql.
 *
 * The database writes the rows a family is actually held to; this module only
 * powers the instant preview. If the two ever disagree an admin approves one
 * calendar and the parent receives another, so the clamping cases below are
 * asserted against the exact values the SQL was verified to produce.
 */
describe("addMonthsClamped", () => {
  it("keeps the day of month when the target month is long enough", () => {
    expect(addMonthsClamped("2026-04-15", 1)).toBe("2026-05-15");
    expect(addMonthsClamped("2026-04-15", 6)).toBe("2026-10-15");
  });

  it("clamps to the last day rather than rolling into the next month", () => {
    // 31 Jan + 1 month is 28 Feb, not 3 March.
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("gives 29 February in a leap year", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("crosses a year boundary", () => {
    expect(addMonthsClamped("2026-11-30", 2)).toBe("2027-01-30");
  });
});

describe("calculateRepaymentTermMonths", () => {
  it("ceilings so the final EMI absorbs the remainder", () => {
    expect(calculateRepaymentTermMonths(10000, 3000)).toBe(4);
  });

  it("does not add a phantom month for an exact multiple", () => {
    expect(calculateRepaymentTermMonths(9000, 3000)).toBe(3);
  });

  it("is one month when a single payment clears it", () => {
    expect(calculateRepaymentTermMonths(2000, 5000)).toBe(1);
  });

  it("returns 0 for amounts that cannot form a plan", () => {
    expect(calculateRepaymentTermMonths(0, 3000)).toBe(0);
    expect(calculateRepaymentTermMonths(10000, 0)).toBe(0);
    expect(calculateRepaymentTermMonths(10000, -5)).toBe(0);
  });
});

describe("buildRepaymentSchedule", () => {
  it("matches the values the SQL produced for 31 Jan, Rs 3000, Rs 10000", () => {
    expect(
      buildRepaymentSchedule({
        openingBalance: 10000,
        monthlyAmount: 3000,
        firstDueDate: "2026-01-31",
      }),
    ).toEqual([
      { sequenceNo: 1, dueDate: "2026-01-31", amount: 3000 },
      { sequenceNo: 2, dueDate: "2026-02-28", amount: 3000 },
      { sequenceNo: 3, dueDate: "2026-03-31", amount: 3000 },
      { sequenceNo: 4, dueDate: "2026-04-30", amount: 1000 },
    ]);
  });

  it("keeps every row at the monthly amount for an exact multiple", () => {
    expect(
      buildRepaymentSchedule({
        openingBalance: 9000,
        monthlyAmount: 3000,
        firstDueDate: "2026-04-15",
      }),
    ).toEqual([
      { sequenceNo: 1, dueDate: "2026-04-15", amount: 3000 },
      { sequenceNo: 2, dueDate: "2026-05-15", amount: 3000 },
      { sequenceNo: 3, dueDate: "2026-06-15", amount: 3000 },
    ]);
  });

  it("always sums back to the opening balance", () => {
    for (const [opening, monthly] of [
      [16850, 4000],
      [12850, 6000],
      [613175, 60000],
      [1, 1],
    ] as const) {
      const total = buildRepaymentSchedule({
        openingBalance: opening,
        monthlyAmount: monthly,
        firstDueDate: "2026-08-31",
      }).reduce((sum, row) => sum + row.amount, 0);

      expect(total).toBe(opening);
    }
  });
});

describe("minimumMonthlyAmountForMaxTerm", () => {
  it("names an amount that actually fits inside the cap", () => {
    const opening = 100000;
    const minimum = minimumMonthlyAmountForMaxTerm(opening);

    expect(calculateRepaymentTermMonths(opening, minimum)).toBeLessThanOrEqual(
      REPAYMENT_PLAN_MAX_TERM_MONTHS,
    );
    expect(calculateRepaymentTermMonths(opening, minimum - 1)).toBeGreaterThan(
      REPAYMENT_PLAN_MAX_TERM_MONTHS,
    );
  });
});

describe("validateRepaymentPlanDraft", () => {
  const valid = {
    openingBalance: 16850,
    monthlyAmount: 4000,
    firstDueDate: "2026-08-31",
    reason: "Family requested monthly instalments",
    acknowledged: true,
  };

  it("accepts a well-formed draft and reports the derived term", () => {
    const result = validateRepaymentPlanDraft(valid);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.termMonths).toBe(5);
    expect(result.finalInstallmentAmount).toBe(850);
    expect(result.endDate).toBe("2026-12-31");
  });

  it("refuses a term longer than 12 months and suggests a workable amount", () => {
    const result = validateRepaymentPlanDraft({ ...valid, monthlyAmount: 100 });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain("maximum term is 12 months");
    expect(result.message).toContain(String(minimumMonthlyAmountForMaxTerm(16850)));
  });

  it("requires a reason of at least four characters", () => {
    const result = validateRepaymentPlanDraft({ ...valid, reason: "ok" });

    expect(result.ok).toBe(false);
  });

  it("requires the payment-priority acknowledgement", () => {
    const result = validateRepaymentPlanDraft({ ...valid, acknowledged: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain("clear EMI debt before any other fees");
  });

  it("refuses a student with nothing to convert", () => {
    expect(validateRepaymentPlanDraft({ ...valid, openingBalance: 0 }).ok).toBe(false);
  });

  it("refuses a fractional monthly amount", () => {
    expect(validateRepaymentPlanDraft({ ...valid, monthlyAmount: 4000.5 }).ok).toBe(false);
  });
});

describe("buildScheduleRows", () => {
  const schedule = [
    { sequenceNo: 1, dueDate: "2026-05-31", amount: 3000 },
    { sequenceNo: 2, dueDate: "2026-06-30", amount: 3000 },
    { sequenceNo: 3, dueDate: "2026-07-31", amount: 1000 },
  ];

  it("marks elapsed unpaid rows missed and future rows upcoming", () => {
    const rows = buildScheduleRows({ schedule, paidToDate: 0, today: "2026-06-15" });

    expect(rows.map((row) => row.status)).toEqual(["missed", "upcoming", "upcoming"]);
  });

  it("splits a part payment across the row it lands on", () => {
    const rows = buildScheduleRows({ schedule, paidToDate: 4200, today: "2026-06-15" });

    expect(rows[0]).toMatchObject({ paidAmount: 3000, status: "paid_late" });
    expect(rows[1]).toMatchObject({ paidAmount: 1200, status: "partial" });
    expect(rows[2]).toMatchObject({ paidAmount: 0, status: "upcoming" });
  });

  it("never reports more paid than a row is worth", () => {
    const rows = buildScheduleRows({ schedule, paidToDate: 99999, today: "2026-08-01" });

    expect(rows.map((row) => row.paidAmount)).toEqual([3000, 3000, 1000]);
    expect(rows.every((row) => row.status === "paid_late")).toBe(true);
  });

  it("treats a row paid before its due date as on time", () => {
    const rows = buildScheduleRows({ schedule, paidToDate: 3000, today: "2026-05-01" });

    expect(rows[0].status).toBe("paid_on_time");
  });
});

describe("custom per-instalment due dates", () => {
  const base = { openingBalance: 10000, monthlyAmount: 3000, firstDueDate: "2026-01-31" };

  it("overrides only the rows given and generates the rest", () => {
    const rows = buildRepaymentSchedule({
      ...base,
      // Move EMI 2 to a harvest date; leave 1, 3 and 4 alone.
      customDueDates: [undefined, "2026-03-05", undefined, undefined],
    });

    expect(rows.map((row) => row.dueDate)).toEqual([
      "2026-01-31",
      "2026-03-05",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("leaves the amounts alone — only dates are overridable", () => {
    const rows = buildRepaymentSchedule({
      ...base,
      customDueDates: ["2026-02-01", "2026-05-01", "2026-09-01", "2027-01-01"],
    });

    expect(rows.map((row) => row.amount)).toEqual([3000, 3000, 3000, 1000]);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(base.openingBalance);
  });

  it("refuses a date that does not move forward", () => {
    // Mirrors student_repayment_schedule_dates_ascend in the migration.
    const result = validateRepaymentPlanDraft({
      ...base,
      reason: "Custom dates around the harvest",
      acknowledged: true,
      customDueDates: ["2026-01-31", "2026-01-15", "2026-03-31", "2026-04-30"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("EMI 2 is dated on or before EMI 1");
  });

  it("refuses two instalments on the same day", () => {
    const result = validateRepaymentPlanDraft({
      ...base,
      reason: "Same day twice",
      acknowledged: true,
      customDueDates: ["2026-01-31", "2026-01-31", "2026-03-31", "2026-04-30"],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a genuinely irregular but forward-moving calendar", () => {
    const result = validateRepaymentPlanDraft({
      ...base,
      reason: "Harvest in November, wedding in February",
      acknowledged: true,
      customDueDates: ["2026-02-10", "2026-06-01", "2026-11-05", "2027-02-28"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.endDate).toBe("2027-02-28");
    expect(result.finalInstallmentAmount).toBe(1000);
  });
});
