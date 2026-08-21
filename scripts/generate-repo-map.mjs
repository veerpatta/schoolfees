#!/usr/bin/env node
/**
 * Generate `docs/maps/repo-map.md` from the tree that actually exists.
 *
 * This file replaces eight hand-written folder inventories. They disagreed with
 * each other and with the repo: one claimed 41 lib domains where there were 46,
 * another 27 component folders where there were 28 plus six loose files, and
 * two docs gave different test counts. Nobody was careless — a count written by
 * hand is wrong the next time somebody adds a folder, and nothing told them.
 *
 * So the structure is generated and CI fails on drift. Prose about *why* the
 * structure is what it is stays hand-written, in the per-folder READMEs where a
 * reader is already standing.
 *
 *   node scripts/generate-repo-map.mjs           # write
 *   node scripts/generate-repo-map.mjs --check   # fail if stale
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "maps", "repo-map.md");
const check = process.argv.includes("--check");

const dirs = (p) =>
  existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];

function countFiles(p, filter = () => true) {
  if (!existsSync(p)) return 0;
  let n = 0;
  (function w(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) w(full);
      else if (filter(full)) n += 1;
    }
  })(p);
  return n;
}

const isSource = (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts");
const lineCount = (p) => readFileSync(p, "utf8").split(/\r?\n/).length;

/* ─── modules ────────────────────────────────────────────────────────────── */

const moduleRoot = path.join(ROOT, "src", "modules");
const modules = dirs(moduleRoot).map((name) => {
  const base = path.join(moduleRoot, name);
  const readme = path.join(base, "README.md");
  let line = "", route = "";
  if (existsSync(readme)) {
    const text = readFileSync(readme, "utf8");
    line = (text.split("\n")[2] ?? "").trim();
    route = (/\| Route \| (.*?) \|/.exec(text)?.[1] ?? "").trim();
  }
  return {
    name, line, route,
    domain: countFiles(path.join(base, "domain"), isSource),
    data: countFiles(path.join(base, "data"), isSource),
    ui: countFiles(path.join(base, "ui"), isSource),
  };
});

/* ─── the biggest files, because size is a fact worth surfacing ──────────── */

const allSource = [];
(function w(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) w(full);
    else if (isSource(full)) allSource.push(full);
  }
})(path.join(ROOT, "src"));
const biggest = allSource
  .map((p) => ({ rel: path.relative(ROOT, p).split(path.sep).join("/"), lines: lineCount(p) }))
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 8);

/* ─── tests ──────────────────────────────────────────────────────────────── */

const testRoot = path.join(ROOT, "tests");
const testDirs = dirs(testRoot).map((name) => ({
  name,
  files: countFiles(path.join(testRoot, name), (f) => /\.test\.(ts|tsx)$/.test(f)),
  all: countFiles(path.join(testRoot, name)),
}));

/* ─── render ─────────────────────────────────────────────────────────────── */

const L = [];
L.push("# Repo map", "");
L.push("**Generated. Do not edit by hand** — run `npm run docs:map`, and CI fails if this");
L.push("file disagrees with the tree. Eight hand-written copies of this inventory used to");
L.push("exist and they disagreed with each other; the *why* lives in the per-folder");
L.push("READMEs, and only the shape is generated here.", "");

L.push("## Top level", "");
L.push("| Path | What it is |", "|---|---|");
const TOP = [
  ["src/", "everything the application ships"],
  ["supabase/", "schema, migrations, seeds. Stays at the root — the CLI resolves it by convention"],
  ["tests/", "vitest, the scan, the deep harness, Playwright smokes"],
  ["scripts/", "operational and quality scripts"],
  ["quality/", "the budgets CI ratchets: source lines, route bundles, architecture"],
  ["docs/", "product rules, module guides, maps, QA reports"],
  ["workers/", "the read-only Cloudflare MCP server — its own bundle, its own entry point"],
  ["public/", "static assets. Must stay at the root (Next requirement)"],
];
for (const [p, what] of TOP) if (existsSync(path.join(ROOT, p.replace(/\/$/, "")))) L.push(`| \`${p}\` | ${what} |`);
L.push("");

