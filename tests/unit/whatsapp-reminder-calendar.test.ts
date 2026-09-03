import { describe, expect, it } from "vitest";

import {
  buildInstallmentCalendar,
  DEFAULT_PRE_DUE_WINDOW_DAYS,
  describeDateGuard,
  FINAL_NOTICE_DAYS_BEFORE_DUE,
  isFinalNoticeWindow,
  lateFeeStartsOn,
  readInstallmentSchedule,
} from "@/modules/whatsapp/domain/installment-calendar";

/**
 * The calendar that decides which installments a reminder is about.
 *
 * The rule it replaces was a hardcoded `[1, 2]`, which was true in August and
 * silently wrong from October — installment 3 passed its due date with nothing
 * on the screen aware it existed. Every branch here decides whether a real
 * parent is asked for money, so all of them are pinned.
 *
 * Pure by construction: no Supabase client, no clock. `today` is always passed.
 */

/** The live AY 2026-27 schedule, per `docs/product/school-rules.md`. */
const SCHEDULE = [
  { dueDate: "2026-04-20" },
  { dueDate: "2026-07-20" },
  { dueDate: "2026-10-20" },
  { dueDate: "2027-01-20" },
];

describe("readInstallmentSchedule", () => {
  it("numbers installments by array position, not by parsing a label", () => {
    expect(readInstallmentSchedule(SCHEDULE)).toEqual([
      { installmentNo: 1, dueDate: "2026-04-20" },
      { installmentNo: 2, dueDate: "2026-07-20" },
      { installmentNo: 3, dueDate: "2026-10-20" },
      { installmentNo: 4, dueDate: "2027-01-20" },
    ]);
  });

  it("drops an installment whose due date cannot be read", () => {
    // Announcing a due date we cannot parse is worse than saying nothing: the
    // message would carry an empty date slot to a parent.
    const partial = readInstallmentSchedule([
      { dueDate: "2026-04-20" },
      { dueDate: null },
      { dueDate: "not a date" },
      { dueDate: "2027-01-20" },
    ]);
    expect(partial.map((entry) => entry.installmentNo)).toEqual([1, 4]);
  });

  it("survives a session with no schedule at all", () => {
    expect(readInstallmentSchedule(null)).toEqual([]);
    expect(readInstallmentSchedule(undefined)).toEqual([]);
    expect(readInstallmentSchedule([])).toEqual([]);
  });
});

describe("buildInstallmentCalendar", () => {
  it("splits the year at today, with the window deciding what counts as upcoming", () => {
    // 2026-10-14 is six days before installment 3 — inside the default ten-day
    // window, so the courtesy notice is about installment 3 while 1 and 2 have
    // already passed.
    const calendar = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-10-14" });

    expect(calendar.passed).toEqual([1, 2]);
    expect(calendar.upcoming).toEqual([3]);
    expect(calendar.active).toEqual([1, 2, 3]);
    expect(calendar.next).toEqual({
      installmentNo: 3,
      dueDate: "2026-10-20",
      daysUntilDue: 6,
    });
    expect(calendar.lastPassed?.installmentNo).toBe(2);
  });

  it("leaves an installment out of the window until it is close enough", () => {
    // Eleven days out, with a ten-day window: not yet anybody's business.
    const outside = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-10-09" });
    expect(outside.upcoming).toEqual([]);
    expect(outside.next).toBeNull();
    expect(outside.active).toEqual([1, 2]);

    // Ten days out is the boundary, and the boundary is inclusive.
    const inside = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-10-10" });
    expect(inside.upcoming).toEqual([3]);
    expect(inside.next?.daysUntilDue).toBe(DEFAULT_PRE_DUE_WINDOW_DAYS);
  });

  it("counts the due date itself as passed, not as upcoming", () => {
    // The ledger charges from the day AFTER the due date, so on the day itself
    // the family is not yet late — but they are also not "due soon", they are
    // due today. Putting the day itself in `passed` is what keeps the courtesy
    // notice from going out on the morning the deadline lands.
    const calendar = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-10-20" });
    expect(calendar.passed).toContain(3);
    expect(calendar.upcoming).not.toContain(3);
    expect(calendar.lastPassed?.installmentNo).toBe(3);
  });

  it("picks the NEAREST upcoming installment, not the first in the schedule", () => {
    // A window wide enough to catch two installments must still name the one a
    // parent is actually being asked about.
    const calendar = buildInstallmentCalendar({
      schedule: [{ dueDate: "2027-01-20" }, { dueDate: "2026-10-20" }],
      today: "2026-10-15",
      windowDays: 120,
    });
    expect(calendar.next?.dueDate).toBe("2026-10-20");
    // Installment NUMBER still follows array position, so the nearest date here
    // is installment 2 even though it sorts first by date.
    expect(calendar.next?.installmentNo).toBe(2);
  });

  it("names the MOST RECENTLY passed installment, not April's", () => {
    // A late-fee notice that named installment 1 in October would be telling a
    // family about a date six months gone.
    const calendar = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-12-01" });
    expect(calendar.lastPassed?.installmentNo).toBe(3);
    expect(calendar.lastPassed?.dueDate).toBe("2026-10-20");
  });

  it("treats a zero window as 'only what has already passed'", () => {
    const calendar = buildInstallmentCalendar({
      schedule: SCHEDULE,
      today: "2026-10-19",
      windowDays: 0,
    });
    expect(calendar.upcoming).toEqual([]);
    expect(calendar.next).toBeNull();
    expect(calendar.active).toEqual([1, 2]);
  });

  it("clamps a negative window rather than emptying the list silently", () => {
    const calendar = buildInstallmentCalendar({
      schedule: SCHEDULE,
      today: "2026-10-14",
      windowDays: -5,
    });
    expect(calendar.windowDays).toBe(0);
    expect(calendar.passed).toEqual([1, 2]);
  });

  it("returns an empty calendar for a session with no schedule", () => {
    // A valid state, not an error: the calendar-driven notices simply reach
    // nobody until Fee Setup has been published.
    const calendar = buildInstallmentCalendar({ schedule: [], today: "2026-10-14" });
    expect(calendar.active).toEqual([]);
    expect(calendar.next).toBeNull();
    expect(calendar.lastPassed).toBeNull();
  });

  it("puts every installment behind us once the session has run out", () => {
    const calendar = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2027-03-31" });
    expect(calendar.passed).toEqual([1, 2, 3, 4]);
    expect(calendar.upcoming).toEqual([]);
    expect(calendar.next).toBeNull();
  });
});

