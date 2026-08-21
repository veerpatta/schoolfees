import { describe, expect, it } from "vitest";

import { readerFromRecord, readerFromSearchParams } from "@/platform/navigation/search-params";
import {
  EMPTY_RECEIPT_FILTERS,
  countActiveReceiptFilters,
  normalizeReceiptFilters,
  receiptFiltersToParams,
  resolveDateRange,
  type ReceiptFilters,
} from "@/lib/receipts/filters";

/** 14 August 2026 is a Friday. */
const TODAY = "2026-08-14";

function bothEntryPoints(input: Record<string, string>) {
  return {
    fromPage: normalizeReceiptFilters(readerFromRecord(input)),
    fromRoute: normalizeReceiptFilters(readerFromSearchParams(new URLSearchParams(input))),
  };
}

describe("resolveDateRange", () => {
  it("bounds a single day for today and yesterday", () => {
    expect(resolveDateRange({ datePreset: "today", fromDate: "", toDate: "" }, TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
    });
    expect(
      resolveDateRange({ datePreset: "yesterday", fromDate: "", toDate: "" }, TODAY),
    ).toEqual({ from: "2026-08-13", to: "2026-08-13" });
  });

  it("starts the week on Monday, which is how the office reads one", () => {
    // Friday 14 August 2026 → Monday 10 August.
    expect(resolveDateRange({ datePreset: "week", fromDate: "", toDate: "" }, TODAY)).toEqual({
      from: "2026-08-10",
      to: TODAY,
    });
    // On the Monday itself the week is one day long, not eight.
    expect(
      resolveDateRange({ datePreset: "week", fromDate: "", toDate: "" }, "2026-08-10"),
    ).toEqual({ from: "2026-08-10", to: "2026-08-10" });
    // And on the Sunday it still belongs to the week that started six days ago.
    expect(
      resolveDateRange({ datePreset: "week", fromDate: "", toDate: "" }, "2026-08-16"),
    ).toEqual({ from: "2026-08-10", to: "2026-08-16" });
  });

  it("runs a month from its first day, including on the first", () => {
    expect(resolveDateRange({ datePreset: "month", fromDate: "", toDate: "" }, TODAY)).toEqual({
      from: "2026-08-01",
      to: TODAY,
    });
    expect(
      resolveDateRange({ datePreset: "month", fromDate: "", toDate: "" }, "2026-03-01"),
    ).toEqual({ from: "2026-03-01", to: "2026-03-01" });
  });

  it("puts no date bounds on the whole session", () => {
    // The query's session embed already scopes the read. A date range on top
    // would drop receipts posted for this session outside its calendar window.
    expect(resolveDateRange({ datePreset: "session", fromDate: "", toDate: "" }, TODAY)).toEqual({
      from: null,
      to: null,
    });
  });

  it("takes a custom range only when both ends are real dates", () => {
    expect(
      resolveDateRange(
        { datePreset: "custom", fromDate: "2026-08-01", toDate: "2026-08-14" },
        TODAY,
      ),
    ).toEqual({ from: "2026-08-01", to: "2026-08-14" });

    expect(
      resolveDateRange({ datePreset: "custom", fromDate: "1 Aug", toDate: "" }, TODAY),
    ).toEqual({ from: null, to: null });
  });

  it("leaves a backwards custom range backwards", () => {
    // Silently swapping the ends would hide the reader's mistake behind
    // results they did not ask for. An empty list says what happened.
    expect(
      resolveDateRange(
        { datePreset: "custom", fromDate: "2026-08-14", toDate: "2026-08-01" },
        TODAY,
      ),
    ).toEqual({ from: "2026-08-14", to: "2026-08-01" });
  });
});

