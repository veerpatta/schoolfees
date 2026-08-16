import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSegments } from "@/lib/segments/student-segments";
import { normalizePaymentModeFilter } from "@/lib/transactions/payment-modes";
import { resolveOfficeWorkbookView } from "@/lib/transactions/workbook";

/**
 * Two failure modes that both render as "the page is blank".
 *
 * **A repeated query parameter.** Next hands a page `string[]`, and a parser
 * that assumed `string` threw `trim is not a function` or `split is not a
 * function` out of a Server Component. Production redacts the message, so the
 * office just saw chrome with nothing under it.
 *
 * **An oversized `.in(...)` filter.** PostgREST serialises it into the request
 * URL, so a few hundred UUIDs build a 20 KB URL. Postgres answers 400 Bad
 * Request; Node's fetch refuses outright with `TypeError: fetch failed`. Same
 * blank page, different cause. It bit three separate places:
 *   - receipt-id session scope   (already guarded, RECEIPT_ID_FILTER_CHUNK_SIZE)
 *   - the receipt search's matched-student ids  (`?query=a` matched the roster)
 *   - the promotion run detail's student lookup (a run covers everyone)
 *
 * The lesson worth keeping is that neither failure is loud. Both produce a page
 * that looks merely empty, which is indistinguishable from "no records" to the
 * person looking at it.
 */

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("shared parsers survive a repeated parameter", () => {
  it("parseSegments accepts an array and keeps every known id", () => {
    // `?seg=overdue&seg=onEmi` plainly means both.
    expect(parseSegments(["overdue", "onEmi"])).toEqual(["overdue", "onEmi"]);
    // Still splits a single comma-separated value, as the URL format uses.
    expect(parseSegments("overdue,onEmi")).toEqual(["overdue", "onEmi"]);
    // Mixed: an array whose entries are themselves comma lists.
    expect(parseSegments(["overdue,onEmi", "missingPhone"])).toEqual([
      "overdue",
      "onEmi",
      "missingPhone",
    ]);
  });

  it("parseSegments drops unknown ids without throwing", () => {
    expect(parseSegments(["nonsense", "overdue"])).toEqual(["overdue"]);
    expect(parseSegments([])).toEqual([]);
    expect(parseSegments(undefined)).toEqual([]);
    expect(parseSegments(null)).toEqual([]);
  });

  it("resolveOfficeWorkbookView takes the first of a repeated view", () => {
    expect(resolveOfficeWorkbookView(["receipts", "defaulters"]).view).toBe("receipts");
    expect(resolveOfficeWorkbookView(["receipts", "defaulters"]).wasRecognized).toBe(true);
    expect(resolveOfficeWorkbookView([]).view).toBe("transactions");
    expect(() => resolveOfficeWorkbookView(["nonsense", "receipts"])).not.toThrow();
  });

  it("normalizePaymentModeFilter takes the first of a repeated mode", () => {
    expect(normalizePaymentModeFilter(["cash", "upi"])).toBe("cash");
    expect(normalizePaymentModeFilter(["nonsense"])).toBe("");
    expect(normalizePaymentModeFilter([])).toBe("");
  });
});

describe("id filters that would outgrow a URL are chunked", () => {
  it("the receipt search caps how many student ids it inlines", () => {
    const source = read("lib/workbook/data.ts");

    expect(
      source,
      "lib/workbook/data.ts no longer bounds the inlined student-id search. " +
        "A one-character query matches the whole roster and rebuilds the 20 KB " +
        "URL that Postgres rejects.",
    ).toContain("SEARCH_STUDENT_ID_INLINE_LIMIT");

    const limit = Number(
      source.match(/const SEARCH_STUDENT_ID_INLINE_LIMIT = (\d+);/)?.[1] ?? "0",
    );
    expect(limit).toBeGreaterThan(0);
    // ~39 characters per id inside `or=(student_id.in.(…))`; stay well under a
    // typical 8-16 KB gateway limit with the rest of the query alongside.
    expect(limit * 39).toBeLessThan(8_000);
  });

  it("a search too broad to narrow falls back rather than truncating", () => {
    const source = read("lib/workbook/data.ts");
    // Truncating the id list would silently hide a family's receipts, which is
    // worse than the page being slow.
    expect(source).toContain("searchIsTooBroadToNarrow");
    expect(source).toMatch(/if \(!searchIsTooBroadToNarrow\) \{/);
  });

  it("the promotion run detail chunks its student and class lookups", () => {
    const source = read("lib/promotion/data.ts");

    expect(
      source,
      "A promotion run covers the whole roster, so `.in(\"id\", studentIds)` " +
        "built a URL Node's fetch refused outright.",
    ).toContain("selectByIdsInChunks");

    const chunk = Number(source.match(/const ID_FILTER_CHUNK_SIZE = (\d+);/)?.[1] ?? "0");
    expect(chunk).toBeGreaterThan(0);
    expect(chunk).toBeLessThanOrEqual(200);

    // The raw, unchunked form must not come back.
    expect(source).not.toMatch(/\.in\("id", studentIds\)/);
    expect(source).not.toMatch(/\.in\("id", classIds\)/);
  });

  it("the receipt-id session scope keeps its original guard", () => {
    const source = read("lib/workbook/data.ts");
    expect(source).toContain("RECEIPT_ID_FILTER_CHUNK_SIZE");
    expect(source).toContain("fetchInChunks");
  });
});
