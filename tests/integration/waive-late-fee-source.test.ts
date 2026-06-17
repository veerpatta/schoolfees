import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWaiveLateFeeMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260617031509_waive_late_fee_uses_workbook_snapshot.sql",
    ),
    "utf8",
  );
}

describe("waive_late_fee pending-late-fee source", () => {
  it("reads pending late fee from the candidate-aware workbook snapshot", () => {
    const migration = readWaiveLateFeeMigration();
    const fn = migration.slice(
      migration.lastIndexOf("create or replace function public.waive_late_fee"),
    );

    // Must source the pending late fee from the same projection the payment
    // RPCs use, with candidate (accruing) late fees enabled (third arg true).
    expect(fn).toContain("private.workbook_installment_snapshot(");
    expect(fn).toContain("sum(greatest(snap.final_late_fee, 0))");
    expect(fn).toContain("true");
  });

  it("no longer references the non-existent pending_late_fee_amount column", () => {
    const migration = readWaiveLateFeeMigration();
    // Scope to the function definition — the header comment legitimately names
    // the old column/view when explaining the crash being fixed.
    const fn = migration.slice(
      migration.lastIndexOf("create or replace function public.waive_late_fee"),
    );

    // Regression guard for the column-not-found crash this migration fixes.
    expect(fn).not.toContain("pending_late_fee_amount");
    expect(fn).not.toContain("v_workbook_student_financials");
  });

  it("uses the IST date so the candidate set matches the student profile", () => {
    const migration = readWaiveLateFeeMigration();
    const fn = migration.slice(
      migration.lastIndexOf("create or replace function public.waive_late_fee"),
    );

    expect(fn).toContain("now() at time zone 'Asia/Kolkata')::date");
  });

  it("preserves the per-student advisory lock and permission guard", () => {
    const migration = readWaiveLateFeeMigration();

    expect(migration).toContain("public.has_permission('payments:waive_late_fee')");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))");
    expect(migration).toContain("security invoker");
  });
});
