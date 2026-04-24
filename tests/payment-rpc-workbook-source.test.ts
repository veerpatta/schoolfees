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
});