describe("normalizeReceiptFilters", () => {
  it("agrees on an empty query string across both entry points", () => {
    const { fromPage, fromRoute } = bothEntryPoints({});
    expect(fromPage).toEqual(fromRoute);
    expect(fromPage).toEqual(EMPTY_RECEIPT_FILTERS);
  });

  it("agrees on a fully populated query string", () => {
    const input = {
      query: "  R-2627  ",
      session: "TEST-2026-27",
      date: "custom",
      from: "2026-08-01",
      to: "2026-08-14",
      modes: "cash,upi",
      classId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      by: "raj@vpps.co.in,Office desk",
      reversed: "1",
      closeouts: "1",
      sort: "amount",
    };
    const { fromPage, fromRoute } = bothEntryPoints(input);

    expect(fromPage).toEqual(fromRoute);
    expect(fromPage).toEqual({
      query: "R-2627",
      sessionLabel: "TEST-2026-27",
      datePreset: "custom",
      fromDate: "2026-08-01",
      toDate: "2026-08-14",
      paymentModes: ["cash", "upi"],
      classId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      receivedBy: ["raj@vpps.co.in", "Office desk"],
      reversedOnly: true,
      discountCloseOutsOnly: true,
      sort: "amount",
    });
  });

  it("drops a preset, sort or mode nobody offers", () => {
    const filters = normalizeReceiptFilters(
      readerFromRecord({ date: "fortnight", sort: "student", modes: "cash,bitcoin" }),
    );
    expect(filters.datePreset).toBe("session");
    expect(filters.sort).toBe("newest");
    expect(filters.paymentModes).toEqual(["cash"]);
  });

  it("refuses a non-uuid class rather than passing it to Postgres", () => {
    const filters = normalizeReceiptFilters(
      readerFromRecord({ classId: "'; drop table receipts; --" }),
    );
    expect(filters.classId).toBe("");
  });

  it("ignores a malformed custom date instead of querying on it", () => {
    const filters = normalizeReceiptFilters(
      readerFromRecord({ date: "custom", from: "14-08-2026", to: "2026-08-14" }),
    );
    expect(filters.fromDate).toBe("");
    expect(filters.toDate).toBe("2026-08-14");
  });
});

describe("receiptFiltersToParams", () => {
  it("omits everything at its default", () => {
    expect(receiptFiltersToParams(EMPTY_RECEIPT_FILTERS).toString()).toBe("");
  });

  it("round-trips through the normalizer", () => {
    const filters: ReceiptFilters = {
      query: "Priya",
      sessionLabel: "TEST-2026-27",
      datePreset: "week",
      fromDate: "",
      toDate: "",
      paymentModes: ["upi"],
      classId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      receivedBy: ["raj@vpps.co.in"],
      reversedOnly: false,
      discountCloseOutsOnly: true,
      sort: "amount",
    };

    const params = receiptFiltersToParams(filters);
    expect(normalizeReceiptFilters(readerFromSearchParams(params))).toEqual(filters);
  });

  it("keeps custom dates only while the preset is custom", () => {
    const params = receiptFiltersToParams({
      ...EMPTY_RECEIPT_FILTERS,
      datePreset: "today",
      fromDate: "2026-08-01",
      toDate: "2026-08-14",
    });
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });

  it("asks for facet counts only when told to", () => {
    expect(receiptFiltersToParams(EMPTY_RECEIPT_FILTERS).has("facets")).toBe(false);
    expect(receiptFiltersToParams(EMPTY_RECEIPT_FILTERS, { facets: true }).get("facets")).toBe("1");
  });
});

describe("countActiveReceiptFilters", () => {
  it("counts nothing for the default view, and never counts the search text", () => {
    expect(countActiveReceiptFilters(EMPTY_RECEIPT_FILTERS)).toBe(0);
    expect(countActiveReceiptFilters({ ...EMPTY_RECEIPT_FILTERS, query: "Priya" })).toBe(0);
  });

  it("counts each applied filter once", () => {
    expect(
      countActiveReceiptFilters({
        ...EMPTY_RECEIPT_FILTERS,
        datePreset: "today",
        paymentModes: ["cash", "upi"],
        classId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        receivedBy: ["raj@vpps.co.in"],
        reversedOnly: true,
        sort: "amount",
      }),
    ).toBe(7);
  });
});
