#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  const missing = [];
  if (!supabaseUrl) {
    missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const checks = [];

function isValidSessionLabel(value) {
  return /^(?:(?:TEST|UAT|DEMO)-)?\d{4}-\d{2}$/i.test((value ?? "").trim());
}

function pass(label, detail) {
  checks.push({ ok: true, label, detail });
  console.log(`✅ ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
  console.error(`❌ ${label}${detail ? ` - ${detail}` : ""}`);
}

async function runCheck(label, fn) {
  try {
    const detail = await fn();
    pass(label, detail);
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

async function assertQuery(label, query) {
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return label;
}

async function assertRpcExistsWithoutExecuting(name) {
  const endpoint = new URL(`/rest/v1/rpc/${name}`, supabaseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (response.ok || response.status === 405) {
    return `${name} is registered`;
  }

  const body = await response.text();
  if (response.status === 400 && !body.includes("PGRST202")) {
    return `${name} is registered`;
  }

  throw new Error(body || `HTTP ${response.status}`);
}

await runCheck("public.app_settings table exists", () =>
  assertQuery(
    "reachable",
    supabase.from("app_settings").select("key").limit(1),
  ),
);

await runCheck("active_session_label setting exists and parses", async () => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "active_session_label")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const value = data?.value?.trim();
  if (!value) {
    throw new Error("app_settings.active_session_label is missing");
  }

  if (!isValidSessionLabel(value)) {
    throw new Error(`invalid session label: ${value}`);
  }

  return value;
});

await runCheck("public.session_reconcile_log table exists", () =>
  assertQuery(
    "reachable",
    supabase.from("session_reconcile_log").select("id").limit(1),
  ),
);

await runCheck("public.student_session_reanchor_log table exists", () =>
  assertQuery(
    "reachable",
    supabase.from("student_session_reanchor_log").select("id").limit(1),
  ),
);

await runCheck("public.realign_recent_import_students_to_active_session function exists", () =>
  assertRpcExistsWithoutExecuting("realign_recent_import_students_to_active_session"),
);

await runCheck("test schema exists", () =>
  assertQuery(
    "test schema reachable through Data API",
    supabase.schema("test").from("academic_sessions").select("session_label").limit(1),
  ),
);

await runCheck("test.academic_sessions view exists", () =>
  assertQuery(
    "test.academic_sessions reachable",
    supabase.schema("test").from("academic_sessions").select("session_label").limit(1),
  ),
);

await runCheck("test.classes view exists", () =>
  assertQuery(
    "test.classes reachable",
    supabase.schema("test").from("classes").select("id").limit(1),
  ),
);

await runCheck("test.fee_policy_configs view exists", () =>
  assertQuery(
    "test.fee_policy_configs reachable",
    supabase.schema("test").from("fee_policy_configs").select("id").limit(1),
  ),
);

await runCheck("public.active_session_label() function exists and returns a value", async () => {
  const { data, error } = await supabase.rpc("active_session_label");

  if (error) {
    throw new Error(error.message);
  }

  const value = String(data ?? "").trim();
  if (!value) {
    throw new Error("active_session_label() returned an empty value");
  }

  return value;
});

if (checks.some((check) => !check.ok)) {
  process.exit(1);
}
