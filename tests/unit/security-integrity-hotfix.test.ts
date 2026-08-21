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
  it("disables every signup entry point and keeps existing staff email login compatible", () => {
    const config = read("supabase/config.toml");
    const loginAction = read("src/app/auth/login/actions.ts");
    const staffManagement = read("src/modules/staff/data/queries.ts");
    const globalAuthConfig = config.match(
      /^\[auth\]\r?\n([\s\S]*?)(?=^\[)/m,
    )?.[1];
    const emailAuthConfig = config.match(
      /^\[auth\.email\]\r?\n([\s\S]*?)(?=^\[)/m,
    )?.[1];
    expect(globalAuthConfig).toContain("enable_signup = false");
    expect(globalAuthConfig).toContain("enable_anonymous_sign_ins = false");
    expect(emailAuthConfig).toContain("enable_signup = true");
    expect(config).toContain("minimum_password_length = 6");
    expect(config).toContain('password_requirements = ""');
    expect(loginAction).toContain("supabase.auth.signInWithPassword");
    expect(loginAction).toContain('.toLowerCase()');
    expect(staffManagement).toContain("password.length < 6");
    expect(staffManagement).not.toContain("Password must include at least one");
  });

  it("locks anonymous users out of financial projections and posting RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");
    // mv_student_sibling_groups was in this list until the phone-match sibling
    // detection was removed and the matview dropped. The revoke is still in the
    // historical migration; there is just no object left for it to protect.
    for (const projection of [
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
    expect(sql).toContain("adjustment_row.adjustment_type = 'correction'");
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
    const parser = read("src/modules/imports/domain/parser.ts");
    expect(parser).toContain("MAX_IMPORT_WORKSHEETS");
    expect(parser).toContain("MAX_IMPORT_ROWS");
    expect(parser).toContain("MAX_IMPORT_COLUMNS");
    expect(parser).toContain("MAX_IMPORT_CELLS");
    expect(parser.indexOf("estimatedRows > MAX_IMPORT_ROWS")).toBeLessThan(
      parser.indexOf("sheet_to_json"),
    );
  });
});
