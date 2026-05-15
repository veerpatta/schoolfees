#!/usr/bin/env node
// Extracts the inner JSON array from an MCP execute_sql tool-results file
// (large-output overflow file).
// Format: outer JSON is [{type:"text", text:"<json-encoded result>"}]
// Inside text: {"result":"...<untrusted-data-XXX>\n[...json...]\n</untrusted-data-XXX>..."}
//
// Usage: node scripts/_extract-mcp-result.mjs <input> <out-dir>

import fs from "node:fs";
import path from "node:path";

const [, , input, outDir] = process.argv;
if (!input || !outDir) {
  process.stderr.write("usage: node scripts/_extract-mcp-result.mjs <input> <out-dir>\n");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const outer = JSON.parse(fs.readFileSync(input, "utf8"));
const joined = outer.map((c) => c.text ?? "").join("");
const innerWrapper = JSON.parse(joined);
const resultText = innerWrapper.result ?? "";
// Match opening tag followed by newline + content + newline + closing tag
// with matching token (back-reference). This avoids capturing the prose
// mentions of the marker token.
const wrapper = resultText.match(/<untrusted-data-([0-9a-f-]+)>\n([\s\S]+?)\n<\/untrusted-data-\1>/);
if (!wrapper) {
  process.stderr.write("no untrusted-data wrapper found in result\n");
  process.exit(2);
}
const inner = JSON.parse(wrapper[2]);

if (
  Array.isArray(inner) &&
  inner.length &&
  Object.prototype.hasOwnProperty.call(inner[0], "kind") &&
  Object.prototype.hasOwnProperty.call(inner[0], "data")
) {
  for (const row of inner) {
    const file = path.join(outDir, `${row.kind}.json`);
    const payload = Array.isArray(row.data) ? row.data : (row.data ?? []);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    process.stdout.write(`wrote ${file} (${Array.isArray(payload) ? payload.length : "obj"})\n`);
  }
} else if (Array.isArray(inner) && inner.length === 1 && Object.prototype.hasOwnProperty.call(inner[0], "data")) {
  const base = path.basename(input).replace(/\.[^.]+$/, "");
  const file = path.join(outDir, base + ".json");
  fs.writeFileSync(file, JSON.stringify(inner[0].data, null, 2));
  process.stdout.write(`wrote ${file} (${Array.isArray(inner[0].data) ? inner[0].data.length : "obj"})\n`);
} else {
  const base = path.basename(input).replace(/\.[^.]+$/, "");
  const file = path.join(outDir, base + ".json");
  fs.writeFileSync(file, JSON.stringify(inner, null, 2));
  process.stdout.write(`wrote ${file}\n`);
}