describe("isFinalNoticeWindow", () => {
  it("opens at T-3 and stays open through the due date", () => {
    expect(isFinalNoticeWindow(FINAL_NOTICE_DAYS_BEFORE_DUE)).toBe(true);
    expect(isFinalNoticeWindow(2)).toBe(true);
    expect(isFinalNoticeWindow(1)).toBe(true);
    // The due date itself still counts: it is the last day to pay for free.
    expect(isFinalNoticeWindow(0)).toBe(true);
  });

  it("stays shut earlier than T-3", () => {
    expect(isFinalNoticeWindow(4)).toBe(false);
    expect(isFinalNoticeWindow(10)).toBe(false);
  });

  it("stays shut once the date has gone", () => {
    // Past the date the family gets `late_fee_applied`, not a warning about a
    // fee that has already landed.
    expect(isFinalNoticeWindow(-1)).toBe(false);
  });
});

describe("lateFeeStartsOn", () => {
  it("is the day AFTER the due date, because the due date is still free", () => {
    expect(lateFeeStartsOn("2026-10-20")).toBe("2026-10-21");
  });

  it("crosses a month and a year boundary correctly", () => {
    expect(lateFeeStartsOn("2026-10-31")).toBe("2026-11-01");
    expect(lateFeeStartsOn("2026-12-31")).toBe("2027-01-01");
  });

  it("returns null rather than guessing at an unreadable date", () => {
    expect(lateFeeStartsOn("")).toBeNull();
    expect(lateFeeStartsOn("20-10-2026")).toBeNull();
  });
});

describe("describeDateGuard", () => {
  const today = "2026-09-03";

  it.each(["upcoming", "upcoming_final", "fee_due", "balance", "promise_lapsed", "prevyear"])(
    "refuses a date already gone on %s",
    (situation) => {
      const problem = describeDateGuard({
        situation,
        lastDateIso: "2026-08-25",
        lastDateLabel: "25-08-2026",
        today,
      });
      expect(problem).toContain("25-08-2026");
      expect(problem).toContain("already passed");
    },
  );

  it("accepts today itself — a parent can still pay before the counter shuts", () => {
    expect(
      describeDateGuard({ situation: "fee_due", lastDateIso: today, lastDateLabel: "03-09-2026", today }),
    ).toBeNull();
  });

  it("asks for a date when the field was empty or unreadable", () => {
    expect(
      describeDateGuard({ situation: "balance", lastDateIso: null, lastDateLabel: "", today }),
    ).toBe("Pick a last date for this notice before sending.");
  });

  it("waves late_fee_applied through, because it prints no date at all", () => {
    // Its seven slots are three names, the installment and three figures. The
    // whole subject of the notice is that a date HAS passed, so requiring a
    // future one would block the only notice that fits the situation.
    expect(
      describeDateGuard({
        situation: "late_fee_applied",
        lastDateIso: "2026-08-25",
        lastDateLabel: "25-08-2026",
        today,
      }),
    ).toBeNull();

    // Including with no date supplied whatsoever.
    expect(
      describeDateGuard({
        situation: "late_fee_applied",
        lastDateIso: null,
        lastDateLabel: "",
        today,
      }),
    ).toBeNull();
  });
});
