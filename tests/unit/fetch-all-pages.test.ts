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
    // 1000, 1000, then an empty page to learn the data ended. Same three
    // requests as the sequential version, but the last two are issued together,
    // so this costs two round trips rather than three.
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([from, to]) => [from, to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("returns rows in page order even though pages are fetched together", async () => {
    // The window must not reorder anything: a later page that resolves first
    // still has to land after the earlier one.
    const rows = Array.from({ length: 2000 }, (_, i) => ({ i }));
    const fetchPage = vi.fn(async (from: number, to: number) => {
      // Page 1 deliberately resolves slower than page 2.
      await new Promise((resolve) => setTimeout(resolve, from === 1000 ? 20 : 0));
      return { data: rows.slice(from, to + 1), error: null };
    });

    const result = await fetchAllPages(fetchPage, 1000);

    expect(result.data.map((row) => row.i)).toEqual(rows.map((row) => row.i));
  });

  it("stops after one request when the first page is short", async () => {
    // The common case by far — the live session's financial view is 535 rows.
    // Page 0 is deliberately fetched alone so this never pays for speculation.
    const fetchPage = vi.fn(async () => ({ data: [{ i: 1 }], error: null }));
    const result = await fetchAllPages(fetchPage, 1000);

    expect(result.data).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("never reads a page fetched after the short one", async () => {
    // 1000 rows exactly: page 0 is full, so a window opens; page 1 is empty and
    // ends the data. Whatever page 2 returns must be ignored, not appended.
    const rows = Array.from({ length: 1000 }, (_, i) => ({ i }));
    const fetchPage = vi.fn(async (from: number, to: number) =>
      from >= 2000
        ? { data: [{ i: -1 }], error: null } // a lie; must never be trusted
        : { data: rows.slice(from, to + 1), error: null },
    );

    const result = await fetchAllPages(fetchPage, 1000);

    expect(result.data).toHaveLength(1000);
    expect(result.data.some((row) => row.i === -1)).toBe(false);
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
    // 1 alone, then windows of 2: [250,499]+[500,749], then [750,999] ends it
    // alongside one speculative [1000,1249] that is never read. Five requests
    // in three round trips, where the sequential version took four of each.
    expect(fetchPage).toHaveBeenCalledTimes(5);
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
    // Page 0 alone, then a window of 2 that both fail. The window means one
    // more request than the sequential version issued, but the contract is
    // unchanged: the FIRST error in page order is the one returned, with
    // everything read before it.
    expect(fetchPage).toHaveBeenCalledTimes(3);
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
