#!/usr/bin/env node
/**
 * Money formatting audit — fails if any file under app/** or components/**
 * bypasses the canonical helpers in lib/helpers/currency.ts +
 * lib/helpers/date.ts. The point is grep-ability: every money figure on
 * every screen must be one find-references hop away from the formatter that
 * produced it.
 *
 * Allowed call sites:
 *   - lib/helpers/currency.ts and lib/helpers/date.ts (the helpers themselves)
 *   - components/ui/money*.tsx (the Money primitives, which delegate to the
 *     helpers)
 *
 * Anything else that calls `toLocaleString("en-IN", …)`, instantiates
 * `Intl.NumberFormat("en-IN", …)`, or hand-writes "Rs." or "₹" strings will
 * fail this script. Use formatInr() / <Money /> instead.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

const ALLOWLIST = new Set([
  path.normalize("components/ui/money.tsx"),
  path.normalize("components/ui/money-breakdown.tsx"),
  path.normalize("components/ui/money-with-definition.tsx"),
  path.normalize("components/ui/money-glossary.tsx"),
]);

const RULES = [
  {
    name: "raw-toLocaleString-en-IN",
    pattern: /toLocaleString\(\s*["']en-IN["']/,
    message: 'Use formatInr() / formatShortDate() instead of toLocaleString("en-IN", …).',
  },
  {
    name: "raw-Intl-NumberFormat-en-IN",
    pattern: /new\s+Intl\.NumberFormat\(\s*["']en-IN["']/,
    message: 'Use formatInr() instead of new Intl.NumberFormat("en-IN", …).',
  },
  {
    name: "raw-Intl-DateTimeFormat-en-IN",
    pattern: /new\s+Intl\.DateTimeFormat\(\s*["']en-IN["']/,
    message:
      'Use formatShortDate() / formatMediumDate() / formatDateTimeIst() instead of new Intl.DateTimeFormat("en-IN", …).',
  },
  {
    name: "rupee-symbol-literal",
    pattern: /["'`]₹/,
    message:
      "Do not hand-write the ₹ glyph in JSX or string literals. Use <Money /> / formatInr() so the symbol is rendered once via Intl.",
  },
  {
    name: "rs-period-literal",
    pattern: /["'`]Rs\.\s*\d|>\s*Rs\.\s/,
    message:
      'Replace "Rs." literal with the canonical ₹ glyph via formatInr() / <Money />.',
  },
];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      await walk(full, files);
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isAllowlisted(relPath) {
  return ALLOWLIST.has(path.normalize(relPath));
}

async function main() {
  const all = [];
  for (const scan of SCAN_DIRS) {
    const dir = path.join(ROOT, scan);
    try {
      const stats = await stat(dir);
      if (!stats.isDirectory()) continue;
    } catch {
      continue;
    }
    await walk(dir, all);
  }

  const violations = [];
  for (const file of all) {
    const rel = path.relative(ROOT, file);
    if (isAllowlisted(rel)) continue;
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Skip lines marked with an explicit override comment.
      if (line.includes("@allow-raw-money-format")) continue;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            rule: rule.name,
            message: rule.message,
            snippet: line.trim().slice(0, 140),
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(`✔ Money formatting audit: ${all.length} files scanned, 0 violations.`);
    process.exit(0);
  }

  const grouped = new Map();
  for (const v of violations) {
    if (!grouped.has(v.file)) grouped.set(v.file, []);
    grouped.get(v.file).push(v);
  }

  console.error(`✘ Money formatting audit: ${violations.length} violation(s) across ${grouped.size} file(s).\n`);
  for (const [file, list] of grouped) {
    console.error(`  ${file}`);
    for (const v of list) {
      console.error(`    L${v.line} [${v.rule}] ${v.message}`);
      console.error(`        ${v.snippet}`);
    }
    console.error("");
  }
  console.error(
    "If a violation is genuinely intentional, add  // @allow-raw-money-format  at the end of the offending line.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error("audit-money-formatting failed:", error);
  process.exit(2);
});
