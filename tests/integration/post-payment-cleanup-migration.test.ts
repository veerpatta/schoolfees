import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260528101000_cleanup_post_payment_function.sql",
);

describe("post_payment cleanup migration (audit 1.29 + 1.30)", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("recreates post_student_payment_with_adjustments with the same signature", () => {
    expect(sql).toContain(
      "create or replace function public.post_student_payment_with_adjustments",
    );
    expect(sql).toContain(
      "drop function if exists public.post_student_payment_with_adjustments(",
    );
  });

  it("caches the workbook snapshot once into a temp table (audit 1.30)", () => {
    expect(sql).toContain("create temp table if not exists tmp_workbook_snapshot");
    expect(sql).toContain("truncate table tmp_workbook_snapshot");
    expect(sql).toContain("from private.workbook_installment_snapshot");
    // The function is now invoked exactly once in the function body (other
    // matches are inside SQL `--` comments).
    const callCount = (sql.match(/from private\.workbook_installment_snapshot\(/g) ?? [])
      .length;
    expect(callCount).toBe(1);
    // The loop and the total-pending sum both read from the temp table.
    const tempReads = (sql.match(/from tmp_workbook_snapshot/g) ?? []).length;
    expect(tempReads).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("order by due_date asc, installment_no asc");
  });

  it("stamps p_remarks only on receipts.notes and nulls the per-installment notes (audit 1.29)", () => {
    // The pre-cleanup function inserted nullif(...p_remarks...) into
    // payments.notes and receipt_adjustments.notes. After cleanup those are
    // plain nulls.
    const paymentsInsert = sql.slice(sql.indexOf("insert into public.payments"));
    const paymentsValues = paymentsInsert.slice(0, paymentsInsert.indexOf(");"));
    expect(paymentsValues).toMatch(/, ?\n\s+null,/);
    expect(paymentsValues).not.toContain("p_remarks");

    // receipt_adjustments inserts also null the notes column.
    const adjustmentsBlock = sql.slice(sql.indexOf("insert into public.receipt_adjustments"));
    expect(adjustmentsBlock).toMatch(/'Payment Desk quick discount', null/);
    expect(adjustmentsBlock).toMatch(/'Payment Desk late fee waiver', null/);
  });

  it("preserves audit 1.3 (idempotency re-check) inside the unique_violation handler", () => {
    expect(sql).toMatch(
      /exception when unique_violation then[\s\S]+p_client_request_id is not null[\s\S]+client_request_id = p_client_request_id/,
    );
  });

  it("preserves the advisory lock with the same salt as the original", () => {
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))",
    );
  });
});
