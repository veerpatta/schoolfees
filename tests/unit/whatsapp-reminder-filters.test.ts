import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_FILTERS,
  parseReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";

/**
 * The screen parses these off the query string and `sendRemindersAction` parses
 * them back off the posted form. The action's parse is the one that decides who
 * actually gets messaged, so any disagreement between the two sends a different
 * set of families than the office ticked.
 *
 * They were two copies until 2026-08-20, and the action's copy hardcoded
 * 1100 / [1,2] / 1 rather than reading the constants.
 */

/** How the page reads a query string. */
const fromQuery = (params: Record<string, string | string[] | undefined>) =>
  (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };

/** How the action reads a posted form. */
const fromForm = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return (key: string) => {
    const value = data.get(key);
    return typeof value === "string" ? value : null;
  };
};

describe("parseReminderFilters", () => {
  it("falls back to the shared defaults when nothing is supplied", () => {
    const filters = parseReminderFilters(fromQuery({}), "2026-27");

    expect(filters).toEqual({
      sessionLabel: "2026-27",
      maxTotalPaid: DEFAULT_REMINDER_FILTERS.maxTotalPaid,
      installments: [...DEFAULT_REMINDER_FILTERS.installments],
      minDueAmount: DEFAULT_REMINDER_FILTERS.minDueAmount,
      classId: null,
      includeRte: false,
    });
  });

  it("reads a missing number as its default, not as zero", () => {
    // `Number(formData.get(key))` is 0 for an absent field, and 0 here means
    // "paid at most nothing" — an audience of nobody, reported to the office as
    // "none of the selected students are still eligible".
    const filters = parseReminderFilters(fromForm({ classId: "abc" }), "2026-27");

    expect(filters.maxTotalPaid).toBe(DEFAULT_REMINDER_FILTERS.maxTotalPaid);
    expect(filters.minDueAmount).toBe(DEFAULT_REMINDER_FILTERS.minDueAmount);
  });

  it("gives the query string and the form the same answer", () => {
    const entries = {
      maxTotalPaid: "500",
      minDueAmount: "250",
      installments: "1,2,3",
      classId: " class-7 ",
      includeRte: "on",
    };

    expect(parseReminderFilters(fromQuery(entries), "2026-27")).toEqual(
      parseReminderFilters(fromForm(entries), "2026-27"),
    );
  });

  it("honours what was actually supplied", () => {
    const filters = parseReminderFilters(
      fromForm({
        maxTotalPaid: "0",
        minDueAmount: "5000",
        installments: "3",
        classId: " class-7 ",
        includeRte: "on",
      }),
      "TEST-2026-27",
    );

    expect(filters).toEqual({
      sessionLabel: "TEST-2026-27",
      maxTotalPaid: 0,
      installments: [3],
      minDueAmount: 5000,
      classId: "class-7",
      includeRte: true,
    });
  });

  it("drops installments outside 1-4 and falls back when none survive", () => {
    const filters = parseReminderFilters(fromQuery({ installments: "0,9,banana" }), "2026-27");

    expect(filters.installments).toEqual([...DEFAULT_REMINDER_FILTERS.installments]);
  });

  it("treats a blank or negative number as absent", () => {
    const filters = parseReminderFilters(
      fromQuery({ maxTotalPaid: "   ", minDueAmount: "-10" }),
      "2026-27",
    );

    expect(filters.maxTotalPaid).toBe(DEFAULT_REMINDER_FILTERS.maxTotalPaid);
    expect(filters.minDueAmount).toBe(DEFAULT_REMINDER_FILTERS.minDueAmount);
  });

  it("only counts the exact 'on' checkbox value as include-RTE", () => {
    expect(parseReminderFilters(fromQuery({ includeRte: "true" }), "2026-27").includeRte).toBe(false);
    expect(parseReminderFilters(fromQuery({ includeRte: "on" }), "2026-27").includeRte).toBe(true);
  });
});
