import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { fetchAllPages } from "@/lib/helpers/chunk";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * PostgREST truncates a response at its `max-rows` ceiling with no error and no
 * flag — the array is simply short. A query with no `.range()` over a view that
 * has outgrown that ceiling returns a plausible half-answer, and every total
 * computed from it is silently wrong.
 *
 * That happened. The live installment view holds 2,000 rows; the unpaged select
 * returned 1,000, and the dashboard reported ₹56,78,760 expected for the year
 * instead of ₹1,14,45,062 — while the installment export wrote the accountant a
 * file missing half its rows. Neither surface showed an error.
 */

describe("fetchAllPages", () => {
  it("keeps paging until a short page ends the data", async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ i }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    const result = await fetchAllPages(fetchPage, 1000);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2000);
    // 1000, 1000, then an empty page to learn the data ended.
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([from, to]) => [from, to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one request when the first page is short", async () => {
    const fetchPage = vi.fn(async () => ({ data: [{ i: 1 }], error: null }));
    const result = await fetchAllPages(fetchPage, 1000);

    expect(result.data).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not depend on the server cap being any particular number", async () => {
    // The whole point: if the ceiling moves, a short-page loop still reads
    // everything. A loop keyed to "expect exactly 1000" would silently truncate
    // again the moment the cap changed.
    const rows = Array.from({ length: 750 }, (_, i) => ({ i }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    const result = await fetchAllPages(fetchPage, 250);

    expect(result.data).toHaveLength(750);
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it("returns what it read alongside the first error", async () => {
    const fetchPage = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: 10 }, (_, i) => ({ i })), error: null }
        : { data: null, error: new Error("boom") },
    );

    const result = await fetchAllPages(fetchPage, 10);

    expect(result.error).toBeInstanceOf(Error);
    expect(result.data).toHaveLength(10);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("rejects a nonsense page size rather than looping forever", async () => {
    await expect(fetchAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow(
      /positive integer/,
    );
  });
});

describe("workbook loaders read every row", () => {
  const workbook = read("lib/workbook/data.ts");

  it("pages the installment view", () => {
    // 4 rows per student plus carry-forward — the first view to cross the cap.
    const fn = workbook.slice(workbook.indexOf("export async function getWorkbookInstallmentRows"));
    expect(fn.slice(0, 2500)).toContain("fetchAllPages");
    expect(fn.slice(0, 2500)).toContain(".range(from, to)");
  });

  it("pages the student financials view when no explicit limit is given", () => {
    const fn = workbook.slice(
      workbook.indexOf("export async function getWorkbookStudentFinancials"),
    );
    expect(fn.slice(0, 4000)).toContain("fetchAllPages");
  });

  it("orders by a unique column so rows cannot drift between pages", () => {
    // Without a unique tiebreaker, two rows tying on every sort key can swap
    // order between requests — one gets returned twice, another not at all.
    expect(workbook).toContain('.order("installment_id", { ascending: true })');
    expect(workbook).toContain('.order("student_id", { ascending: true })');
  });
});
