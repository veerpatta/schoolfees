import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PAYLOAD_PATH = "docs/import-previews/2026-05-14-latest-excel-dry-run/direct-2026-27-import-payload.json";
const CHUNK_SIZE = 100;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function chunks(rows) {
  const result = [];
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    result.push(rows.slice(index, index + CHUNK_SIZE));
  }
  return result;
}

async function stageKind(supabase, token, kind, rows) {
  let total = 0;
  for (const chunk of chunks(rows)) {
    const { data, error } = await supabase.rpc("vpps_stage_direct_import_20260514", {
      p_token: token,
      p_kind: kind,
      p_rows: chunk,
    });
    if (error) {
      throw new Error(`${kind} staging failed: ${error.message}`);
    }
    total += chunk.length;
    console.log(`${kind}: staged ${total}/${rows.length}`, data);
  }
}

loadEnvFile(path.resolve(".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const token = process.env.VPPS_DIRECT_IMPORT_TOKEN;

if (!url || !key) {
  throw new Error("Supabase URL or publishable key is missing from .env.local.");
}
if (!token) {
  throw new Error("VPPS_DIRECT_IMPORT_TOKEN is not set.");
}

const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
const skipped = [
  ...payload.skippedStudentRows.map((row) => ({
    ...row,
    source: row.source ?? "member",
    status: row.status ?? "skipped_no_current_2026_27_class",
  })),
  ...payload.skippedDueRows,
];

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

await stageKind(supabase, token, "students", payload.students);
await stageKind(supabase, token, "dues", payload.dues);
await stageKind(supabase, token, "skipped", skipped);

console.log(
  JSON.stringify(
    {
      importName: payload.summary.importName,
      students: payload.students.length,
      dues: payload.dues.length,
      skipped: skipped.length,
    },
    null,
    2,
  ),
);
