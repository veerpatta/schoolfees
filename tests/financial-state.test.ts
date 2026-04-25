import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { calculateStudentFinancialState } from "@/lib/finance/financial-state";

describe("student financial state", () => {
  it("fee_setup_reduction_after_payment_creates_credit_balance", () => {
    expect(
      calculateStudentFinancialState({
        revisedTotalDue: 18000,
        totalPaid: 20000,
      }),
    ).toMatchObject({
      pendingAmount: 0,
      creditBalance: 2000,
      refundableAmount: 2000,
    });
  });

  it("fee_setup_increase_after_payment_creates_pending_balance", () => {
    expect(
      calculateStudentFinancialState({
        revisedTotalDue: 22000,
        totalPaid: 20000,
      }),
    ).toMatchObject({
      pendingAmount: 2000,
      creditBalance: 0,
      refundableAmount: 0,
    });
  });

  it("student_discount_after_payment_creates_credit_balance", () => {
    expect(
      calculateStudentFinancialState({
        revisedTotalDue: 9000,
        totalPaid: 10000,
      }).overpaidAmount,
    ).toBe(1000);
  });

  it("student_route_change_after_payment_recalculates_pending_or_credit", () => {
    const removedRoute = calculateStudentFinancialState({
      revisedTotalDue: 12000,
      totalPaid: 14000,
    });
    const addedRoute = calculateStudentFinancialState({
      revisedTotalDue: 16000,
      totalPaid: 14000,
    });

    expect(removedRoute.creditBalance).toBe(2000);
    expect(addedRoute.pendingAmount).toBe(2000);
  });

  it("exposes refund projection without mutating append-only payment history", () => {
    const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");
    const view = schema.slice(schema.lastIndexOf("create or replace view public.v_student_financial_state"));

    expect(view).toContain("public.v_workbook_student_financials");
    expect(view).toContain("credit_balance");
    expect(view).toContain("refundable_amount");
    expect(view).not.toContain("update public.payments");
    expect(view).not.toContain("delete from public.receipts");
  });

  it("receipts_payments_remain_append_only", () => {
    const schema = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf8");

    expect(schema).toContain("receipts_are_append_only");
    expect(schema).toContain("payments_are_append_only");
    expect(schema).toContain("payment_adjustments_are_append_only");
    expect(schema).toContain("audit_logs_are_append_only");
  });
});
