import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeDdMmYyyy,
  weekdayOfIsoDate,
} from "@/platform/helpers/date";
import {
  buildInstallmentCalendar,
  DERIVED_LAST_DATE_DAYS_AHEAD,
  derivedLastDateIso,
  describeDateGuard,
} from "@/modules/whatsapp/domain/installment-calendar";

/**
 * The date a reminder asks a family to pay by.
 *
 * Ten of the twelve notices print one, and a missing one is a BLOCKING finding:
 * no tick-box and no typed reason clears it. That made the one-tap reminder on
 * a student's page impossible to send at all — it posted no date, was refused,
 * and offered an override that could not work. These pin the two halves of the
 * repair: the app deriving the date it already knows, and both spellings of a
 * date being readable.
 */

const SCHEDULE = [
  { dueDate: "2026-04-20" },
  { dueDate: "2026-07-20" },
  { dueDate: "2026-10-20" },
  { dueDate: "2027-01-20" },
];

function calendarOn(today: string) {
  return buildInstallmentCalendar({ schedule: SCHEDULE, today });
}

describe("derivedLastDateIso", () => {
  it("is the next installment due date", () => {
    expect(derivedLastDateIso(calendarOn("2026-09-13"), "2026-09-13")).toBe("2026-10-20");
  });

  it("looks past the courtesy window", () => {
    /**
     * `next` is window-gated, because the window decides whether courtesy
     * WORDING is appropriate — not what the next due date IS. With a 10-day
     * window and installment 3 thirty-seven days out, `next` is null, and a
     * date derived from it would be null for about 320 days a year.
     */
    const narrow = buildInstallmentCalendar({
      schedule: SCHEDULE,
      today: "2026-09-13",
      windowDays: 10,
    });
    expect(narrow.next).toBeNull();
    expect(derivedLastDateIso(narrow, "2026-09-13")).toBe("2026-10-20");
  });

  it("falls a week forward once every installment has passed", () => {
    // February: nothing ahead in the schedule, and a notice still has to name a
    // date a parent can meet.
    const derived = derivedLastDateIso(calendarOn("2027-02-10"), "2027-02-10");
    expect(derived).toBe("2027-02-17");
    expect(DERIVED_LAST_DATE_DAYS_AHEAD).toBe(7);
  });

  it("never derives a Sunday, because the counter is shut on one", () => {
    // A date the app chose for itself must not be one the app then warns about:
    // the closed-counter guard fires on a notice naming a Sunday.
    const derived = derivedLastDateIso(
      buildInstallmentCalendar({ schedule: [], today: "2027-03-07" }),
      "2027-03-07",
    );
    expect(weekdayOfIsoDate("2027-03-14")).toBe(0);
    expect(derived).toBe("2027-03-15");
  });

  it("leaves a real due date alone even when it IS a Sunday", () => {
    // That is the ledger's deadline. Nudging it would tell a parent something
    // the fee calendar disagrees with; the guard warns instead.
    const sundayDue = buildInstallmentCalendar({
      schedule: [{ dueDate: "2026-10-18" }],
      today: "2026-10-01",
    });
    expect(weekdayOfIsoDate("2026-10-18")).toBe(0);
    expect(derivedLastDateIso(sundayDue, "2026-10-01")).toBe("2026-10-18");
  });

  it("produces a date the date guard accepts", () => {
    // The whole point. Whatever this returns must clear `describeDateGuard`,
    // or the one-tap send is refused again for the same reason.
    for (const today of ["2026-09-13", "2026-10-20", "2027-02-10", "2027-03-07"]) {
      const derived = derivedLastDateIso(calendarOn(today), today);
      expect(
        describeDateGuard({
          situation: "fee_due",
          lastDateIso: derived,
          lastDateLabel: derived ?? "",
          today,
        }),
        `derived ${derived} on ${today}`,
      ).toBeNull();
    }
  });
});

describe("normalizeDdMmYyyy", () => {
  it("reads both spellings of the same day", () => {
    // The bulk picker posts what a native date input posts — ISO. The typed box
    // it replaced posted DD-MM-YYYY, and old links still carry that.
    expect(normalizeDdMmYyyy("2026-10-20")).toBe("20-10-2026");
    expect(normalizeDdMmYyyy("20-10-2026")).toBe("20-10-2026");
  });

  it("reports nothing readable as no date at all", () => {
    expect(normalizeDdMmYyyy("")).toBe("");
    expect(normalizeDdMmYyyy(null)).toBe("");
    expect(normalizeDdMmYyyy("tomorrow")).toBe("");
  });

  it("rejects a well-formed impossible date in either spelling", () => {
    expect(normalizeDdMmYyyy("31-02-2026")).toBe("");
    expect(normalizeDdMmYyyy("2026-02-31")).toBe("");
  });
});

describe("weekdayOfIsoDate", () => {
  it("reads the weekday of the date LABEL, not of an instant in some zone", () => {
    // 2026-09-13 is a Sunday. Offsetting the label into an IST instant would put
    // it at 18:30 the previous UTC day and report Saturday, which is how the
    // closed-counter guard would go on being wrong in a new way.
    expect(weekdayOfIsoDate("2026-09-13")).toBe(0);
    expect(weekdayOfIsoDate("2026-10-20")).toBe(2);
  });

  it("says null when there is no date to read", () => {
    expect(weekdayOfIsoDate(null)).toBeNull();
    expect(weekdayOfIsoDate("20-10-2026")).toBeNull();
  });
});
