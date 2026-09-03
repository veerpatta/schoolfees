import { describe, expect, it } from "vitest";

import {
  compareByHour,
  compareByLanguage,
  compareByLeadTime,
  compareByWeekday,
  daysToPayHistogram,
  describeRunCost,
  medianDaysToPay,
  splitHoldout,
  WHATSAPP_MESSAGE_COST_RUPEES,
  type ComparableRun,
} from "@/modules/whatsapp/domain/run-measurement";

/**
 * Did the reminders work, and what did they cost?
 *
 * Every number here is shown to the owner as a reason to keep spending money on
 * this, or to stop. The holdout split additionally decides which real families
 * are deliberately not chased, so its rounding rule is not a detail.
 */

function run(overrides: Partial<ComparableRun> = {}): ComparableRun {
  return {
    language: "hi",
    situation: "fee_due",
    startedAt: "2026-09-03T04:30:00.000Z", // 10:00 IST, a Thursday
    messaged: 100,
    familiesPaid: 20,
    daysToPay: [0, 1, 2],
    scheduledFor: null,
    lastDate: "2026-09-13",
    ...overrides,
  };
}

describe("medianDaysToPay", () => {
  it("is null for nobody, not zero", () => {
    // Zero reads as "everyone paid the same day", the opposite of "nobody has
    // paid yet".
    expect(medianDaysToPay([])).toBeNull();
  });

  it("takes the middle of an odd list", () => {
    expect(medianDaysToPay([5, 1, 3])).toBe(3);
  });

  it("averages the middle two of an even list", () => {
    expect(medianDaysToPay([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("daysToPayHistogram", () => {
  it("gives 'same day' a bucket of its own", () => {
    // It is the outcome the office is hoping for, and burying it inside "0-2
    // days" would hide the only result that clearly follows from the message.
    const buckets = daysToPayHistogram([0, 0, 1, 5, 20]);
    expect(buckets.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ["Same day", 2],
      ["1-2 days", 1],
      ["3-6 days", 1],
      ["7-13 days", 0],
      ["14+ days", 1],
    ]);
  });

  it("uses fixed buckets so two runs can be read against each other", () => {
    const empty = daysToPayHistogram([]);
    expect(empty).toHaveLength(5);
    expect(empty.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("ignores impossible values rather than bucketing them", () => {
    const buckets = daysToPayHistogram([-3, Number.NaN, 0]);
    expect(buckets[0]!.count).toBe(1);
    expect(buckets.reduce((total, bucket) => total + bucket.count, 0)).toBe(1);
  });
});

describe("describeRunCost", () => {
  it("bills per MESSAGE, not per family", () => {
    // A second number for a family who has ignored two notices is a second
    // message and a second charge.
    const cost = describeRunCost({ messages: 200, collected: 100000 });
    expect(cost.messages).toBe(200);
    expect(cost.cost).toBe(Math.round(200 * WHATSAPP_MESSAGE_COST_RUPEES * 100) / 100);
  });

  it("reports rupees collected per rupee spent", () => {
    const cost = describeRunCost({ messages: 100, collected: 14500 });
    // 100 × 0.145 = 14.50 spent.
    expect(cost.cost).toBe(14.5);
    expect(cost.returnPerRupee).toBe(1000);
  });

  it("returns null rather than Infinity when nothing was spent", () => {
    // A screen reading "∞" teaches nobody anything.
    expect(describeRunCost({ messages: 0, collected: 5000 }).returnPerRupee).toBeNull();
  });
});

describe("comparisons", () => {
  it("compares Hindi against English", () => {
    const rows = compareByLanguage([
      run({ language: "hi", messaged: 100, familiesPaid: 30 }),
      run({ language: "en", messaged: 50, familiesPaid: 5 }),
    ]);
    expect(rows.map((row) => [row.label, row.responseRate])).toEqual([
      ["Hindi", 30],
      ["English", 10],
    ]);
  });

  it("returns null response rate when nobody was messaged", () => {
    // "Nobody was messaged" and "nobody responded" are different answers, and
    // only one of them is about the message.
    const rows = compareByLanguage([run({ messaged: 0, familiesPaid: 0 })]);
    expect(rows[0]!.responseRate).toBeNull();
  });

  it("groups by the school's weekday, not the server's", () => {
    // 2026-09-03T20:00Z is already Friday in IST. A server-clock weekday would
    // file it under Thursday and the office would read the wrong advice.
    const rows = compareByWeekday([run({ startedAt: "2026-09-03T20:00:00.000Z" })]);
    expect(rows[0]!.label).toBe("Friday");
  });

  it("bands the hour in twos rather than spreading runs over twenty-four", () => {
    const rows = compareByHour([
      run({ startedAt: "2026-09-03T04:30:00.000Z" }), // 10:00 IST
      run({ startedAt: "2026-09-03T05:30:00.000Z" }), // 11:00 IST
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("10:00-12:00");
    expect(rows[0]!.runs).toBe(2);
  });

  it("measures lead time from the notice's own date", () => {
    // How much warning a parent had, not whether somebody used the scheduler —
    // so an ad-hoc run is comparable with a scheduled one.
    const rows = compareByLeadTime([
      run({ startedAt: "2026-09-03T04:30:00.000Z", lastDate: "2026-09-13" }),
      run({ startedAt: "2026-09-11T04:30:00.000Z", lastDate: "2026-09-13" }),
      run({ startedAt: "2026-09-14T04:30:00.000Z", lastDate: "2026-09-13" }),
    ]);
    expect(rows.map((row) => row.label).sort()).toEqual([
      "1-3 days before",
      "8+ days before",
      "After the date",
    ]);
  });

  it("skips runs with nothing to group on rather than inventing a bucket", () => {
    expect(compareByLeadTime([run({ lastDate: null })])).toEqual([]);
  });
});

describe("splitHoldout", () => {
  /** Deterministic "random" so the split is testable. */
  const sequence = (values: number[]) => {
    let index = 0;
    return () => values[index++ % values.length]!;
  };

  it("holds back nobody at 0%", () => {
    const split = splitHoldout([1, 2, 3, 4], 0, sequence([0.5]));
    expect(split.heldOut).toEqual([]);
    expect(split.messaged).toHaveLength(4);
  });

  it("rounds DOWN, so the default is to chase the money", () => {
    // 10% of 15 holds back 1, not 2. A rounding rule that erred the other way
    // would be the school losing collections to a measurement.
    const audience = Array.from({ length: 15 }, (_, index) => index);
    const split = splitHoldout(audience, 10, sequence([0.1, 0.9, 0.4]));
    expect(split.heldOut).toHaveLength(1);
    expect(split.messaged).toHaveLength(14);
  });

  it("never holds back everybody", () => {
    // A run that messages nobody is not an experiment, it is a mistake.
    const split = splitHoldout([1], 50, sequence([0.9]));
    expect(split.messaged.length).toBeGreaterThanOrEqual(1);
  });

  it("caps the share, however large a number is asked for", () => {
    const audience = Array.from({ length: 100 }, (_, index) => index);
    const split = splitHoldout(audience, 90, sequence([0.3, 0.7, 0.1]));
    expect(split.heldOut.length).toBeLessThanOrEqual(50);
  });

  it("loses nobody and duplicates nobody", () => {
    const audience = Array.from({ length: 40 }, (_, index) => index);
    const split = splitHoldout(audience, 25, sequence([0.2, 0.8, 0.5, 0.1]));
    expect(split.messaged.length + split.heldOut.length).toBe(40);
    expect(new Set([...split.messaged, ...split.heldOut]).size).toBe(40);
  });

  it("keeps the caller's order in the messaged group", () => {
    // The audience arrives sorted by amount, and the spokesperson of each family
    // is its biggest debt. Shuffling the survivors would change who speaks.
    const audience = [10, 9, 8, 7, 6, 5];
    const split = splitHoldout(audience, 20, sequence([0.9, 0.1, 0.5]));
    expect(split.messaged).toEqual([...split.messaged].sort((a, b) => b - a));
  });
});
