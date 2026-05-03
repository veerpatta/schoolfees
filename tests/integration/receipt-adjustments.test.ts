import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readAdjustmentMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260503120000_payment_desk_receipt_adjustments.sql",
    ),
    "utf8",
  );
}

describe("receipt-specific payment desk adjustments", () => {
  it("stores quick discounts and late fee waivers as append-only receipt adjustments", () => {
    const migration = readAdjustmentMigration();

    expect(migration).toContain("create table if not exists public.receipt_adjustments");
    expect(migration).toContain("receipt_adjustments_are_append_only");
    expect(migration).toContain("adjustment_type in ('discount', 'writeoff')");
    expect(migration).toContain("Payment Desk quick discount");
    expect(migration).toContain("Payment Desk late fee waiver");
  });

  it("reduces workbook pending through receipt adjustments without counting them as cash payments", () => {
    const migration = readAdjustmentMigration();

    expect(migration).toContain("from public.receipt_adjustments");
    expect(migration).toContain("greatest(rolled.paid_amount, 0)::integer as applied_amount");
    expect(migration).toContain("waiver_eval.paid_amount > 0");
    expect(migration).toContain("total_charge");
    expect(migration).toContain("adjustment_amount");
  });

  it("receipt detail reads discount from this receipt instead of current aggregate discount", () => {
    const receiptData = readFileSync(join(process.cwd(), "lib", "receipts", "data.ts"), "utf8");

    expect(receiptData).toContain('.from("receipt_adjustments")');
    expect(receiptData).toContain('row.adjustment_type === "discount"');
    expect(receiptData).toContain('row.adjustment_type === "writeoff"');
    expect(receiptData).toContain("discountAmount: receiptDiscountAmount");
    expect(receiptData).not.toContain("discountAmount: financial?.discount_amount");
  });
});
