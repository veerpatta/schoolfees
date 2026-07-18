import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260718090711_harden_notion_and_financial_permissions.sql",
  "utf8",
).toLowerCase();

describe("Notion and financial permission hardening migration", () => {
  it("makes every Notion projection security-invoker and removes general client access", () => {
    for (const view of [
      "v_notion_student_fee_summary",
      "v_notion_daily_collection_summary",
      "v_notion_family_fee_summary",
      "v_notion_student_fee_sync",
      "v_notion_daily_summary",
    ]) {
      expect(sql).toContain(`alter view public.${view} set (security_invoker = true)`);
    }
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to notion_fee_sync_role, service_role");
  });

  it("keeps the Notion role read-only and gives it explicit RLS read policies", () => {
    expect(sql).toContain("grant select on");
    expect(sql).toContain("to notion_fee_sync_role");
    expect(sql).toContain("for select to notion_fee_sync_role using (true)");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*notion_fee_sync_role/);
  });

  it("requires payment-write permission for receipt adjustment inserts", () => {
    expect(sql).toContain("payment writers can insert receipt finance adjustments");
    expect(sql).toContain("with check ((select public.has_permission('payments:write')))");
    expect(sql).not.toContain(
      'create policy "authenticated can insert receipt finance adjustments"',
    );
  });

  it("removes anonymous recovery refresh and pins every mutable search path", () => {
    expect(sql).toContain(
      "revoke execute on function public.refresh_defaulter_recovery_state(text, date) from anon",
    );
    for (const fn of [
      "public.get_dashboard_summary(text, text)",
      "public.refresh_financial_materialized_views(boolean)",
      "public.trigger_refresh_financial_views()",
      "private.enforce_third_child_traceability()",
      "private.derive_family_child_client_request_id(text, uuid)",
      "private.prevent_notion_sync_log_mutation()",
    ]) {
      expect(sql).toContain(`alter function ${fn}`);
    }
  });
});
