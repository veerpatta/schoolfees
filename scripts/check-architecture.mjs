#!/usr/bin/env node
/**
 * The layering gate.
 *
 * `@/*` resolves to `./src/*` and nothing stops any file importing any other,
 * which is how this codebase acquired three import cycles nobody chose. This
 * walks the real import graph and holds it to the layout the folders promise.
 *
 * It ratchets, like quality:budgets and the scan baseline: a NEW violation or a
 * NEW module cycle fails; the ones recorded in
 * `quality/architecture-baseline.json` are known debt and are allowed to stay
 * until somebody pays them off. Counts may go down and never up.
 *
 *   node scripts/check-architecture.mjs              # report + gate
 *   node scripts/check-architecture.mjs --write-baseline
 *   node scripts/check-architecture.mjs --graph      # print module edges
 *
 * ---------------------------------------------------------------------------
 * Why there is no `index.ts` barrel per module
 *
 * The obvious design — one public `index.ts` per module, everything else
 * private — cannot work here, and not for stylistic reasons. Every substantial
 * module mixes `server-only` data files with `"use client"` components
 * (students: 10 and 35). A barrel re-exporting both means a client component
 * importing the module pulls `server-only` code into the browser bundle, which
 * is a build error. And with no `sideEffects: false` in package.json, webpack
 * must assume every re-export matters, so the barrel would also drag whole
 * modules into routes that use one function — against ceilings that only
 * ratchet down.
 *
 * So the public surface is per LAYER, not per module, and it is enforced here
 * rather than by a file: a module's `domain/` and `data/` are its API, and its
 * `ui/` belongs to it alone.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const BASELINE = path.join(ROOT, "quality", "architecture-baseline.json");
const args = process.argv.slice(2);
const writeBaseline = args.includes("--write-baseline");
const showGraph = args.includes("--graph");

const slash = (p) => p.split(path.sep).join("/");

/* ─── the tree ───────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((abs) => slash(path.relative(ROOT, abs)));
const known = new Set(files);

/**
 * Which layer a file belongs to.
 *
 * `app` is the composition root and may reach anything — a page whose whole job
 * is to assemble a screen from several features is not a layering violation.
 */
function layerOf(rel) {
  if (rel.startsWith("src/app/")) return { layer: "app" };
  if (rel.startsWith("src/platform/")) return { layer: "platform" };
  if (rel.startsWith("src/ui/")) return { layer: "ui" };
  const m = /^src\/modules\/([^/]+)\/([^/]+)\//.exec(rel);
  if (m) return { layer: "module", module: m[1], bucket: m[2] };
  return { layer: "root" };            // instrumentation, proxy, sentry configs
}

/* ─── the graph ──────────────────────────────────────────────────────────── */

const IMPORT = /(?:^|\n)\s*(?:import\s[\s\S]*?from\s*|import\s*|export\s[\s\S]*?from\s*)["']([^"']+)["']/g;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolve(spec, fromRel) {
  let base;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = slash(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec)));
  else return null;
  for (const ext of CANDIDATES) if (known.has(base + ext)) return base + ext;
  return null;
}

const edges = [];                       // {from, to}
for (const rel of files) {
  const text = readFileSync(path.join(ROOT, rel), "utf8");
  const seen = new Set();
  for (const re of [IMPORT, DYNAMIC]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) {
      const target = resolve(match[1], rel);
      if (target && target !== rel && !seen.has(target)) { seen.add(target); edges.push({ from: rel, to: target }); }
    }
  }
}

/* ─── the rules ──────────────────────────────────────────────────────────── */

/** Returns a violation code, or null when the edge is allowed. */
function judge(from, to) {
  const a = layerOf(from);
  const b = layerOf(to);
  if (a.layer === "app" || a.layer === "root") return null;
  if (b.layer === "root") return null;

  if (a.layer === "platform") {
    // The floor. Anything it reaches upward is a layer inversion.
    return b.layer === "platform" ? null : "platform-reaches-up";
  }

  if (a.layer === "ui") {
    if (b.layer === "ui" || b.layer === "platform") return null;
    // A primitive that knows what a fee is stops being a primitive, and drags
    // a domain module into every route that renders it.
    return "design-system-knows-a-feature";
  }

  if (a.layer === "module") {
    if (b.layer === "platform" || b.layer === "ui") return null;
    if (b.layer !== "module") return "module-reaches-app";
    if (b.module === a.module) {
      // Inside one module the only direction that matters is that pure rules
      // stay pure: domain/ must not reach the code that does IO or renders.
      if (a.bucket === "domain" && b.bucket !== "domain") return "domain-is-not-pure";
      return null;
    }
    // Across modules: domain/ and data/ are the public surface, ui/ is private.
    if (b.bucket === "ui") return "reaches-another-modules-ui";
    // Pure code may share another module's pure code — a defaulter IS a
    // student, and its types saying so is not a layering fault. What pure code
    // may not do is reach IO. The earlier, stricter rule fired on 34 edges of
    // which 32 were type sharing, and a rule that fires on the normal case is
    // a rule somebody switches off.
    if (a.bucket === "domain" && b.bucket === "data") return "domain-reaches-another-modules-data";
    return null;
  }
  return null;
}

