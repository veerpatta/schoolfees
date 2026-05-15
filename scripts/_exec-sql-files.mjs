#!/usr/bin/env node
// Helper that prints each SQL file's contents one at a time so a caller
// can execute them sequentially. This script does NOT execute SQL by itself
// (no service-role client) — it is used to stage payloads that will be
// shipped through the Supabase MCP `execute_sql` tool by the agent.
//
// Usage:
//   node scripts/_exec-sql-files.mjs <dir> <pattern> [--combine]
//   --combine prints all matching files joined by a blank line separator.

import fs from "node:fs";
import path from "node:path";

const [, , dir, patternStr, ...rest] = process.argv;
if (!dir || !patternStr) {
  process.stderr.write("usage: node scripts/_exec-sql-files.mjs <dir> <pattern>\n");
  process.exit(1);
}
const combine = rest.includes("--combine");
const pattern = new RegExp(patternStr);
const files = fs
  .readdirSync(dir)
  .filter((f) => pattern.test(f))
  .sort();
if (!files.length) {
  process.stderr.write(`no files match ${patternStr} in ${dir}\n`);
  process.exit(2);
}
const blocks = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
if (combine) {
  process.stdout.write(blocks.join("\n\n-- next --\n\n"));
} else {
  for (let i = 0; i < files.length; i += 1) {
    process.stdout.write(`==== ${files[i]} ====\n${blocks[i]}\n`);
  }
}
