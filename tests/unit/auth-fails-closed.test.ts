import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Found by smoke-testing the whole app, not the EMI feature.
 *
 * private.current_staff_role() used to COALESCE a missing staff row to
 * 'view_only'. It checked is_active correctly and then handed the caller a
 * working role anyway — so deactivating a departed employee demoted them
 * rather than removing them. With a still-valid token they could read all 614
 * students, 376 receipts and the school's live financial position straight off
 * the data API. requireAuthenticatedStaff() keeps them out of the PAGES, but
 * that guard does not sit in front of PostgREST.
 *
 * These assertions pin the CURRENT definitions: earlier migrations keep the
 * history they applied, and replay converges on the fixed versions.
 */
const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function currentDefinitionOf(needle: string) {
  const defining = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => readFileSync(join(MIGRATIONS, file), "utf8").includes(needle));

  expect(defining.length, `no migration defines ${needle}`).toBeGreaterThan(0);

  return readFileSync(join(MIGRATIONS, defining[defining.length - 1]), "utf8");
}

describe("staff authorisation fails closed", () => {
  it("never hands a role to a caller with no active staff record", () => {
    const sql = currentDefinitionOf(
      "create or replace function private.current_staff_role()",
    );
    // Slice to THIS function's body: the same migration also defines
    // get_dashboard_fee_split, whose legitimate coalesce() calls would
    // otherwise trip the assertion below.
    const start = sql.indexOf("create or replace function private.current_staff_role()");
    const body = sql.slice(start, sql.indexOf("$function$;", start));
    const executable = body
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    // A COALESCE here is the bug: it turns "no staff row" into a usable role.
    expect(executable).not.toMatch(/coalesce/i);
    expect(executable).toContain("u.is_active = true");
  });

  it("guards the SECURITY DEFINER dashboard readers, which bypass RLS", () => {
    // These three run as the definer, so RLS never sees the caller. Without an
    // explicit check, any signed-in token reads school-wide finance.
    const feeSplit = currentDefinitionOf(
      "create or replace function public.get_dashboard_fee_split",
    );
    expect(feeSplit).toContain("has_any_permission");

    const summaryGuard = currentDefinitionOf(
      "You do not have permission to read the dashboard",
    );
    expect(summaryGuard).toContain("has_any_permission");

    const repayment = currentDefinitionOf(
      "create or replace function public.get_dashboard_repayment_summary",
    );
    expect(repayment).toContain("has_any_permission");
  });
});