const violations = [];
for (const { from, to } of edges) {
  const code = judge(from, to);
  if (code) violations.push({ code, from, to });
}

/* ─── module cycles ──────────────────────────────────────────────────────── */

const moduleEdges = new Map();
for (const { from, to } of edges) {
  const a = layerOf(from), b = layerOf(to);
  if (a.layer !== "module" || b.layer !== "module" || a.module === b.module) continue;
  if (!moduleEdges.has(a.module)) moduleEdges.set(a.module, new Set());
  moduleEdges.get(a.module).add(b.module);
}

/** Every 2-cycle, named `a<->b` with the pair sorted so it is stable. */
const cycles = new Set();
for (const [a, targets] of moduleEdges) {
  for (const b of targets) {
    if (moduleEdges.get(b)?.has(a)) cycles.add([a, b].sort().join(" <-> "));
  }
}

/* ─── report and gate ────────────────────────────────────────────────────── */

if (showGraph) {
  for (const [m, targets] of [...moduleEdges].sort()) {
    console.log(`${m} -> ${[...targets].sort().join(" ")}`);
  }
}

const counts = {};
for (const v of violations) counts[v.code] = (counts[v.code] ?? 0) + 1;

const current = { violations: counts, cycles: [...cycles].sort() };

if (writeBaseline) {
  const doc = {
    _comment: [
      "The layering budget. Written by scripts/check-architecture.mjs --write-baseline.",
      "",
      "Every number here is debt that already existed. The gate fails when a count",
      "goes UP or a new cycle appears; lowering a count is always allowed and is",
      "the point. Do not raise a number to make a build pass — that is the one",
      "move this file exists to prevent.",
      "",
      "The cycles are listed by name because they were a deliberate deferral, not",
      "an oversight: breaking fees <-> students means changing the direction the",
      "fee engine resolves a student's policy, which is a change to money code and",
      "wants its own diff and its own verification against TEST-2026-27.",
    ],
    generatedAt: new Date().toISOString(),
    ...current,
  };
  writeFileSync(BASELINE, JSON.stringify(doc, null, 2) + "\n", { encoding: "utf8" });
  console.log(`Baseline written to ${slash(path.relative(ROOT, BASELINE))}.`);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { violations: {}, cycles: [] };

console.log(`\nArchitecture: ${files.length} files, ${edges.length} edges, ${violations.length} violation(s), ${cycles.size} module cycle(s)`);
for (const [code, n] of Object.entries(counts).sort()) {
  const was = baseline.violations?.[code] ?? 0;
  const arrow = n > was ? `  ↑ was ${was}` : n < was ? `  ↓ was ${was}` : "";
  console.log(`  ${String(n).padStart(4)}  ${code}${arrow}`);
}
for (const c of [...cycles].sort()) {
  console.log(`  cycle  ${c}${baseline.cycles?.includes(c) ? "" : "   ← NEW"}`);
}

if (writeBaseline) process.exit(0);

const failures = [];
for (const [code, n] of Object.entries(counts)) {
  const was = baseline.violations?.[code] ?? 0;
  if (n > was) failures.push(`${code}: ${n} violation(s), budget is ${was}.`);
}
for (const c of cycles) {
  if (!baseline.cycles?.includes(c)) failures.push(`new module cycle: ${c}`);
}

if (failures.length > 0) {
  console.error("\nArchitecture check failed:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nSee quality/architecture-baseline.json. Raising a number there is not the fix.");
  const worst = violations.filter((v) => (counts[v.code] ?? 0) > (baseline.violations?.[v.code] ?? 0)).slice(0, 12);
  if (worst.length) {
    console.error("\nExamples:");
    for (const v of worst) console.error(`  ${v.code}\n    ${v.from}\n    -> ${v.to}`);
  }
  process.exit(1);
}

console.log("\nArchitecture check passed.");
