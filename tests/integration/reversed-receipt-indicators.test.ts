import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Receipts are append-only, so a reversed receipt stays visible in every
// list. These assertions guard the promise that the reversed state is
// INDICATED everywhere a receipt row appears — not just on the detail page.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("v_receipt_reversal_totals migration", () => {
  const migrationFile = readdirSync(join(process.cwd(), "supabase", "migrations")).find((name) =>
    name.endsWith("_receipt_reversal_totals_view.sql"),
  );

  it("creates the view with security_invoker and per-receipt reversal sums", () => {
    expect(migrationFile).toBeTruthy();
    const sql = read("supabase", "migrations", migrationFile as string);
    expect(sql).toContain("create or replace view public.v_receipt_reversal_totals");
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("adjustment_type = 'reversal'");
    expect(sql).toMatch(/group by p\.receipt_id/);
  });
});

describe("data layers decorate receipt rows with isReversed", () => {
  it("workbook transactions (Transactions page + receipt exports)", () => {
    const source = read("lib", "workbook", "data.ts");
    expect(source).toContain("getReceiptReversalTotals");
    expect(source).toMatch(/isReversed: isReceiptReversed\(reversalTotals, row\.id, row\.total_amount\)/);
  });

  it("receipts list (Receipts page + search)", () => {
    const source = read("lib", "receipts", "data.ts");
    const fn = source.slice(source.indexOf("export async function getReceiptsPage"));
    expect(fn).toContain("getReceiptReversalTotals");
    expect(fn).toContain("isReversed: isReceiptReversed(");
  });

  it("payment desk recent receipts + latest receipt", () => {
    const source = read("lib", "payments", "data.ts");
    expect(source).toContain("getReceiptReversalTotals");
    const recent = source.slice(source.indexOf("async function getRecentPaymentDeskReceiptsUncached"));
    expect(recent.slice(0, 1500)).toContain("isReceiptReversed");
  });

  it("student profile receipt history", () => {
    const source = read("lib", "students", "workspace.ts");
    expect(source).toContain("getReceiptReversalTotals");
    expect(source).toContain("isReceiptReversed");
  });
});

describe("list components render the ReversedBadge", () => {
  const badgeConsumers = [
    ["components", "transactions", "transactions-client-shell.tsx"],
    ["components", "receipts", "receipts-quick-load.tsx"],
    ["components", "payments", "desk-totals-section.tsx"],
    ["components", "students", "student-receipts-panel.tsx"],
  ] as const;

  for (const parts of badgeConsumers) {
    it(parts.join("/"), () => {
      const source = read(...parts);
      expect(source).toContain("ReversedBadge");
      expect(source).toContain("isReversed");
    });
  }

  it("receipt document previous-receipts list flags reversed history", () => {
    const source = read("components", "receipts", "receipt-document-v2.tsx");
    expect(source).toContain("item.isReversed");
  });
});

describe("exports carry the reversed state", () => {
  it("transactions CSV export has a Status column with REVERSED", () => {
    const source = read("app", "protected", "transactions", "export", "route.ts");
    expect(source).toContain('"Status"');
    expect(source).toContain('row.isReversed ? "REVERSED" : ""');
  });

  it("receipt-register XLSX export has a Status column with REVERSED", () => {
    const source = read("app", "protected", "exports", "[exportType]", "route.ts");
    expect(source).toContain('"Status": row.isReversed ? "REVERSED" : ""');
  });
});
