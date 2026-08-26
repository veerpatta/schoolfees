import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

function readMigration(name: string) {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

/**
 * An admin may waive a late fee the family has ALREADY PAID.
 *
 * This reverses 20260808190000 for admins, at the school's instruction, for late
 * fees only. `late-fee-and-writeoff-rules.test.ts` keeps the record of the
 * narrow rule; this file guards the widening.
 *
 * These are source assertions against the LIVE definitions, not the historic
 * ones. `late-fee-waiver-lock.test.ts` and `waive-late-fee-source.test.ts` both
 * read immutable older migrations, which means neither of them notices when the
 * live function changes shape — that gap is what this file closes.
 */
describe("waive_late_fee — the collected-late-fee widening", () => {
  const sql = readMigration("20260826120000_an_admin_may_waive_a_collected_late_fee.sql");

  it("drops the six-argument overload before creating the seven-argument one", () => {
    // PostgREST cannot disambiguate overloads: leave both and every waiver in
    // the app starts answering PGRST203. 20260808150000 hit this already.
    expect(sql).toContain(
      "drop function if exists public.waive_late_fee(uuid, integer, text, text, uuid, uuid);",
    );
    expect(sql).toMatch(/create function public\.waive_late_fee\(/);
    expect(sql).not.toMatch(/create or replace function public\.waive_late_fee/);
  });

  it("adds the flag last and defaulted, so existing callers are untouched", () => {
    expect(sql).toMatch(/p_installment_id uuid default null::uuid,\s*\n\s*p_include_collected boolean default false\s*\n\)/);
  });

  it("gates the wider pool on fees:write, which accountants do not hold", () => {
    expect(sql).toMatch(/if v_collected[\s\S]{0,200}not public\.has_permission\('fees:write'\)/);
    expect(sql).toContain(
      "Only an admin can waive a late fee that has already been collected.",
    );
  });

  it("raises rather than quietly falling back to the narrow pool", () => {
    // A caller that asked to forgive collected money and silently got a partial
    // waiver leaves the office believing a correction landed when it did not.
    const guard = sql.slice(sql.indexOf("if v_collected"), sql.indexOf("if p_student_id is null"));
    expect(guard).toMatch(/raise exception/);
  });

  it("keeps the permission guard and the advisory-lock salt from before", () => {
    expect(sql).toContain("public.has_permission('payments:waive_late_fee')");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))");
  });

  it("never re-derives the narrow pool as least(final_late_fee, pending_amount)", () => {
    // Since 20260812120000 made pending_amount fees-only, that expression reads
    // 0 for exactly the families who still have a waivable late fee.
    expect(sql).toContain("else greatest(snap.late_fee_pending, 0)::integer");
    expect(sql).not.toMatch(/least\(\s*greatest\(snap\.final_late_fee, 0\),\s*greatest\(snap\.pending_amount, 0\)\s*\)/);
  });

  it("widens the pool to the whole charge only for the admin path", () => {
    expect(sql).toMatch(
      /when v_collected then greatest\(snap\.final_late_fee, 0\)::integer/,
    );
  });

  it("splits a partly-collected installment into two rows so source stays exact", () => {
    // Rs 1,000 charged, Rs 600 taken at the counter, Rs 400 still owed: forgive
    // the Rs 400 first and label only the Rs 600 as released money. One row
    // carrying both would have to pick a source, and either choice makes the
    // health check's "did the credit land?" arithmetic wrong by the other half.
    expect(sql).toContain("v_take_owed := least(v_take, v_row.still_owed);");
    expect(sql).toContain("v_take_collected := v_take - v_take_owed;");
    expect(sql).toMatch(/if v_take_collected > 0 then[\s\S]{0,400}'manual_collected'/);
  });

  it("widens the idempotency index by source, since one request now writes two rows", () => {
    expect(sql).toContain("drop index if exists public.student_late_fee_waivers_request_idx;");
    expect(sql).toContain(
      "(student_id, client_request_id, installment_id, source)",
    );
  });

  it("keeps manual_collected out of the other four sources", () => {
    expect(sql).toMatch(/check \(source = any \(array\[[\s\S]*'manual_collected'/);
  });

  it("records that it reverses 20260808190000, and why", () => {
    expect(sql).toContain("20260808190000");
    expect(sql).toMatch(/reverses/i);
  });
});

/**
 * The companion engine change, without which the widening loses money.
 *
 * Waiving a collected late fee lowers what an installment charges but not what
 * was applied to it. Both engines clip the difference with greatest(..., 0), so
 * the released rupees vanish from every per-installment figure while
 * v_student_financial_state quietly disagrees by the same amount.
 */
describe("installment surplus spills forward", () => {
  const sql = readMigration("20260826115000_installment_surplus_spills_forward.sql");

  it("edits both engines in the one migration", () => {
    // 20260812001114 string-patched one copy of the late-fee rule and EMI late
    // fees were invisible to half the app for four days.
    expect(sql).toContain("create materialized view public.v_workbook_installment_balances as");
    expect(sql).toContain("create function private.workbook_installment_snapshot(");
  });

  it("carries a shared-rule marker inside each engine, not just in the header", () => {
    const matview = sql.slice(
      sql.indexOf("create materialized view public.v_workbook_installment_balances as"),
      sql.indexOf("create function private.workbook_installment_snapshot("),
    );
    const snapshot = sql.slice(
      sql.indexOf("create function private.workbook_installment_snapshot("),
    );
    expect(matview).toContain(">>> SHARED SURPLUS SPILL RULE <<<");
    expect(snapshot).toContain(">>> SHARED SURPLUS SPILL RULE <<<");
    // Each copy points at the other, so whichever one you open tells you where
    // the twin is.
    expect(matview).toContain("Byte-identical to private.workbook_installment_snapshot");
    expect(snapshot).toContain("Byte-identical to public.v_workbook_installment_balances");
  });

  it("derives surplus and room from the row's own capacity", () => {
    expect(sql).toMatch(
      /greatest\(split\.settled_amount - \(split\.base_charge \+ split\.final_late_fee\), 0\)::integer/,
    );
    expect(sql).toMatch(
      /greatest\(\(split\.base_charge \+ split\.final_late_fee\) - split\.settled_amount, 0\)::integer/,
    );
  });

  it("only ever adds to what a row settled", () => {
    // Otherwise a family who skipped installment 1 and paid installment 2 in
    // full would start reading as partly paid on installment 2.
    expect(sql).toContain(
      "(carry.settled_amount + greatest(carry.cum_filled - carry.cum_filled_prev, 0))::integer",
    );
  });

  it("leaves raw_late_fee and settled_by_due_amount alone", () => {
    // Spilled money must never make a later installment read as settled by its
    // own due date and un-charge a late fee that was correctly raised.
    expect(sql).not.toMatch(/effective_settled[\s\S]{0,80}settled_by_due/);
    expect(sql).toContain("when rolled.settled_by_due_amount >= rolled.base_charge then 0");
  });

  it("keeps total_paid and total_due where they were", () => {
    // applied_amount and total_charge feed every dependent view. Only the four
    // derived columns may move, or the replay below stops being byte-for-byte.
    expect(sql).toMatch(/greatest\(base_charge \+ raw_late_fee - waiver_applied, 0\)::integer as total_charge/);
    expect(sql).toContain("as applied_amount");
  });

  it("aborts if a single figure moved", () => {
    // The spill is unreachable until 20260826120000 exists, so on today's data
    // it must be a provable no-op rather than a claimed one.
    expect(sql).toContain("create temporary table _spill_before");
    expect(sql).toMatch(/raise exception[\s\S]{0,160}installment row\(s\) changed/);
    expect(sql).toMatch(/raise exception 'surplus spill: row count changed/);
  });

  it("replays every dependent the cascade takes, and rebuilds their indexes", () => {
    for (const view of [
      "v_workbook_student_financials",
      "v_student_carry_forward_balances",
      "v_student_installment_facets",
      "v_student_repayment_plan_status",
      "v_student_financial_state",
      "v_student_directory",
      "v_notion_student_fee_summary",
      "v_notion_family_fee_summary",
      "v_notion_daily_collection_summary",
    ]) {
      expect(sql).toContain(view);
    }
    expect(sql).toContain("create unique index v_workbook_installment_balances_idx");
    expect(sql).toContain("create unique index v_student_financial_state_idx");
  });

  it("runs as one transaction", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });
});
