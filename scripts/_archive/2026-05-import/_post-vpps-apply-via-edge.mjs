#!/usr/bin/env node
// Posts each JSONB payload to the deployed vpps-import-applier edge function.
// The edge function calls private.vpps_apply_chunk via service-role RPC.
// This avoids shipping ~1MB of SQL through the agent's context.
//
// Requires:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] && process.env[m[1]] !== "") continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
// Edge functions with verify_jwt=true require a JWT-format key; the modern
// "sb_publishable_..." token is not a JWT, so prefer the legacy anon JWT.
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env");
  process.exit(1);
}

const FN_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/vpps-import-applier`;
const JSONB_DIR = "docs/import-previews/2026-05-15-latest-vpps-import/apply-payloads/jsonb";

// Chunking - keep each request body under ~2MB to be safe.
const ROWS_PER_REQUEST = 200;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function post(kind, rows) {
  const body = JSON.stringify({ kind, rows });
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return parsed;
}

async function run(kind, payloadPath, label = kind) {
  const all = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  console.log(`\n[${label}] ${all.length} rows from ${payloadPath}`);
  const batches = chunk(all, ROWS_PER_REQUEST);
  let appliedTotal = 0;
  for (let i = 0; i < batches.length; i += 1) {
    const r = await post(kind, batches[i]);
    appliedTotal += r.result?.applied ?? 0;
    console.log(`  batch ${i + 1}/${batches.length}: applied=${r.result?.applied ?? "?"} rowsProcessed=${r.result?.rowsProcessed ?? "?"}`);
  }
  console.log(`[${label}] DONE — applied=${appliedTotal}`);
  return appliedTotal;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.length ? new Set(args) : null;

  const steps = [
    { name: "students", kind: "students", file: "students-payload.json" },
    { name: "mapping", kind: "mapping", file: "mapping-payload.json" },
    { name: "left", kind: "left", file: "left-payload.json" },
    { name: "payments", kind: "stage_dues", file: "payments-payload.json" },
    { name: "feelines", kind: "stage_dues", file: "feelines-payload.json" },
  ];

  const summary = {};
  for (const step of steps) {
    if (only && !only.has(step.name)) continue;
    summary[step.name] = await run(step.kind, path.join(JSONB_DIR, step.file), step.name);
  }
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
