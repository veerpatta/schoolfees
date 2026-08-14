import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Regenerate `supabase/schema.sql` from the live database.
 *
 *   node scripts/generate-schema-snapshot.mjs
 *   node scripts/generate-schema-snapshot.mjs --check   # CI: is it stale?
 *
 * The file is a readable snapshot of what `supabase/migrations/` adds up to.
 * The supported way to refresh it — `supabase db dump` — shells out to pg_dump
 * inside Docker, and the machine maintaining this repo does not have Docker.
 * That failure is destructive rather than merely inconvenient: `db dump -f`
 * creates the target file BEFORE discovering Docker is missing, so a failed run
 * truncates the snapshot to zero bytes. It has destroyed this file once.
 *
 * So the content comes from `public.generate_schema_snapshot()`, which
 * introspects pg_catalog and returns the whole file as one text value. That is
 * how the 2026-08-10 revision was made — by hand, which is why it then sat five
 * migrations behind. This is the same thing written down.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: the snapshot includes every RLS policy, so
 * the function is deliberately not callable by a browser session.
 */

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const checkOnly = process.argv.includes("--check");
const targetPath = "supabase/schema.sql";

const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase.rpc("generate_schema_snapshot");

if (error) {
  console.error(`Could not generate the snapshot: ${error.message}`);
  process.exit(1);
}

const snapshot = typeof data === "string" ? data : String(data ?? "");

// A zero-byte write is the exact failure mode this script exists to avoid, so
// refuse rather than reproduce it.
if (snapshot.trim().length < 10_000) {
  console.error(
    `Refusing to write: the snapshot came back at ${snapshot.length} chars, which cannot be a whole schema.`,
  );
  process.exit(1);
}

const previous = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
const normalize = (value) => value.replace(/\r\n/g, "\n").trim();
const unchanged = normalize(previous) === normalize(snapshot);

if (checkOnly) {
  if (unchanged) {
    console.log(`${targetPath} is up to date.`);
    process.exit(0);
  }

  console.error(
    `${targetPath} is STALE. Run: node scripts/generate-schema-snapshot.mjs`,
  );
  process.exit(1);
}

writeFileSync(targetPath, snapshot.endsWith("\n") ? snapshot : `${snapshot}\n`, "utf8");

const lines = snapshot.split("\n").length;
console.log(
  unchanged
    ? `${targetPath} regenerated — no change (${lines} lines).`
    : `${targetPath} regenerated: ${lines} lines, ${snapshot.length} chars.`,
);
