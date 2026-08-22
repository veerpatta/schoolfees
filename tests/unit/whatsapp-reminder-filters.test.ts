import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_FILTERS,
  parseReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import { DEFAULT_LANGUAGE, DEFAULT_SITUATION } from "@/modules/whatsapp/domain/campaigns";

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
      situation: DEFAULT_SITUATION,
      language: DEFAULT_LANGUAGE,
      lastDate: "",
      lateFeeAmount: 0,
      lateFeeBasis: DEFAULT_REMINDER_FILTERS.lateFeeBasis,
    });
  });

  it("opens the late fee on the real policy, so the message agrees with the receipt", () => {
    // The caller passes what the ledger charges. Quoting something else has to
    // be a deliberate act, not what happens when nobody touches the control.
    const filters = parseReminderFilters(fromQuery({}), "2026-27", "20-10-2026", 1000);

    expect(filters.lateFeeAmount).toBe(1000);
    expect(filters.lateFeeBasis).toBe("per_installment");
  });

  it("opens the previous-session notice on 'not charged'", () => {
    // Carry-forward rows carry a late-fee rate of 0 in the ledger, so that
    // notice must not default to threatening one.
    const filters = parseReminderFilters(
      fromQuery({ situation: "prevyear" }),
      "2026-27",
      "30-09-2026",
      1000,
    );

    expect(filters.lateFeeBasis).toBe("none");
  });

  it("keeps an explicit basis over the per-notice fallback", () => {
    const filters = parseReminderFilters(
      fromQuery({ situation: "prevyear", lateFeeBasis: "per_day", lateFeeAmount: "50" }),
      "2026-27",
      "30-09-2026",
      1000,
    );

    expect(filters.lateFeeBasis).toBe("per_day");
    expect(filters.lateFeeAmount).toBe(50);
  });

  it("falls back on a basis that is not one of the four", () => {
    const filters = parseReminderFilters(fromQuery({ lateFeeBasis: "per_fortnight" }), "2026-27");

    expect(filters.lateFeeBasis).toBe(DEFAULT_REMINDER_FILTERS.lateFeeBasis);
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
      situation: DEFAULT_SITUATION,
      language: DEFAULT_LANGUAGE,
      lastDate: "",
      lateFeeAmount: 0,
      lateFeeBasis: DEFAULT_REMINDER_FILTERS.lateFeeBasis,
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

  it("carries the notice and the language through", () => {
    const filters = parseReminderFilters(
      fromQuery({ situation: "prevyear", language: "en", lastDate: "20-10-2026" }),
      "2026-27",
    );

    expect(filters.situation).toBe("prevyear");
    expect(filters.language).toBe("en");
    expect(filters.lastDate).toBe("20-10-2026");
  });

  it("falls back rather than throwing on a hand-edited notice", () => {
    // A URL someone typed must not be able to take the screen down, and must
    // never resolve to a campaign nobody chose.
    const filters = parseReminderFilters(
      fromQuery({ situation: "waiver", language: "fr" }),
      "2026-27",
    );

    expect(filters.situation).toBe(DEFAULT_SITUATION);
    expect(filters.language).toBe(DEFAULT_LANGUAGE);
  });

  it("takes the supplied default date only when none is in the URL", () => {
    expect(parseReminderFilters(fromQuery({}), "2026-27", "20-10-2026").lastDate).toBe(
      "20-10-2026",
    );
    expect(
      parseReminderFilters(fromQuery({ lastDate: "01-01-2027" }), "2026-27", "20-10-2026")
        .lastDate,
    ).toBe("01-01-2027");
  });

  it("gives the query string and the form the same answer for the notice", () => {
    const entries = { situation: "balance", language: "en", lastDate: "20-10-2026" };
    expect(parseReminderFilters(fromQuery(entries), "2026-27")).toEqual(
      parseReminderFilters(fromForm(entries), "2026-27"),
    );
  });

  it("only counts the exact 'on' checkbox value as include-RTE", () => {
    expect(parseReminderFilters(fromQuery({ includeRte: "true" }), "2026-27").includeRte).toBe(false);
    expect(parseReminderFilters(fromQuery({ includeRte: "on" }), "2026-27").includeRte).toBe(true);
  });
});
