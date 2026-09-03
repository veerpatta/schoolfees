import { describe, expect, it } from "vitest";

import {
  campaignsDueOn,
  describeSchedule,
  OVERDUE_SLOT_WINDOW_DAYS,
  parseCampaignSchedule,
  scheduledDateFor,
  type ScheduledCampaignInput,
} from "@/modules/whatsapp/domain/campaign-schedule";
import { buildInstallmentCalendar } from "@/modules/whatsapp/domain/installment-calendar";

/**
 * When a saved campaign is due to run.
 *
 * "Send the T-10 reminder for installment 3" used to live in somebody's head.
 * Every branch here decides whether a real family is asked for money on a
 * particular day, so all of them are pinned — and `today` is always passed, so
 * none of these rot in October.
 */

const SCHEDULE = [
  { dueDate: "2026-04-20" },
  { dueDate: "2026-07-20" },
  { dueDate: "2026-10-20" },
  { dueDate: "2027-01-20" },
];

/** A calendar is only used here to look up an installment's due date. */
const calendar = buildInstallmentCalendar({ schedule: SCHEDULE, today: "2026-10-10" });

function campaign(overrides: Partial<ScheduledCampaignInput> = {}): ScheduledCampaignInput {
  return {
    id: "c1",
    name: "Installment 3 — T-10",
    situation: "upcoming",
    language: "hi",
    schedule: { installment: 3, offsetDays: -10 },
    ranForSlots: [],
    ...overrides,
  };
}

describe("parseCampaignSchedule", () => {
  it("reads an installment offset", () => {
    expect(parseCampaignSchedule({ installment: 3, offsetDays: -10 })).toEqual({
      installment: 3,
      offsetDays: -10,
      auto: false,
    });
  });

  it("treats a missing offset as the due date itself", () => {
    // 0 is meaningful — "on the day it falls due" — so a missing offset must not
    // invalidate the whole schedule.
    expect(parseCampaignSchedule({ installment: 2 })).toEqual({
      installment: 2,
      offsetDays: 0,
      auto: false,
    });
  });

  it("reads an absolute one-off", () => {
    expect(parseCampaignSchedule({ runOn: "2026-10-15" })).toEqual({
      runOn: "2026-10-15",
      auto: false,
    });
  });

  it("only turns auto on for a literal true", () => {
    // Absent, null, "true" and 1 all read as off. A schedule added without
    // deciding must never start sending on its own.
    expect(parseCampaignSchedule({ installment: 3, auto: true })!.auto).toBe(true);
    for (const value of [undefined, null, "true", 1, "yes"]) {
      expect(parseCampaignSchedule({ installment: 3, auto: value })!.auto).toBe(false);
    }
  });

  it("returns null for anything unusable rather than throwing", () => {
    // A hand-edited or half-written schedule must leave the campaign runnable by
    // hand, not take the screen down.
    for (const value of [null, undefined, {}, [], "installment 3", 7, { installment: 9 }]) {
      expect(parseCampaignSchedule(value)).toBeNull();
    }
  });
});

describe("scheduledDateFor", () => {
  it("counts back from the installment's real due date", () => {
    expect(
      scheduledDateFor({ installment: 3, offsetDays: -10 }, calendar),
    ).toBe("2026-10-10");
  });

  it("counts forward for a chase after the date", () => {
    expect(scheduledDateFor({ installment: 3, offsetDays: 15 }, calendar)).toBe("2026-11-04");
  });

  it("lands on the due date itself at offset zero", () => {
    expect(scheduledDateFor({ installment: 3, offsetDays: 0 }, calendar)).toBe("2026-10-20");
  });

  it("returns an absolute date unchanged", () => {
    expect(scheduledDateFor({ runOn: "2026-12-01" }, calendar)).toBe("2026-12-01");
  });

  it("returns null when the calendar has no date for that installment", () => {
    // Treating it as "today" would fire every scheduled campaign at once the
    // first time a session was published without a schedule.
    const empty = buildInstallmentCalendar({ schedule: [], today: "2026-10-10" });
    expect(scheduledDateFor({ installment: 3, offsetDays: -10 }, empty)).toBeNull();
  });
});

