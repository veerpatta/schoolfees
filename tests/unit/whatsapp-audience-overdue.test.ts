import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUDIENCE_FILTERS,
  describeAudience,
  type AudienceFilters,
} from "@/modules/whatsapp/domain/audience";

/**
 * The one sentence describing the list, built from the tiles.
 *
 * `describeAudience` returns PARTS — a phone renders them at three weights,
 * because as one string this measured six lines and 124px of uniform semibold
 * at 390px — and `full` is the one composition of them, so these assertions
 * still exercise the real text. Every constraint that changes who is messaged
 * must appear in it: a wide audience described and a narrow one delivered is
 * the worst thing this line can do.
 */

const filters = (override: Partial<AudienceFilters> = {}): AudienceFilters => ({
  ...DEFAULT_AUDIENCE_FILTERS,
  installments: [1, 2],
  ...override,
});

const say = (...args: Parameters<typeof describeAudience>) => describeAudience(...args).full;

describe("describeAudience", () => {
  it("states the live default in words, with the real figures", () => {
    // 2026-09-10: tiles 1 and 2, owing on both — 187 families.
    const parts = describeAudience(filters(), { count: 187, quotedTotal: 2295084 });

    // The two figures a person checks, in one glance.
    expect(parts.headline).toBe("187 families · ₹22,95,084");
    // No count in the claim — the headline has it, and the two render one
    // under the other.
    expect(parts.claim).toBe(
      "still owing on installments 1 and 2, every one of them, for the fees on those installments.",
    );
    expect(parts.claim).not.toContain("187");
    expect(parts.full).toContain("Sending to 187 families still owing on installments 1 and 2");
    // RTE students are left out by default, and that is a constraint that
    // changes who is messaged — so it is said.
    expect(parts.notes.join(" ")).toContain("RTE students left out");
    expect(parts.full).not.toContain("held back");
  });

  it("says 'any of them' when the toggle is flipped, and names a single tile plainly", () => {
    expect(say(filters({ installmentMatch: "any" }), { count: 345, quotedTotal: 1 })).toContain(
      "installments 1 and 2, any of them",
    );
    expect(say(filters({ installments: [2] }), { count: 144, quotedTotal: 1 })).toContain(
      "still owing on installment 2, for the fees on it",
    );
    expect(say(filters({ installments: [1, 2, 3] }), { count: 9, quotedTotal: 1 })).toContain(
      "installments 1, 2 and 3",
    );
  });

  it("describes the Last-year tile as last session's balance", () => {
    const parts = describeAudience(filters({ lastYear: true, installments: [] }), {
      count: 35,
      quotedTotal: 412000,
    });
    expect(parts.claim).toBe(
      "who still owe a balance carried over from last session, for what is left of that balance.",
    );
    expect(parts.full).not.toContain("installment");
  });

  it("says one family, not 1 families", () => {
    expect(say(filters(), { count: 1, quotedTotal: 5000 })).toContain("Sending to 1 family");
    expect(describeAudience(filters(), { count: 1, quotedTotal: 5000 }).headline).toBe(
      "1 family · ₹5,000",
    );
  });

  it("accounts for the families a tile counts and the send does not", () => {
    /**
     * A tile counts an AUDIENCE; the sentence counts today's SEND. They differ
     * by the reversible hold-backs, so a tile reading 298 directly above
     * "292 families" looks like a bug until the difference is stated.
     */
    expect(
      say(filters(), { count: 345, quotedTotal: 1, heldByPromise: 0, heldByCadence: 0 }),
    ).not.toContain("held back");

    const cadence = say(filters(), { count: 292, quotedTotal: 2295084, heldByCadence: 6 });
    expect(cadence).toContain("6 more are held back by reminder cadence");
    expect(cadence).toContain("counted on the tile, not in this send");
    expect(cadence).not.toContain("6 by reminder cadence");

    const both = say(filters(), { count: 12, quotedTotal: 1, heldByPromise: 3, heldByCadence: 2 });
    expect(both).toContain("5 more are held back");
    expect(both).toContain("3 inside their own promise");
    expect(both).toContain("2 by reminder cadence");

    // A promise hold-back is only real under `skip_open`; on any other promise
    // value the office asked for those families deliberately.
    expect(
      say(filters({ promise: "any" }), { count: 12, quotedTotal: 1, heldByPromise: 3 }),
    ).not.toContain("own promise");
  });

  it("lists only the narrowings that are actually set", () => {
    const sentence = say(
      filters({
        paid: "nothing",
        lateFee: "yes",
        minDueAmount: 500,
        includeRte: true,
        includeStudentIds: ["a", "b"],
      }),
      { count: 9, quotedTotal: 40000, className: "Class 5" },
    );
    expect(sentence).toContain("Class 5 only");
    expect(sentence).toContain("paid nothing beyond the academic fee");
    expect(sentence).toContain("the ledger is charging a late fee on those installments");
    expect(sentence).toContain("at least ₹500");
    expect(sentence).toContain("2 added by hand");
    expect(sentence).not.toContain("removed by hand");
    expect(sentence).not.toContain("RTE students left out");

    const courtesy = say(filters({ installments: [3], skipOverdue: true, promise: "lapsed" }), {
      count: 2,
      quotedTotal: 1,
    });
    // Case-insensitive on the first letter: the narrowings are their own
    // sentence, so whichever clause lands first gets capitalised.
    expect(courtesy).toMatch(/not already overdue on an earlier installment/i);
    expect(courtesy).toContain("promise: Only a promise that has lapsed");
  });

  it("never applies a constraint it does not mention", () => {
    // Every narrowing control, one at a time, must leave a trace in the text.
    const cases: Array<[Partial<AudienceFilters>, RegExp]> = [
      [{ paid: "part" }, /have paid something already/i],
      [{ lateFee: "no" }, /no late fee charged/i],
      [{ promise: "due_soon" }, /due today or tomorrow/i],
      [{ promise: "any" }, /promises ignored/i],
      [{ minDueAmount: 2500 }, /at least ₹2,500/i],
      [{ excludeStudentIds: ["x"] }, /1 removed by hand/i],
    ];
    for (const [override, pattern] of cases) {
      expect(say(filters(override), { count: 3, quotedTotal: 1 }), JSON.stringify(override)).toMatch(
        pattern,
      );
    }
  });

  it("formats every figure through the one money helper", () => {
    // `quality:budgets` fails on a hand-written ₹ anywhere else, and a sentence
    // quoting a bare "1234567" is its own bug.
    const sentence = say(filters(), { count: 2, quotedTotal: 1234567 });
    expect(sentence).toContain("₹12,34,567");
    expect(sentence).not.toContain("1234567");
  });
});
