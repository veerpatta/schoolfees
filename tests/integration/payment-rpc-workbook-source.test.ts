import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readLatestPaymentMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260425143000_payment_desk_idempotency_and_locking.sql",
    ),
    "utf8",
  );
}

describe("post_student_payment workbook source", () => {
  it("uses workbook balances for workbook_v1 payment validation and allocation", () => {
    const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const latestFunction = schema.slice(schema.lastIndexOf("create or replace function public.post_student_payment"));

    expect(latestFunction).toContain("active_policy_model = 'workbook_v1'");
    expect(latestFunction).toContain("private.workbook_installment_snapshot");
    expect(latestFunction).toContain("where pending_amount > 0");
    expect(latestFunction).toContain("order by due_date asc, installment_no asc");
    expect(latestFunction).toContain("Payment amount cannot exceed total pending amount.");
  });

  it("payment_preview_pending_equals_posting_pending", () => {
    const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const previewFunction = schema.slice(
      schema.lastIndexOf("create or replace function public.preview_workbook_payment_allocation"),
    );
    const postFunction = schema.slice(schema.lastIndexOf("create or replace function public.post_student_payment"));

    expect(previewFunction).toContain(
      "private.workbook_installment_snapshot(p_student_id, p_payment_date, true)",
    );
    expect(postFunction).toContain("from private.workbook_installment_snapshot(");
    expect(postFunction).toContain("p_payment_date");
    expect(postFunction).toContain("true");
    expect(postFunction).toContain("where pending_amount > 0");
    expect(postFunction).toContain("allocation_amount := least(remaining_amount, balance_row.pending_amount)");
  });

  it("post_student_payment_generates_receipt_without_receipt_number_ambiguity", () => {
    const migration = readLatestPaymentMigration();

    expect(migration).toContain("from public.receipts as receipt_row");
    expect(migration).toContain("regexp_match(receipt_row.receipt_number, '-([0-9]{4})$')");
    expect(migration).toContain(
      "where receipt_row.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%'",
    );
  });

  it("post_student_payment_uses_qualified_receipt_number_column", () => {
    const migration = readLatestPaymentMigration();

    expect(migration).toContain("receipt_row.receipt_number");
    expect(migration).toContain("v_candidate_receipt_number :=");
    expect(migration).toContain("v_candidate_receipt_id as receipt_id");
    expect(migration).toContain("v_candidate_receipt_number as receipt_number");
  });

  it("payment_action_reuses_existing_receipt_for_same_idempotency_key", () => {
    const migration = readLatestPaymentMigration();

    expect(migration).toContain("client_request_id uuid");
    expect(migration).toContain("receipts_student_client_request_id_unique");
    expect(migration).toContain("and r.client_request_id = p_client_request_id");
    expect(migration).toContain("v_existing_receipt_number as receipt_number");
  });

  it("post_student_payment_locks_student_allocation_scope", () => {
    const migration = readLatestPaymentMigration();

    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))");
    expect(migration).toContain("select coalesce(sum(snapshot_row.pending_amount), 0)");
    expect(migration).toContain("p_client_request_id uuid default null");
  });

  it("payment_receipt_number_sequence_increments_for_same_day", () => {
    const migration = readLatestPaymentMigration();

    expect(migration).toContain(
      "max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer)",
    );
    expect(migration).toContain("v_daily_sequence := v_daily_sequence + 1");
    expect(migration).toContain("lpad(v_daily_sequence::text, 4, '0')");
    expect(migration).toContain("to_char(p_payment_date, 'YYYYMMDD')");
  });
});
