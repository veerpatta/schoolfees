import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * A reversed receipt is not collection.
 *
 * Reversing never touches `receipts.total_amount` — it writes a compensating
 * `payment_adjustments` row — so any total that sums that column counts money
 * that was handed back. `src/modules/receipts/data/reversals.ts` has existed for a while and
 * was used for **badges, never for money**: lists struck reversed rows through
 * while the total directly above them still included the amount.
 *
 * Live symptom: the dashboard reported ₹11,000 collected on a day whose only
 * two receipts had both been reversed, while `totalCollected` — which reads the
 * matview, and the matview does net adjustments — had already excluded them.
 * The same page showed two mutually inconsistent numbers.
 */

describe("reversed receipts are excluded from money totals", () => {
  const surfaces: Array<[string, string]> = [
    ["sidebar Day so far", "src/modules/dashboard/data/shell-metrics.ts"],
    ["Payment Desk today", "src/modules/payments/data/queries.ts"],
    ["Transactions day strip", "src/modules/fees/data/queries.ts"],
    ["office home", "src/modules/fees/data/office-home.ts"],
    ["dashboard summary fallback", "src/modules/dashboard/domain/summary.ts"],
    // Added when admin reversal of any receipt landed. Reversal used to be rare
    // enough that these six quietly summed reversed money; once an admin can
    // reverse anything, each one is a number that visibly disagrees with the
    // board next to it.
    ["nightly day close", "src/app/api/cron/auto-day-close/route.ts"],
    ["finance day summary", "src/modules/finance-controls/data/queries.ts"],
    ["receipts page stat strip", "src/modules/receipts/data/queries.ts"],
    ["reports receipt register", "src/modules/reports/data/queries.ts"],
    ["AI bundle export sheets", "src/modules/exports/data/ai-context-bundle.ts"],
  ];

  it.each(surfaces)("%s consults reversal state before summing", (_label, path) => {
    const source = read(path);
    const usesHelper =
      source.includes("isReceiptReversed") || source.includes("getReceiptReversalTotals");
    const usesFlag = /!\s*row\.isReversed/.test(source);

    expect(
      usesHelper || usesFlag,
      `${path} sums receipt amounts without excluding reversed receipts`,
    ).toBe(true);
  });

  it("keeps the dashboard RPC predicate on every receipt aggregate", () => {
    // SQL comments stripped: the header explains the bug and necessarily
    // quotes the very filter being counted.
    const migration = read(
      "supabase/migrations/20260726172238_dashboard_excludes_reversed_receipts.sql",
    )
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    // Six receipt-sourced aggregates: todaysCollection + receiptsToday,
    // thisMonthCollection, todayPaymentModeBreakdown, recentPayments,
    // collectionTrend, collectionHeatmap.
    const predicates = migration.match(/v_receipt_reversal_totals/g) ?? [];
    expect(predicates.length).toBe(6);

    // Every discount filter must be paired with a reversal filter — they guard
    // the same set of queries, so a lone discount filter means one was missed.
    const discountFilters = migration.match(/and r\.payment_mode <> 'discount'/g) ?? [];
    expect(discountFilters.length).toBe(predicates.length);
  });

  it("restates search_path so the definer hardening is not silently dropped", () => {
    // CREATE OR REPLACE FUNCTION replaces config settings too. Omitting this
    // would undo 20260523164957 for this function, and the body calls
    // private.normalize_workbook_class_label.
    const migration = read(
      "supabase/migrations/20260726172238_dashboard_excludes_reversed_receipts.sql",
    );
    expect(migration).toContain("SET search_path TO 'public', 'private', 'pg_temp'");
    expect(migration).toContain("SECURITY DEFINER");
  });

  it("refuses to report reversals as zero when the read fails", async () => {
    // The loader used to discard the error and return whatever rows arrived,
    // described in its own comment as degrading to "no badge". An absent row
    // does not read as "unknown" to any caller — it reads as "reversed by ₹0",
    // and the same map decides isReceiptReversed, which is what keeps a
    // reversed receipt out of a collection figure. So a failed read did not
    // drop a badge, it counted money the school gave back.
    const { getReceiptReversalTotals } = await import("@/modules/receipts/data/reversals");

    const failing = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: { message: "permission denied" } }),
        }),
      }),
    } as unknown as Parameters<typeof getReceiptReversalTotals>[1];

    await expect(
      getReceiptReversalTotals(["11111111-1111-4111-8111-111111111111"], failing),
    ).rejects.toThrow(/reversal totals/i);
  });

  it("returns an empty map for an empty request without touching the database", async () => {
    // The throw above must not turn "nothing to look up" into a failure.
    const { getReceiptReversalTotals } = await import("@/modules/receipts/data/reversals");
    const explode = {
      from: () => {
        throw new Error("must not query for an empty id list");
      },
    } as unknown as Parameters<typeof getReceiptReversalTotals>[1];

    await expect(getReceiptReversalTotals([], explode)).resolves.toEqual(new Map());
  });

  it("tells a parent verification failed, rather than calling the receipt fake", () => {
    // The public /r/{code} page wraps its lookup in a blanket catch that
    // answers "Not a recognised receipt". Once the reversal read throws, that
    // catch would call a genuine receipt a fake — so the failure is caught
    // narrowly and reported as what it is.
    const page = read("src/app/r/[code]/page.tsx");
    expect(page).toContain('state: "unverifiable"');
    expect(page).toContain("Could not verify right now");
    // The narrow catch sits around the reversal read specifically.
    expect(page).toMatch(/try \{[\s\S]*getReceiptReversalTotals[\s\S]*\} catch \{[\s\S]*unverifiable/);
  });

  it("still counts a PARTIALLY reversed receipt", () => {
    // Money that really did arrive stays counted. The predicate compares the
    // reversed total against the receipt total rather than testing for the mere
    // existence of an adjustment — same rule isReceiptReversed uses.
    const migration = read(
      "supabase/migrations/20260726172238_dashboard_excludes_reversed_receipts.sql",
    );
    expect(migration).toContain("rr.reversed_amount >= r.total_amount");
    expect(migration).not.toMatch(/rr\.reversed_amount\s*>\s*0/);
  });
});
