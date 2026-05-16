import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("phase 1 migration verification scripts", () => {
  it("documents and implements the phase 1 migration verifier checks", () => {
    const scriptPath = "scripts/verify-phase1-migrations.mjs";
    expect(existsSync(join(repoRoot, scriptPath))).toBe(true);

    const script = readRepoFile(scriptPath);
    expect(script).toContain("app_settings");
    expect(script).toContain("active_session_label");
    expect(script).toContain("session_reconcile_log");
    expect(script).toContain("student_session_reanchor_log");
    expect(script).toContain("realign_recent_import_students_to_active_session");
    expect(script).toContain("test.academic_sessions");
    expect(script).toContain("test.classes");
    expect(script).toContain("test.fee_policy_configs");
    expect(script).toContain("process.exit(1)");

    const readme = readRepoFile("README.md");
    expect(readme).toContain("node scripts/verify-phase1-migrations.mjs");
  });

  it("keeps phase 1 session-sync database objects in the canonical schema", () => {
    const schema = readRepoFile("supabase/schema.sql");

    expect(schema).toContain("create table if not exists public.app_settings");
    expect(schema).toContain("create or replace function public.active_session_label()");
    expect(schema).toContain("create table if not exists public.student_session_reanchor_log");
    expect(schema).toContain("create or replace function public.realign_recent_import_students_to_active_session");
    expect(schema).toContain("select public.active_session_label()");
    expect(schema).toContain("create table if not exists public.session_reconcile_log");
    expect(schema).toContain("drop policy if exists \"fees:view can read reconcile log\"");
  });

  it("keeps the session reconcile migration idempotent", () => {
    const migration = readRepoFile("supabase/migrations/20260515151450_session_reconcile_log.sql");

    expect(migration).toContain("create table if not exists public.session_reconcile_log");
    expect(migration).toContain("create index if not exists idx_session_reconcile_log_session_started");
    expect(migration).toContain("drop policy if exists \"fees:view can read reconcile log\"");
    expect(migration).toContain("drop policy if exists \"fees:write can write reconcile log\"");
    expect(migration).toContain("drop policy if exists \"fees:write can update reconcile log\"");
  });

  it("checks the live sync verifier against the app's actual payment RPC and count API", () => {
    const script = readRepoFile("scripts/verify-live-sync-health.mjs");

    expect(script).toContain("post_student_payment_with_adjustments");
    expect(script).toContain("const { count: financialCount");
    expect(script).not.toContain("const { data: financials");
    expect(script).not.toContain("[\"none\"]");
  });

  it("documents and implements the required academic sessions verifier", () => {
    const scriptPath = "scripts/verify-required-sessions.mjs";
    expect(existsSync(join(repoRoot, scriptPath))).toBe(true);

    const script = readRepoFile(scriptPath);
    expect(script).toContain('"2025-26", "2026-27", "TEST-2026-27"');
    expect(script).toContain("academic_sessions");
    expect(script).toContain("fee_policy_configs");
    expect(script).toContain("classes");
    expect(script).toContain("fee_settings");
    expect(script).toContain("process.exit(1)");
    expect(script).not.toContain(".insert(");
    expect(script).not.toContain(".update(");
    expect(script).not.toContain(".delete(");

    const readme = readRepoFile("README.md");
    expect(readme).toContain("node scripts/verify-required-sessions.mjs");
  });

  it("keeps the public TEST-data audit helper read-only", () => {
    const scriptPath = "scripts/audit-test-data-in-public.mjs";
    expect(existsSync(join(repoRoot, scriptPath))).toBe(true);

    const script = readRepoFile(scriptPath);
    expect(script).toContain("TEST students remaining in public");
    expect(script).toContain("session_label");
    expect(script).not.toContain(".delete(");
    expect(script).not.toContain(".update(");
    expect(script).not.toContain(".insert(");
    expect(script).not.toContain("DELETE PUBLIC TEST DATA");
  });
});
