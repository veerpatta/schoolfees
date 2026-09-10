import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_FILTERS,
  parseReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import {
  reminderQuery,
  REMINDER_QUERY_KEYS,
} from "@/modules/whatsapp/domain/audience";
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

/** What a bare screen parses to, given what the tiles open on. */
const expectedDefaults = (sessionLabel: string, installments: number[]) => ({
  sessionLabel,
  installments,
  lastYear: false,
  installmentMatch: "all",
  paid: "any",
  minDueAmount: DEFAULT_REMINDER_FILTERS.minDueAmount,
  lateFee: "any",
  promise: "skip_open",
  skipOverdue: false,
  classId: null,
  includeRte: false,
  includeStudentIds: [],
  excludeStudentIds: [],
  lateFeeSource: "custom",
  policyLateFeeAmount: 0,
  situation: DEFAULT_SITUATION,
  language: DEFAULT_LANGUAGE,
  lastDate: "",
  lateFeeAmount: 0,
  lateFeeBasis: DEFAULT_REMINDER_FILTERS.lateFeeBasis,
  preDueWindowDays: DEFAULT_REMINDER_FILTERS.preDueWindowDays,
});

describe("parseReminderFilters", () => {
  it("falls back to the shared defaults when nothing is supplied", () => {
    const filters = parseReminderFilters(fromQuery({}), "2026-27");

    // The tiles open on what the caller passes — the calendar's passed set in
    // production — and on installment 1 when nothing is passed at all.
    expect(filters).toEqual(expectedDefaults("2026-27", [1]));
  });

  it("opens the tiles on the calendar's default, never on a constant", () => {
    // `resolveReminderContext` passes `defaultInstallmentsFor(calendar)`. Before
    // 2026-09-10 this was a hardcoded [1, 2], true in August and silently wrong
    // from October.
    const filters = parseReminderFilters(fromQuery({}), "2026-27", undefined, undefined, [1, 2, 3]);

    expect(filters.installments).toEqual([1, 2, 3]);
    expect(filters.lastYear).toBe(false);
  });

  it("reads `last_year` as the Last-year tile, which clears the four", () => {
    const filters = parseReminderFilters(fromQuery({ installments: "last_year" }), "2026-27");

    expect(filters.lastYear).toBe(true);
    expect(filters.installments).toEqual([]);
  });

  it("lets `last_year` win over installments named beside it", () => {
    // One key carries both, so no URL can mean both. A hand-edited
    // `last_year,2` is Last year, not a third state.
    const filters = parseReminderFilters(fromQuery({ installments: "last_year,2" }), "2026-27");

    expect(filters.lastYear).toBe(true);
    expect(filters.installments).toEqual([]);
  });

  it("opens on the default for a blank, absent or garbage installment value", () => {
    // Zero tiles is not a state — the quoted amount is derived from the tiles,
    // and an empty set would quote ₹0 to everybody. Until 2026-09-10 a blank
    // meant "no installment constraint"; that state is retired. And garbage
    // (`0,9,banana` from a hand-edited URL) must never be read as a choice.
    for (const value of ["", "   ", "0,9,banana"]) {
      const filters = parseReminderFilters(fromQuery({ installments: value }), "2026-27", undefined, undefined, [1, 2]);
      expect(filters.installments).toEqual([1, 2]);
      expect(filters.lastYear).toBe(false);
    }
  });

  it("sorts and deduplicates the tiles, and drops anything outside 1-4", () => {
    const filters = parseReminderFilters(fromQuery({ installments: "3,1,3,9" }), "2026-27");

    expect(filters.installments).toEqual([1, 3]);
  });

  it("reads the paid-so-far band, and falls back on anything else", () => {
    expect(parseReminderFilters(fromQuery({ paid: "nothing" }), "2026-27").paid).toBe("nothing");
    expect(parseReminderFilters(fromQuery({ paid: "part" }), "2026-27").paid).toBe("part");
    expect(parseReminderFilters(fromQuery({ paid: "everything" }), "2026-27").paid).toBe("any");
  });

  it("falls back to the promise hold-back on a value from before the tiles", () => {
    // `open` and `none` were promise filters until 2026-09-10. A bookmark
    // carrying one lands on the default rather than on nobody.
    expect(parseReminderFilters(fromQuery({ promise: "open" }), "2026-27").promise).toBe("skip_open");
    expect(parseReminderFilters(fromQuery({ promise: "none" }), "2026-27").promise).toBe("skip_open");
    expect(parseReminderFilters(fromQuery({ promise: "lapsed" }), "2026-27").promise).toBe("lapsed");
    expect(parseReminderFilters(fromQuery({ promise: "due_soon" }), "2026-27").promise).toBe("due_soon");
  });

  it("only counts the exact 'on' checkbox value for the two checkboxes", () => {
    expect(parseReminderFilters(fromQuery({ includeRte: "true" }), "2026-27").includeRte).toBe(false);
    expect(parseReminderFilters(fromQuery({ includeRte: "on" }), "2026-27").includeRte).toBe(true);
    expect(parseReminderFilters(fromQuery({ skipOverdue: "true" }), "2026-27").skipOverdue).toBe(false);
    expect(parseReminderFilters(fromQuery({ skipOverdue: "on" }), "2026-27").skipOverdue).toBe(true);
  });

  it("ignores the keys retired on 2026-09-10, and never re-emits them", () => {
    // `maxTotalPaid`, `minTotalPaid`, `overdue`, `carryForward` and `quote` are
    // not in `REMINDER_QUERY_KEYS`, so nothing reads them and a link that still
    // carries them lands on exactly what a bare link does.
    const stale = {
      maxTotalPaid: "500",
      minTotalPaid: "1100",
      overdue: "yes",
      carryForward: "yes",
      quote: "session",
    };
    const parsed = parseReminderFilters(fromQuery(stale), "2026-27");
    expect(parsed).toEqual(parseReminderFilters(fromQuery({}), "2026-27"));

    const query = reminderQuery(parsed);
    for (const key of Object.keys(stale)) {
      expect(query.has(key)).toBe(false);
      expect(REMINDER_QUERY_KEYS as readonly string[]).not.toContain(key);
    }
  });

  it("round-trips through the query string it emits — tiles and Last year alike", () => {
    // The tile hrefs, the notice picker and every form on the screen are built
    // on `reminderQuery`; a key it emits differently from how the parser reads
    // it is a key that resets under the office's hands.
    const supplied = {
      installments: "2,3",
      installmentMatch: "any",
      paid: "part",
      minDueAmount: "250",
      lateFee: "yes",
      promise: "lapsed",
      skipOverdue: "on",
      classId: "class-7",
      includeRte: "on",
      include: "s1,s2",
      exclude: "s3",
      situation: "balance",
      language: "en",
      lastDate: "20-10-2026",
      lateFeeAmount: "500",
      lateFeeBasis: "flat",
      lateFeeSource: "ledger",
      preDueWindowDays: "7",
    };
    const parsed = parseReminderFilters(fromQuery(supplied), "2026-27");
    const query = reminderQuery(parsed);
    expect(parseReminderFilters((key) => query.get(key), "2026-27")).toEqual(parsed);

    const lastYear = parseReminderFilters(
      fromQuery({ ...supplied, installments: "last_year" }),
      "2026-27",
    );
    expect(lastYear.lastYear).toBe(true);
    const lastYearQuery = reminderQuery(lastYear);
    expect(lastYearQuery.get("installments")).toBe("last_year");
    expect(parseReminderFilters((key) => lastYearQuery.get(key), "2026-27")).toEqual(lastYear);
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

  it("opens on the basis the office last used, except for the previous-session notice", () => {
    // The screen remembers the last message's late fee. A remembered "flat"
    // wins over the policy default for every current-year notice — and never
    // reaches `prevyear`, which opens on "not charged" whatever was last used.
    expect(
      parseReminderFilters(fromQuery({}), "2026-27", "20-10-2026", 1000, [1, 2], "flat")
        .lateFeeBasis,
    ).toBe("flat");
    expect(
      parseReminderFilters(
        fromQuery({ situation: "prevyear" }),
        "2026-27",
        "20-10-2026",
        1000,
        [1, 2],
        "flat",
      ).lateFeeBasis,
    ).toBe("none");
    // An explicit choice in the URL still beats the remembered one.
    expect(
      parseReminderFilters(
        fromQuery({ lateFeeBasis: "per_day" }),
        "2026-27",
        "20-10-2026",
        1000,
        [1, 2],
        "flat",
      ).lateFeeBasis,
    ).toBe("per_day");
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
    // `Number(formData.get(key))` is 0 for an absent field, and a minimum of 0
    // lets a nil quote through — a message telling a parent they owe ₹0.
    const filters = parseReminderFilters(fromForm({ classId: "abc" }), "2026-27");

    expect(filters.minDueAmount).toBe(DEFAULT_REMINDER_FILTERS.minDueAmount);
  });

  it("reads a negative minimum as absent", () => {
    const filters = parseReminderFilters(fromQuery({ minDueAmount: "-10" }), "2026-27");

    expect(filters.minDueAmount).toBe(DEFAULT_REMINDER_FILTERS.minDueAmount);
  });

  it("gives the query string and the form the same answer", () => {
    const entries = {
      paid: "nothing",
      minDueAmount: "250",
      installments: "1,2,3",
      installmentMatch: "any",
      lateFee: "no",
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
        paid: "part",
        minDueAmount: "5000",
        installments: "3",
        classId: " class-7 ",
        includeRte: "on",
      }),
      "TEST-2026-27",
    );

    expect(filters).toEqual({
      ...expectedDefaults("TEST-2026-27", [3]),
      paid: "part",
      minDueAmount: 5000,
      classId: "class-7",
      includeRte: true,
    });
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
});