describe("campaignsDueOn", () => {
  it("offers a campaign on its slot day", () => {
    const due = campaignsDueOn([campaign()], calendar, "2026-10-10");
    expect(due).toHaveLength(1);
    expect(due[0]!.scheduledFor).toBe("2026-10-10");
    expect(due[0]!.daysOverdue).toBe(0);
  });

  it("says nothing while the slot is still ahead", () => {
    expect(campaignsDueOn([campaign()], calendar, "2026-10-09")).toEqual([]);
  });

  it("keeps asking for a week after a missed slot", () => {
    // A slot that came due while the office was shut should still be visible on
    // Monday.
    const due = campaignsDueOn([campaign()], calendar, "2026-10-15");
    expect(due).toHaveLength(1);
    expect(due[0]!.daysOverdue).toBe(5);
  });

  it("stops asking once the slot is history", () => {
    // Past the window it is not "due", it is gone — and a T-10 notice sent three
    // weeks late would quote a deadline the date guard would refuse anyway.
    const past = campaignsDueOn([campaign()], calendar, "2026-10-18");
    expect(past).toEqual([]);
    expect(OVERDUE_SLOT_WINDOW_DAYS).toBe(7);
  });

  it("drops a campaign whose slot has already been run", () => {
    expect(
      campaignsDueOn([campaign({ ranForSlots: ["2026-10-10"] })], calendar, "2026-10-10"),
    ).toEqual([]);
  });

  it("compares on the SLOT, so a slot run a day late still counts", () => {
    // The run happened on the 11th but satisfied the 10th's slot. Comparing
    // dates rather than slots would leave it forever due.
    expect(
      campaignsDueOn([campaign({ ranForSlots: ["2026-10-10"] })], calendar, "2026-10-11"),
    ).toEqual([]);
  });

  it("does not let one slot's run satisfy another", () => {
    const twoSlots = [
      campaign({ id: "t10", schedule: { installment: 3, offsetDays: -10 }, ranForSlots: ["2026-10-10"] }),
      campaign({ id: "t3", name: "T-3", schedule: { installment: 3, offsetDays: -3 }, ranForSlots: ["2026-10-10"] }),
    ];
    const due = campaignsDueOn(twoSlots, calendar, "2026-10-17");
    expect(due.map((entry) => entry.id)).toEqual(["t3"]);
  });

  it("puts the longest-waiting slot first", () => {
    // The one that has been waiting longest is the one at risk of being missed.
    //
    // Read on 2026-10-17: the T-10 slot (2026-10-10) is seven days overdue and
    // still just inside the window, and the T-3 slot (2026-10-17) is due today.
    const due = campaignsDueOn(
      [
        campaign({ id: "t3", name: "T-3", schedule: { installment: 3, offsetDays: -3 } }),
        campaign({ id: "t10", name: "T-10", schedule: { installment: 3, offsetDays: -10 } }),
      ],
      calendar,
      "2026-10-17",
    );
    expect(due.map((entry) => entry.id)).toEqual(["t10", "t3"]);
    expect(due.map((entry) => entry.daysOverdue)).toEqual([7, 0]);
  });

  it("ignores a campaign with no schedule at all", () => {
    expect(campaignsDueOn([campaign({ schedule: null })], calendar, "2026-10-10")).toEqual([]);
  });

  it("reports auto separately, and off by default", () => {
    const manual = campaignsDueOn([campaign()], calendar, "2026-10-10");
    expect(manual[0]!.auto).toBe(false);

    const automatic = campaignsDueOn(
      [campaign({ schedule: { installment: 3, offsetDays: -10, auto: true } })],
      calendar,
      "2026-10-10",
    );
    expect(automatic[0]!.auto).toBe(true);
  });
});

describe("describeSchedule", () => {
  it.each([
    [{ installment: 3, offsetDays: -10 }, "10 days before Installment 3 is due"],
    [{ installment: 3, offsetDays: -1 }, "1 day before Installment 3 is due"],
    [{ installment: 2, offsetDays: 0 }, "On the day Installment 2 falls due"],
    [{ installment: 1, offsetDays: 1 }, "1 day after Installment 1 was due"],
    [{ installment: 4, offsetDays: 15 }, "15 days after Installment 4 was due"],
    [{ runOn: "2026-12-01" }, "On 2026-12-01"],
  ])("reads %j as %s", (schedule, expected) => {
    // Written out rather than shown as `-10`: a minus sign in front of a number
    // of days is the kind of thing read backwards once and then acted on.
    expect(describeSchedule(schedule)).toBe(expected);
  });
});