L.push("## `src/`", "");
L.push("```");
L.push("src/");
L.push("├─ app/         Next routes only — page, layout, loading, error, route, actions");
L.push("├─ modules/     one folder per feature: domain/ data/ ui/");
L.push("├─ platform/    supabase · auth · config · db · session · i18n · money · helpers …");
L.push("├─ ui/          the design system: primitives · shell · mobile · hooks …");
L.push("└─ messages/    en · hi · hi-en catalogues");
L.push("```", "");
L.push("Import direction, enforced by `npm run quality:architecture`:", "");
L.push("| Layer | May import |", "|---|---|");
L.push("| `app/` | anything — it is the composition root |");
L.push("| `modules/<a>/` | `platform`, `ui`, and other modules' `domain/` and `data/` — never their `ui/` |");
L.push("| `modules/*/domain/` | as above, but never any `data/`: pure rules stay pure |");
L.push("| `ui/` | `ui` and `platform` only — never a module |");
L.push("| `platform/` | `platform` only. It is the floor |");
L.push("");

L.push(`## Modules (${modules.length})`, "");
L.push("| Module | Route | domain | data | ui |", "|---|---|---:|---:|---:|");
for (const m of modules) {
  L.push(`| [\`${m.name}\`](../../src/modules/${m.name}/README.md) | ${m.route || "—"} | ${m.domain} | ${m.data} | ${m.ui} |`);
}
L.push("");
L.push("Each module's README says what it owns, its invariants, and what must never");
L.push("happen there. `src/modules/README.md` indexes them and records why there is no");
L.push("`index.ts` barrel.", "");

L.push("## Platform and design system", "");
L.push(`\`src/platform\`: ${dirs(path.join(ROOT, "src", "platform")).map((d) => `\`${d}\``).join(" · ")}`, "");
L.push(`\`src/ui\`: ${dirs(path.join(ROOT, "src", "ui")).map((d) => `\`${d}\``).join(" · ")}`, "");

L.push("## Tests", "");
L.push("| Folder | Test files | All files |", "|---|---:|---:|");
for (const t of testDirs) L.push(`| \`tests/${t.name}\` | ${t.files} | ${t.all} |`);
L.push("");
L.push("`npm run test` runs vitest over two projects — `node` for everything and");
L.push("`interaction` (jsdom) for `tests/ui/interaction/**`. `tests/scan` and");
L.push("`tests/deep` are their own harnesses with their own commands. Playwright");
L.push("(`tests/smoke-readiness`, `tests/smoke-2026-05`) runs separately.", "");
L.push("**Many tests assert on source strings and paths.** A rename fails them, and the");
L.push("fix is to repoint the assertion, not delete it — several encode a bug that");
L.push("already happened once.", "");

L.push("## Largest files", "");
L.push("Surfaced because size is the thing a map can measure and a reader cannot.", "");
L.push("| Lines | File |", "|---:|---|");
for (const b of biggest) L.push(`| ${b.lines} | \`${b.rel}\` |`);
L.push("");
L.push("The ceilings that stop these growing live in");
L.push("`quality/office-quality-budgets.json`. They ratchet down, never up.", "");

const next = L.join("\n");
const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (check) {
  if (prev.replace(/\r\n/g, "\n") !== next) {
    console.error("docs/maps/repo-map.md is stale. Run `npm run docs:map` and commit the result.");
    process.exit(1);
  }
  console.log("Repo map is current.");
} else {
  writeFileSync(OUT, next, { encoding: "utf8" });
  console.log(`Wrote docs/maps/repo-map.md — ${modules.length} modules, ${allSource.length} source files.`);
}
