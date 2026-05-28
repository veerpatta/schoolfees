import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Audit 1.3 — Receipt-retry idempotency re-check.
 *
 * The behaviour under test is inside post_student_payment_with_adjustments,
 * a Postgres RPC. We cannot drive a real concurrent execution from a Vitest
 * unit run; the integration coverage that does is the migration verification
 * on the TEST Supabase branch via scripts/verify-live-fee-health.mjs.
 *
 * What we CAN guard at the JS test layer:
 *   * That the latest migration recreates the function with the
 *     unique_violation handler that re-queries by (student_id, client_request_id).
 *   * That the 12-attempt loop is preserved and the upfront idempotency
 *     check still runs first.
 *   * That the rewrite was additive — the column writes from the earlier
 *     20260527033430 snapshot migration are still wired in.
 */
describe("post_student_payment_with_adjustments idempotency (audit 1.3)", () => {
  const repoRoot = process.cwd();
  const migrationPath = join(
    repoRoot,
    "supabase/migrations/20260528100000_restore_receipt_idempotency_recheck.sql",
  );
  const earlierMigrationPath = join(
    repoRoot,
    "supabase/migrations/20260527033430_persist_payment_allocation_snapshot.sql",
  );

  it("ships a migration that drops and recreates the RPC", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain(
      "drop function if exists public.post_student_payment_with_adjustments",
    );
    expect(sql).toContain(
      "create or replace function public.post_student_payment_with_adjustments",
    );
  });

  it("upfront idempotency check still runs before the receipt-number loop", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const upfrontIdx = sql.indexOf("perform pg_advisory_xact_lock");
    const loopIdx = sql.indexOf("for _attempt in 1..12 loop");
    const upfrontCheck = sql.slice(upfrontIdx, loopIdx);
    expect(upfrontCheck).toContain("p_client_request_id is not null");
    expect(upfrontCheck).toContain("from public.receipts as r");
    expect(upfrontCheck).toContain("and r.client_request_id = p_client_request_id");
  });

  it("the unique_violation handler re-queries by client_request_id before continuing", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const handlerIdx = sql.indexOf("exception when unique_violation");
    expect(handlerIdx).toBeGreaterThan(0);
    // Slice from the handler up to the next "end loop" to capture the full
    // handler body deterministically.
    const tail = sql.slice(handlerIdx);
    const endLoopIdx = tail.indexOf("end loop;");
    const handler = endLoopIdx > 0 ? tail.slice(0, endLoopIdx) : tail;
    expect(handler).toContain("p_client_request_id is not null");
    expect(handler).toMatch(/from public\.receipts/);
    expect(handler).toContain("client_request_id = p_client_request_id");
    expect(handler).toMatch(/if v_candidate_receipt_id is not null then[\s\S]+return query/);
    // Without finding a match, it falls through to `continue` to try the
    // next receipt-number sequence.
    expect(handler).toContain("continue;");
  });

  it("preserves the allocation-snapshot column writes added by 20260527033430", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const column of [
      "discount_applied_at_posting",
      "waiver_applied_at_posting",
      "pending_before_posting",
      "pending_after_posting",
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("keeps the 12-attempt receipt-number retry loop intact", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/for _attempt in 1\.\.12 loop/);
    expect(sql).toContain("Unable to generate a unique receipt number. Please retry.");
  });

  it("the earlier 20260527033430 migration is the regression source — its handler does NOT re-query", () => {
    // Sanity check that this migration is meaningfully different from the
    // earlier one and we have a real fix, not a no-op.
    const sql = readFileSync(earlierMigrationPath, "utf8");
    const handlerIdx = sql.indexOf("exception when unique_violation");
    const handler = sql.slice(handlerIdx, handlerIdx + 400);
    expect(handler).not.toMatch(/and r\.client_request_id = p_client_request_id/);
  });
});
