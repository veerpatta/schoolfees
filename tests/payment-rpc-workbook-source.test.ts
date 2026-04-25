import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
});
