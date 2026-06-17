import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Audit 1.5 — Late-fee waiver advisory lock.
 *
 * True concurrency proof lives on the TEST Supabase branch (two parallel
 * waiver calls for the same student must not exceed the pending late fee).
 * At the JS test layer we guard:
 *   * The migration exists and acquires pg_advisory_xact_lock with the same
 *     salt used by post_student_payment_with_adjustments (so waivers and
 *     payments serialise per student).
 *   * The RPC validates amount <= pending late fee and rejects overruns.
 *   * The application action now calls the RPC instead of doing a separate
 *     read-then-write across the view and the override table.
 */
describe("waive_late_fee Postgres RPC (audit 1.5)", () => {
  const repoRoot = process.cwd();
  // Latest definition of the RPC. The original audit-1.5 migration
  // (20260528151726) read the pending late fee from a column that the
  // base-outstanding refactor later removed; 20260617031509 re-sources it from
  // the candidate-aware workbook snapshot. The advisory-lock / FOR UPDATE /
  // field-guard invariants below must hold against the CURRENT definition.
  const migrationPath = join(
    repoRoot,
    "supabase/migrations/20260617031509_waive_late_fee_uses_workbook_snapshot.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the waive_late_fee function with the documented signature", () => {
    expect(sql).toContain("create or replace function public.waive_late_fee");
    expect(sql).toContain("p_student_id uuid");
    expect(sql).toContain("p_amount integer");
    expect(sql).toContain("p_remarks text");
  });

  it("acquires the per-student advisory lock with the same salt as post_student_payment_with_adjustments", () => {
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))",
    );
  });

  it("validates the input amount and the pending late fee inside the lock", () => {
    expect(sql).toMatch(/raise exception 'Waiver amount must be greater than 0\.'/);
    // Pending late fee comes from the candidate-aware workbook snapshot (the
    // same projection the payment RPCs use), NOT the materialized financials
    // view — which stores 0 for never-paid overdue (accruing) late fees.
    expect(sql).toMatch(/v_pending_late_fee[\s\S]+from private\.workbook_installment_snapshot/);
    expect(sql).toContain("Waiver cannot exceed the current pending late fee");
  });

  it("selects the active override row with FOR UPDATE so two writers serialise", () => {
    expect(sql).toContain("from public.student_fee_overrides as o");
    expect(sql).toContain("and o.is_active = true");
    expect(sql).toContain("for update");
  });

  it("only touches the late_fee_waiver_amount and reason fields on update", () => {
    const updateIdx = sql.indexOf("update public.student_fee_overrides");
    expect(updateIdx).toBeGreaterThan(0);
    const updateStmt = sql.slice(updateIdx, sql.indexOf(";", updateIdx) + 1);
    expect(updateStmt).toContain("late_fee_waiver_amount");
    expect(updateStmt).toContain("reason");
    expect(updateStmt).toContain("updated_at");
    // Other override columns must not be rewritten by the waiver path.
    expect(updateStmt).not.toContain("custom_tuition_fee_amount");
    expect(updateStmt).not.toContain("discount_amount");
    expect(updateStmt).not.toContain("custom_transport_fee_amount");
  });
});

describe("waiveLateFeeAction calls the RPC (audit 1.5)", () => {
  const source = readFileSync(
    join(process.cwd(), "app/protected/payments/waive-late-fee-actions.ts"),
    "utf8",
  );

  it("calls the waive_late_fee RPC via the user-JWT client (audit 1.5 hotfix)", () => {
    // Hotfix — the RPC's in-DB `has_permission` guard requires auth.uid()
    // is not null, which fails under service-role. The action now uses
    // createClient (user JWT). requireStaffPermission still gates upstream.
    expect(source).toContain('supabase.rpc("waive_late_fee"');
    expect(source).not.toContain('admin.rpc("waive_late_fee"');
    expect(source).toContain("p_student_id: studentId");
    expect(source).toContain("p_amount: amount");
    expect(source).toContain("p_remarks: reason");
  });

  it("imports createClient (user JWT) — never the service-role admin client", () => {
    expect(source).toContain('from "@/lib/supabase/server"');
    expect(source).not.toContain('from "@/lib/supabase/admin"');
  });

  it("no longer reads v_workbook_student_financials separately before writing", () => {
    expect(source).not.toContain("v_workbook_student_financials");
  });

  it("no longer reads student_fee_overrides separately before writing", () => {
    expect(source).not.toContain(".from(\"student_fee_overrides\")");
  });

  it("no longer goes through upsertStudentFeeOverride for waivers", () => {
    expect(source).not.toContain("upsertStudentFeeOverride");
  });
});
