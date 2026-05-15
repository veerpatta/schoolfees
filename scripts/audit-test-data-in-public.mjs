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

const { data: testClasses, error: classError } = await supabase
  .from("classes")
  .select("id, session_label")
  .like("session_label", "TEST%");

if (classError) {
  console.error(`Unable to read TEST classes in public: ${classError.message}`);
  process.exit(1);
}

const classIds = (testClasses ?? []).map((row) => row.id);
let count = 0;

if (classIds.length > 0) {
  const { count: studentCount, error: studentError } = await supabase
    .from("students")
    .select("id", { head: true, count: "exact" })
    .in("class_id", classIds);

  if (studentError) {
    console.error(`Unable to count TEST students remaining in public: ${studentError.message}`);
    process.exit(1);
  }

  count = studentCount ?? 0;
}

console.log(`TEST classes in public: ${classIds.length}`);
console.log(`TEST students remaining in public: ${count}`);
