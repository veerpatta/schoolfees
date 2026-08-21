import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), "utf8");

/**
 * The financial matview refresh must stay OFF the payment-posting path.
 *
 * This has regressed once already. `20260523213000_tier3_finance_performance`
 * moved the refresh to a queue drained by cron; four days later
 * `20260527090332` put it back inline (as CONCURRENTLY, to unblock readers),
 * and posting a payment went back to running three chained matview refreshes
 * per SQL statement — 6 for a one-installment receipt, 15 for a full-year one,
 * inside the cashier's transaction. Measured on live: one chain is ~532ms, so a
 * single post was paying ~1.1s of pure view rebuilding while a parent waited.
 *
 * `20260726154843` restored the queue. These tests exist so the next person who
 * reaches for "just refresh it inline, readers are stale" sees the history.
 */

const DEFER_MIGRATION = "20260726154843_defer_financial_view_refresh.sql";

describe("financial view refresh stays off the posting path", () => {
  it("has the deferral migration", () => {
    const files = readdirSync(join(repo, "supabase/migrations"));
    expect(files).toContain(DEFER_MIGRATION);
  });

  it("makes the trigger enqueue instead of refreshing inline", () => {
    const sql = read(`supabase/migrations/${DEFER_MIGRATION}`);
    const fn = sql.slice(sql.indexOf("create or replace function public.trigger_refresh_financial_views"));

    expect(fn).toContain("queue_workbook_materialized_view_refresh()");
    // The whole point: no synchronous refresh in the trigger body.
    expect(fn).not.toContain("refresh_financial_materialized_views");
    expect(fn).not.toMatch(/refresh\s+materialized\s+view/i);
  });

  it("drains after the response, not inside the request", () => {
    const helper = read("src/lib/system-sync/financial-view-refresh.ts");
    expect(helper).toContain("refresh_workbook_materialized_views_if_requested");
    // Service-role on purpose — the RPC is granted to postgres/service_role
    // only, and granting it to `authenticated` would hand every staff account a
    // lever that rebuilds three matviews on demand.
    expect(helper).toContain("createAdminClient");

    const actions = read("src/app/protected/payments/actions.ts");
    expect(actions).toContain("drainFinancialViewRefresh");
    // Must be inside after(), or it goes straight back onto the latency budget
    // it was moved off.
    const afterBlock = actions.slice(actions.indexOf("after(async () => {"));
    expect(afterBlock.slice(0, 900)).toContain("drainFinancialViewRefresh()");
  });

  it("drains on every other path that writes financial rows", () => {
    // Reversals, ledger corrections and refunds all fire the same trigger. If
    // they do not drain, they trade the old inline cost for up to two minutes
    // of stale dues on the screen the user is looking at.
    for (const path of [
      "src/app/protected/ledger/actions.ts",
      "src/app/protected/finance-controls/actions.ts",
    ]) {
      expect(read(path), path).toContain("drainFinancialViewRefresh");
    }
  });

  it("drains on EVERY server action that regenerates installments", () => {
    // Derived, not hand-listed. The hand-list above missed the student create
    // and update paths for months: adding a student wrote four installment
    // rows, enqueued a refresh and never drained it, so the new student read
    // as "Dues not prepared" — and a discount edit kept showing the
    // pre-discount total — until the */2 cron fired. Anything that calls the
    // dues generator has to drain, so let the test find them rather than
    // trusting the next author to remember.
    const GENERATOR_ENTRY_POINTS = [
      "prepareDuesForStudentsAutomatically",
      "generateSessionLedgersAction",
      "syncStudentFinancials",
    ];

    const actionFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
        const child = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith("actions.ts")) actionFiles.push(child);
      }
    };
    walk("src/app");

    const missing = actionFiles.filter((path) => {
      const source = read(path);
      const regenerates = GENERATOR_ENTRY_POINTS.some((name) => source.includes(name));
      return regenerates && !source.includes("drainFinancialViewRefresh");
    });

    expect(missing, "server actions that regenerate dues but never drain the refresh queue").toEqual([]);
  });

  it("never blocks a post on a failed refresh", () => {
    // The cron backstop still runs; a drain failure must degrade to "stale for
    // up to two minutes", never to "the payment errored".
    const helper = read("src/lib/system-sync/financial-view-refresh.ts");
    expect(helper).toContain("try {");
    expect(helper).toContain("catch");
    expect(helper).toMatch(/console\.warn/);
  });
});
