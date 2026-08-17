import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * A reversed receipt is not collection.
 *
 * Reversing never touches `receipts.total_amount` — it writes a compensating
 * `payment_adjustments` row — so any total that sums that column counts money
 * that was handed back. `lib/receipts/reversals.ts` has existed for a while and
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
    ["sidebar Day so far", "lib/dashboard/shell-metrics.ts"],
    ["Payment Desk today", "lib/payments/data.ts"],
    ["Transactions day strip", "lib/workbook/data.ts"],
    ["office home", "lib/office/data.ts"],
    ["dashboard summary fallback", "lib/dashboard/summary.ts"],
    // Added when admin reversal of any receipt landed. Reversal used to be rare
    // enough that these six quietly summed reversed money; once an admin can
    // reverse anything, each one is a number that visibly disagrees with the
    // board next to it.
    ["nightly day close", "app/api/cron/auto-day-close/route.ts"],
    ["finance day summary", "lib/finance-controls/data.ts"],
    ["receipts page stat strip", "lib/receipts/data.ts"],
    ["reports receipt register", "lib/reports/data.ts"],
    ["AI bundle export sheets", "app/protected/exports/[exportType]/route.ts"],
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
