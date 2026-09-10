import { describe, expect, it } from "vitest";

import {
  AUDIENCE_SHORTCUTS,
  describeAudience,
  matchingShortcut,
  shortcutFilters,
  type AudienceFilters,
  type AudienceShortcutKey,
} from "@/modules/whatsapp/domain/audience";
import { DEFAULT_REMINDER_FILTERS } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * The audience half of the reminders screen, after it stopped chasing money the
 * school had not asked for yet.
 *
 * Measured on the live 2026-27 ledger the day this changed: 479 families owed
 * something, 345 were past a due date, and the screen could ask all 479 for
 * ₹85,59,066 when only ₹27,85,517 was actually overdue — installments 3 and 4
 * are not due until 20 October and 20 January. Every rule below exists to keep
 * one of those two numbers from turning back into the other.
 */

const CONTEXT = { activeInstallments: [1, 2] as readonly number[], nextInstallment: 3 };

describe("the audience shortcuts", () => {
  it("is exactly five, named for who they describe", () => {
    // Nine until 2026-09-10, and twelve before that. A sixth should cost a
    // decision, not an import.
    expect(AUDIENCE_SHORTCUTS.map((entry) => entry.key)).toEqual([
      "overdue",
      "nothing_paid",
      "late_fee",
      "last_session",
      "not_due_yet",
    ]);
    expect(AUDIENCE_SHORTCUTS.map((entry) => entry.label)).toEqual([
      "Overdue",
      "Nothing paid yet",
      "Carrying a late fee",
      "Owes from last session",
      "Not late yet",
    ]);
  });

  it("opens on Overdue, not on the default template's audience", () => {
    // The point of the split, finally showing up in the default. The opening
    // TEMPLATE is "Fee due" because it is the commonest wording; the opening
    // AUDIENCE is everyone late. Deriving the second from the first opened the
    // screen on 132 families instead of 345.
    const overdue = shortcutFilters("overdue", CONTEXT);
    expect(DEFAULT_REMINDER_FILTERS.overdue).toBe("yes");
    expect(DEFAULT_REMINDER_FILTERS.quote).toBe("overdue");
    expect(DEFAULT_REMINDER_FILTERS.maxTotalPaid).toBe(overdue.maxTotalPaid);
    expect(DEFAULT_REMINDER_FILTERS.installments).toEqual([]);
  });

  it("asks about being late on every chip except the two that cannot", () => {
    const overdueRule = (key: AudienceShortcutKey) => shortcutFilters(key, CONTEXT).overdue;

    expect(overdueRule("overdue")).toBe("yes");
    expect(overdueRule("nothing_paid")).toBe("yes");
    expect(overdueRule("late_fee")).toBe("yes");

    // "Not late yet" is the courtesy audience — being late is what excludes them.
    expect(overdueRule("not_due_yet")).toBe("no");

    /**
     * And the one that would go silently empty.
     *
     * A carry-forward balance is an `installments` row with
     * `installment_no = 99` — outside the 1-4 range `pendingFor` reads — so it
     * can NEVER appear in `overdueInstallments`. An overdue-only carry-forward
     * audience therefore drops any family who has cleared this session but
     * still owes last year's, and drops them by simply coming back smaller.
     *
     * All 37 families still owing carry-forward money happen to be overdue on
     * installment 1 or 2 today, which is exactly why this would have gone
     * unnoticed until it did not.
     */
    expect(overdueRule("last_session")).toBe("any");
  });

  it("quotes what is overdue by default, and never the whole year", () => {
    expect(shortcutFilters("overdue", CONTEXT).quote).toBe("overdue");
    expect(shortcutFilters("nothing_paid", CONTEXT).quote).toBe("overdue");
    expect(shortcutFilters("last_session", CONTEXT).quote).toBe("prev_year");
    expect(shortcutFilters("late_fee", CONTEXT).quote).toBe("ledger_fees");
    expect(shortcutFilters("not_due_yet", CONTEXT).quote).toBe("next");

    // No chip reaches for the session balance. It is still available under
    // Fine-tune, because a parent settling the year in one go needs it.
    for (const entry of AUDIENCE_SHORTCUTS) {
      expect(shortcutFilters(entry.key, CONTEXT).quote).not.toBe("session");
    }
  });

  it("keeps the four dropped audiences reachable, as Custom", () => {
    // They left the chip row; they did not leave the screen. Each is one
    // Fine-tune control away, and the panel says "Custom" and opens the
    // disclosure when the filters match no chip — which is honest, because the
    // office narrowed the list by hand.
    const base = shortcutFilters("overdue", CONTEXT);
    const dropped: Record<string, Partial<AudienceFilters>> = {
      "everyone who owes": { overdue: "any", quote: "session" },
      "part paid, still owing": { minTotalPaid: 1100 },
      "promised, due now": { promise: "due_soon" },
      "promise broken": { promise: "lapsed" },
    };

    for (const [name, override] of Object.entries(dropped)) {
      const filters = {
        ...base,
        classId: null,
        includeRte: false,
        includeStudentIds: [],
        excludeStudentIds: [],
        ...override,
      } as AudienceFilters;
      expect(matchingShortcut(filters, CONTEXT), name).toBeNull();
    }
  });
});

