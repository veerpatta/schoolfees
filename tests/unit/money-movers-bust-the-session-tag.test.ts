import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Anything that moves money must bust `session:{label}`.
 *
 * `get_dashboard_summary` and `get_dashboard_analytics` are cached in Next on
 * that tag. Refreshing the database materialized views is only half the job —
 * a perfectly correct database still renders the OLD money until the tag goes,
 * and the page gives no hint that it is stale.
 *
 * This has now bitten twice. Refunds moved money in Finance Controls without
 * busting it and served stale numbers until the next payment happened to clear
 * the tag. Then the drift repair did the same: after correcting Rs 54,225
 * across eight students the dashboard kept reporting the pre-repair expected
 * figure, low by exactly that amount, while every SQL query returned the
 * corrected one.
 *
 * Both were invisible in review because the write itself was right. The missing
 * line is somewhere else entirely, and nothing connected the two — so this
 * test is that connection.
 *
 * Source assertions, because the failure is an ABSENT call. There is no input
 * that makes a missing revalidation show up in behaviour; the only way to catch
 * it is to look for the line.
 */

const repoRoot = path.resolve(__dirname, "..", "..");

/**
 * Server entry points that rewrite money and therefore have to invalidate.
 *
 * Adding a new one without its revalidation is exactly the mistake this
 * guards, so a new money-moving route belongs in this list on the same commit.
 */
const MONEY_MOVERS = [
  "app/api/admin/repair-discount-drift/route.ts",
  "app/protected/finance-controls/actions.ts",
  "app/protected/payments/actions.ts",
  "app/protected/students/close-due-actions.ts",
  "app/api/imports/payments/batch/[batchId]/commit/route.ts",
] as const;

describe("every money-moving path busts the session cache tag", () => {
  for (const file of MONEY_MOVERS) {
    it(`${file} calls revalidateSessionFinance`, () => {
      const source = readFileSync(path.join(repoRoot, file), "utf8");

      expect(source, `${file} must import revalidateSessionFinance`).toContain(
        "revalidateSessionFinance",
      );
      // Imported but never called is the same bug with extra steps.
      expect(source, `${file} must CALL revalidateSessionFinance`).toMatch(
        /revalidateSessionFinance\s*\(/,
      );
    });
  }

  it("the drift repair busts the tag as well as refreshing the matview", () => {
    // Specifically both, and in that order: drainFinancialViewRefresh fixes the
    // database, revalidateSessionFinance fixes what the office sees. Doing only
    // the first is what made the repair look like it had not worked.
    const source = readFileSync(
      path.join(repoRoot, "app/api/admin/repair-discount-drift/route.ts"),
      "utf8",
    );

    const drain = source.indexOf("drainFinancialViewRefresh()");
    const revalidate = source.indexOf("revalidateSessionFinance(");

    expect(drain).toBeGreaterThan(-1);
    expect(revalidate).toBeGreaterThan(-1);
    expect(revalidate).toBeGreaterThan(drain);
  });
});
