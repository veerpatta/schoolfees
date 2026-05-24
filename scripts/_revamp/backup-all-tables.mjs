#!/usr/bin/env node
/**
 * VPPS — pre-revamp full backup
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to dump every public.* table to JSON files
 * under backups/pre-revamp-YYYY-MM-DD/. Each file is one table.
 *
 * Run: node scripts/_revamp/backup-all-tables.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

// load .env.local manually (no dotenv dep)
const envText = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "academic_sessions", "users", "classes", "transport_routes", "students",
  "fee_settings", "student_fee_overrides", "installments",
  "receipts", "payments", "payment_adjustments", "payment_adjustment_reviews",
  "receipt_adjustments", "receipt_finance_adjustments", "audit_logs",
  "collection_closures", "refund_requests",
  "office_sync_events", "school_fee_defaults", "import_batches", "import_rows",
  "fee_policy_configs", "config_change_batches", "config_change_blocked_installments",
  "ledger_regeneration_batches", "ledger_regeneration_rows", "setup_progress",
  "workbook_materialized_view_refresh_queue", "conventional_discount_policies",
  "student_family_groups", "student_family_members",
  "student_conventional_discount_assignments", "app_settings",
  "student_session_reanchor_log", "session_reconcile_log", "family_payments",
];

const date = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(`backups/pre-revamp-${date}`);
fs.mkdirSync(outDir, { recursive: true });

const summary = [];

for (const table of TABLES) {
  // paginate so we never hit the 1000-row default limit
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      console.error(`[backup] ${table} ERROR: ${error.message}`);
      summary.push({ table, rows: null, error: error.message });
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (all.length === 0 && summary.find((s) => s.table === table)?.error) continue;
  const filePath = path.join(outDir, `${table}.json`);
  fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf8");
  console.log(`[backup] ${table.padEnd(45)} -> ${all.length} rows (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
  summary.push({ table, rows: all.length, file: path.basename(filePath) });
}

const manifest = {
  generated_at: new Date().toISOString(),
  project_url: url,
  out_dir: outDir,
  tables: summary,
  total_tables: summary.length,
  total_rows: summary.reduce((s, t) => s + (t.rows ?? 0), 0),
};
fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`\n[backup] manifest -> ${path.join(outDir, "_manifest.json")}`);
console.log(`[backup] ${summary.length} tables, ${manifest.total_rows} rows total`);
