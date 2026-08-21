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
  // Posting, reversing and closing out — the obvious ones.
  "src/app/protected/payments/actions.ts",
  "src/app/protected/finance-controls/actions.ts",
  "src/app/protected/students/close-due-actions.ts",
  "src/app/api/imports/payments/batch/[batchId]/commit/route.ts",
  // Repairs and reconciles.
  "src/app/api/admin/repair-discount-drift/route.ts",
  "src/app/protected/admin-tools/session-health/actions.ts",
  // The four that were missing when this list was first written, each found by
  // reading the call sites rather than by anything failing:
  //   waive-late-fee      moves late_fee_pending and total_pending
  //   repayment-plan      rewrites the schedule; also calls waive_late_fee
  //   fee-setup           rewrites dues for every student in scope
  //   student import      adds students AND prepares their dues
  "src/app/protected/payments/waive-late-fee-actions.ts",
  "src/app/protected/students/repayment-plan-actions.ts",
  "src/app/protected/fee-setup/actions.ts",
  "src/app/api/imports/students/batch/[batchId]/commit/route.ts",
] as const;

/**
 * These bust PATHS and `student:{id}`, never `session:{label}`.
 *
 * The names suggest otherwise, which is the whole problem: four call sites used
 * one of them and looked finished. `revalidatePath("/protected/dashboard")`
 * does not evict an `unstable_cache` entry — only the entry's own tag does — so
 * the page re-rendered and read the same cached money straight back.
 */
const NOT_SUFFICIENT_ALONE = [
  "revalidateCoreFinancePaths",
  "revalidateAfterPaymentPosting",
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

  it("the path-only helpers are never the whole answer on a money mover", () => {
    // Belt and braces for the assertion above: if a file reaches for one of
    // these, it must ALSO bust the session tag. Catches the likeliest future
    // mistake — copying a nearby call site that happens to be the wrong one.
    for (const file of MONEY_MOVERS) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");

      for (const helper of NOT_SUFFICIENT_ALONE) {
        if (source.includes(helper)) {
          expect(
            /revalidateSessionFinance\s*\(/.test(source),
            `${file} calls ${helper}, which does not touch session:{label} — it needs revalidateSessionFinance too`,
          ).toBe(true);
        }
      }
    }
  });

  it("the dashboard caches carry a staleness ceiling as a backstop", () => {
    // pg_cron changes money from inside Postgres, where revalidateTag does not
    // exist: sync_repayment_plan_late_fees charges EMI late fees nightly. No
    // amount of care at the call sites covers that, so the caches also expire.
    const contract = readFileSync(path.join(repoRoot, "src/modules/dashboard/domain/cache-contract.ts"), "utf8");
    expect(contract).toMatch(/DASHBOARD_STALENESS_CEILING_SECONDS\s*=\s*\d+/);

    for (const file of ["src/modules/dashboard/data/queries.ts", "src/modules/dashboard/data/analytics.ts"]) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      expect(source, `${file} must tag on the session`).toContain("session:${sessionLabel}");
      expect(source, `${file} must also bound staleness`).toContain(
        "revalidate: DASHBOARD_STALENESS_CEILING_SECONDS",
      );
    }
  });

  it("the drift repair busts the tag as well as refreshing the matview", () => {
    // Specifically both, and in that order: drainFinancialViewRefresh fixes the
    // database, revalidateSessionFinance fixes what the office sees. Doing only
    // the first is what made the repair look like it had not worked.
    const source = readFileSync(
      path.join(repoRoot, "src/app/api/admin/repair-discount-drift/route.ts"),
      "utf8",
    );

    const drain = source.indexOf("drainFinancialViewRefresh()");
    const revalidate = source.indexOf("revalidateSessionFinance(");

    expect(drain).toBeGreaterThan(-1);
    expect(revalidate).toBeGreaterThan(-1);
    expect(revalidate).toBeGreaterThan(drain);
  });
});