describe("describeAudience", () => {
  const filters = (override: Partial<AudienceFilters> = {}): AudienceFilters =>
    ({
      ...shortcutFilters("overdue", CONTEXT),
      classId: null,
      includeRte: false,
      includeStudentIds: [],
      excludeStudentIds: [],
      ...override,
    }) as AudienceFilters;

  it("states the live default in words, with the real figures", () => {
    const sentence = describeAudience(filters(), { count: 345, quotedTotal: 2785517 });

    expect(sentence).toContain("Sending to 345 families whose fees are past a due date.");
    expect(sentence).toContain("Asking for ₹27,85,517 — the overdue amount only.");
    // Nothing is held and nothing is narrowed, so no clause claims otherwise.
    expect(sentence).not.toContain("held back");
    expect(sentence).not.toContain("installment");
  });

  it("says one family, not 1 families", () => {
    expect(describeAudience(filters(), { count: 1, quotedTotal: 5000 })).toContain(
      "Sending to 1 family",
    );
  });

  it("names the whole-year ask as what it is", () => {
    // The office should never reach this basis by accident, so when they do
    // choose it the sentence says out loud what is inside the figure.
    const sentence = describeAudience(filters({ overdue: "any", quote: "session" }), {
      count: 479,
      quotedTotal: 8559066,
    });
    expect(sentence).toContain("₹85,59,066");
    expect(sentence).toContain("the whole session balance, including what is not due yet");
  });

  it("accounts for the families a chip counts and the send does not", () => {
    /**
     * The active chip counts an AUDIENCE; the sentence counts today's SEND. They
     * differ by the reversible hold-backs, so the live screen read "Overdue 298"
     * directly above "Sending to 292 families" with nothing explaining the six.
     * Both numbers were right and the pair looked like a bug.
     */
    // Nothing held: no clause at all. There are zero promises on the live
    // session, so a standing "0 held back" would be noise on every load.
    expect(
      describeAudience(filters(), { count: 345, quotedTotal: 1, heldByPromise: 0, heldByCadence: 0 }),
    ).not.toContain("held back");

    // Cadence alone — the live case, 292 sent against a chip reading 298.
    const cadence = describeAudience(filters(), {
      count: 292,
      quotedTotal: 2295084,
      heldByCadence: 6,
    });
    expect(cadence).toContain("6 more are held back by reminder cadence");
    expect(cadence).toContain("on the chip above, not in this send");
    // One reason, so the count is not repeated inside it.
    expect(cadence).not.toContain("6 by reminder cadence");

    // Both reasons, summed and itemised.
    const both = describeAudience(filters(), {
      count: 12,
      quotedTotal: 1,
      heldByPromise: 3,
      heldByCadence: 2,
    });
    expect(both).toContain("5 more are held back");
    expect(both).toContain("3 inside their own promise");
    expect(both).toContain("2 by reminder cadence");

    // A promise hold-back is only real under `skip_open`; on any other promise
    // value the office asked for those families deliberately.
    expect(
      describeAudience(filters({ promise: "any" }), {
        count: 12,
        quotedTotal: 1,
        heldByPromise: 3,
      }),
    ).not.toContain("own promise");
  });

  it("lists only the narrowings that are actually set", () => {
    const sentence = describeAudience(
      filters({ installments: [1, 2], minDueAmount: 500, includeStudentIds: ["a", "b"] }),
      { count: 9, quotedTotal: 40000, className: "Class 5" },
    );
    expect(sentence).toContain("Class 5 only");
    expect(sentence).toContain("installment 1 and 2 all pending");
    expect(sentence).toContain("at least ₹500");
    expect(sentence).toContain("2 added by hand");
    expect(sentence).not.toContain("removed by hand");
  });

  it("never applies a constraint it does not mention", () => {
    /**
     * The bug this pins was silent and shipped for an hour.
     *
     * The paid-so-far bounds used to be folded into the head clause and only on
     * the `overdue: "yes"` branch. So a real run — overdue select on "All open
     * dues", the ₹1,100 ceiling still carried from the fee-due preset — read
     * "Sending to 96 families with fees still open, overdue or not" and said
     * nothing about the ceiling that took it from 422 to 96. That is the worst
     * possible failure for this line: the office reads a wide audience, gets a
     * narrow one, and the sentence written to explain the number is what hides
     * it. Every constraint that changes who is messaged must appear.
     */
    const wide = describeAudience(filters({ overdue: "any", quote: "session", maxTotalPaid: 1100 }), {
      count: 96,
      quotedTotal: 1965500,
    });
    // Case-insensitive on the first letter: the narrowings are their own
    // sentence, so whichever clause lands first gets capitalised.
    expect(wide).toMatch(/paid nothing beyond the academic fee/i);

    // And on every other head clause too, not just the one it used to live on.
    for (const overdue of ["yes", "no", "any"] as const) {
      expect(
        describeAudience(filters({ overdue, maxTotalPaid: 5000 }), { count: 3, quotedTotal: 1 }),
        overdue,
      ).toMatch(/paid at most ₹5,000/i);
      expect(
        describeAudience(filters({ overdue, minTotalPaid: 1100 }), { count: 3, quotedTotal: 1 }),
        overdue,
      ).toMatch(/have paid something already/i);
    }
  });

  it("formats every figure through the one money helper", () => {
    // `quality:budgets` fails on a hand-written ₹ anywhere else, and a sentence
    // quoting a bare "1234567" is its own bug.
    const sentence = describeAudience(filters(), { count: 2, quotedTotal: 1234567 });
    expect(sentence).toContain("₹12,34,567");
    expect(sentence).not.toContain("1234567");
  });
});
