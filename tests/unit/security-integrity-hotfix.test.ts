import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const migrationPath = join(
  repoRoot,
  "supabase/migrations/20260727113603_secure_financial_surfaces_and_repair_receipt_allocations.sql",
);

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("security and integrity hotfix", () => {
  it("disables every signup entry point and enforces the office password policy", () => {
    const config = read("supabase/config.toml");
    expect(config.match(/enable_signup = false/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(config).not.toContain("enable_signup = true");
    expect(config).toContain("minimum_password_length = 12");
    expect(config).toContain(
      'password_requirements = "lower_upper_letters_digits_symbols"',
    );
  });

  it("locks anonymous users out of financial projections and posting RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const projection of [
      "mv_student_sibling_groups",
      "v_student_financial_state",
      "v_workbook_installment_balances",
      "v_workbook_student_financials",
    ]) {
      expect(sql).toContain(
        `revoke all on table public.${projection} from public, anon`,
      );
    }
    expect(sql).toContain(
      "revoke execute on function public.post_student_payment_with_adjustments",
    );
    expect(sql).toContain(
      "revoke execute on function public.waive_late_fee",
    );
    expect(sql).toContain(
      "drop function if exists public.post_family_payment",
    );
  });

  it("keeps the historical receipt repair guarded and append-only", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("v_anomaly_count <> 12");
    expect(sql).toContain("v_pair_count <> 6");
    expect(sql).toContain("insert into public.payment_adjustments");
    expect(sql).toContain("insert into public.payments");
    expect(sql).not.toMatch(/\bupdate\s+public\.(receipts|payments)\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.(receipts|payments)\b/i);
    expect(sql).toContain("v_receipt_effective_allocation_totals");
    expect(sql).toContain("with (security_invoker = true)");
  });

  it("does not retain active live-session mutation scripts", () => {
    for (const filename of [
      "scripts/_revamp/tier3-import-students.mjs",
      "scripts/_revamp/tier4-assign-discounts.mjs",
      "scripts/_revamp/tier7-import-payments.mjs",
      "scripts/_revamp/tier8-reallocate-payments.mjs",
    ]) {
      expect(existsSync(join(repoRoot, filename)), filename).toBe(false);
    }
  });

  it("bounds uploaded workbooks before materializing worksheet rows", () => {
    const parser = read("lib/import/parser.ts");
    expect(parser).toContain("MAX_IMPORT_WORKSHEETS");
    expect(parser).toContain("MAX_IMPORT_ROWS");
    expect(parser).toContain("MAX_IMPORT_COLUMNS");
    expect(parser).toContain("MAX_IMPORT_CELLS");
    expect(parser.indexOf("estimatedRows > MAX_IMPORT_ROWS")).toBeLessThan(
      parser.indexOf("sheet_to_json"),
    );
  });
});
