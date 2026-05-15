#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const requiredSessions = ["2025-26", "2026-27", "TEST-2026-27"];

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

const results = [];

function record(ok, label, detail = "") {
  results.push({ ok, label, detail });
  const prefix = ok ? "PASS" : "FAIL";
  const line = `${prefix}: ${label}${detail ? ` - ${detail}` : ""}`;

  if (ok) {
    console.log(line);
    return;
  }

  console.error(line);
}

function groupBySession(rows, key = "session_label") {
  const grouped = new Map(requiredSessions.map((session) => [session, []]));

  for (const row of rows ?? []) {
    const sessionLabel = String(row?.[key] ?? "").trim();
    if (grouped.has(sessionLabel)) {
      grouped.get(sessionLabel).push(row);
    }
  }

  return grouped;
}

function describeClass(row) {
  return [row.class_name, row.section, row.stream_name].filter(Boolean).join(" - ");
}

async function queryOrThrow(label, query) {
  const { data, error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  return data ?? [];
}

console.log("VPPS required session verification");
console.log(`Supabase URL: ${supabaseUrl}`);
console.log("Credential: service role");
console.log(`Required sessions: ${requiredSessions.join(", ")}`);

let sessions = [];
let policies = [];
let classes = [];
let feeSettings = [];

try {
  sessions = await queryOrThrow(
    "academic_sessions",
    supabase
      .from("academic_sessions")
      .select("session_label, status, is_current")
      .in("session_label", requiredSessions),
  );
} catch (error) {
  record(false, "Academic sessions query", error instanceof Error ? error.message : String(error));
}

try {
  policies = await queryOrThrow(
    "fee_policy_configs",
    supabase
      .from("fee_policy_configs")
      .select(
        "academic_session_label, calculation_model, installment_schedule, accepted_payment_modes, receipt_prefix, is_active, updated_at",
      )
      .in("academic_session_label", requiredSessions),
  );
} catch (error) {
  record(false, "Fee policy query", error instanceof Error ? error.message : String(error));
}

try {
  classes = await queryOrThrow(
    "classes",
    supabase
      .from("classes")
      .select("id, session_label, class_name, section, stream_name, status")
      .in("session_label", requiredSessions),
  );
} catch (error) {
  record(false, "Classes query", error instanceof Error ? error.message : String(error));
}

const activeClassIds = classes.filter((row) => row.status === "active").map((row) => row.id);
if (activeClassIds.length > 0) {
  try {
    feeSettings = await queryOrThrow(
      "fee_settings",
      supabase
        .from("fee_settings")
        .select("class_id, is_active")
        .eq("is_active", true)
        .in("class_id", activeClassIds),
    );
  } catch (error) {
    record(false, "Class fee defaults query", error instanceof Error ? error.message : String(error));
  }
}

const sessionsByLabel = groupBySession(sessions);
const policiesByLabel = groupBySession(policies, "academic_session_label");
const classesByLabel = groupBySession(classes);
const feeSettingClassIds = new Set(feeSettings.map((row) => row.class_id));

for (const sessionLabel of requiredSessions) {
  const sessionRows = sessionsByLabel.get(sessionLabel) ?? [];
  const policyRows = policiesByLabel.get(sessionLabel) ?? [];
  const classRows = classesByLabel.get(sessionLabel) ?? [];
  const activeClasses = classRows.filter((row) => row.status === "active");
  const missingFeeDefaults = activeClasses.filter((row) => !feeSettingClassIds.has(row.id));

  record(
    sessionRows.length === 1 && sessionRows[0].status === "active",
    `${sessionLabel} academic session is active`,
    sessionRows.length === 0
      ? "missing"
      : `status ${sessionRows[0].status}, current ${sessionRows[0].is_current}`,
  );

  const latestPolicy = policyRows[0] ?? null;
  const schedule = Array.isArray(latestPolicy?.installment_schedule)
    ? latestPolicy.installment_schedule
    : [];
  const paymentModes = Array.isArray(latestPolicy?.accepted_payment_modes)
    ? latestPolicy.accepted_payment_modes
    : [];

  record(
    Boolean(latestPolicy) && schedule.length > 0 && paymentModes.length > 0,
    `${sessionLabel} fee policy is ready`,
    latestPolicy
      ? `${latestPolicy.calculation_model}, ${schedule.length} installments, ${paymentModes.length} payment modes`
      : "missing",
  );

  record(
    activeClasses.length > 0,
    `${sessionLabel} has active classes`,
    activeClasses.length > 0 ? `${activeClasses.length} active classes` : "missing",
  );

  record(
    activeClasses.length > 0 && missingFeeDefaults.length === 0,
    `${sessionLabel} active classes have fee defaults`,
    missingFeeDefaults.length === 0
      ? `${activeClasses.length} classes checked`
      : missingFeeDefaults.map(describeClass).join(", "),
  );
}

if (results.some((item) => !item.ok)) {
  process.exit(1);
}
