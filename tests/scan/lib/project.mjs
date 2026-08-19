/**
 * The source surface, enumerated once.
 *
 * Every check in `tests/scan/checks/` gets the same immutable view of the
 * repository: the file list, the text, and — for the checks that need to know
 * what a symbol *is* rather than what it looks like — a TypeScript program.
 *
 * Two things here are load-bearing.
 *
 * **The program is lazy.** Building a type-checked `ts.Program` over ~1,500
 * files costs 30-60s. Half the checks are line-level and never need it, and a
 * scan that always paid that cost would get run less often. `project.program()`
 * builds on first use and is shared from then on.
 *
 * **`reachableFromClient` is a closure, not a regex.** A secret is not safe
 * because the file holding it lacks `"use client"` — it is safe only if no
 * client module can reach it through any chain of imports. That distinction is
 * the whole of `scan.secret-in-client-bundle`, so it is computed properly:
 * seed with every `"use client"` module, then walk the local import graph.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * Directories the scan never descends into.
 *
 * `docs/smoke-reports` is here for the same reason the eslint config ignores
 * it: Playwright's HTML reporter ships a minified viewer bundle, and linting
 * somebody else's minified code produces hundreds of findings about nothing.
 */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  ".claude",
  ".codex",
  ".agents",
  "out",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);

const IGNORED_PREFIXES = ["docs/smoke-reports/", "scripts/_archive/", "public/"];

/** Where the scan's own findings would otherwise scan themselves. */
const SELF = "tests/scan/";

async function walk(root, relative = "") {
  const absolute = path.join(root, relative);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      found.push(...(await walk(root, rel)));
      continue;
    }
    if (!entry.isFile()) continue;
    found.push(rel);
  }
  return found;
}

function isIgnored(rel) {
  return IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

/**
 * A file, read once.
 *
 * `lines` is kept alongside `text` because nearly every check wants both — the
 * text for a multiline regex, the lines to turn an index into a line number —
 * and splitting 1,500 files repeatedly is measurable.
 */
function makeFile(root, rel) {
  const absolute = path.join(root, rel);
  const text = readFileSync(absolute, "utf8");
  const ext = path.extname(rel);
  const head = text.slice(0, 400);

  return {
    rel,
    absolute,
    ext,
    text,
    lines: text.split(/\r?\n/),
    size: text.length,
    /** A module that runs in the browser. The directive must be first. */
    isClient: /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(head),
    isServerOnly: /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(head)
      || /from\s+["']server-only["']/.test(text),
    isSource: SOURCE_EXTENSIONS.has(ext),
    isTest:
      rel.startsWith("tests/")
      || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel),
    isScript: rel.startsWith("scripts/"),
    isMigration: rel.startsWith("supabase/migrations/") && ext === ".sql",
  };
}

/** 1-based line number for a character offset. Used for every finding surface. */
export function lineAt(file, index) {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < file.text.length; cursor += 1) {
    if (file.text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/**
 * Resolve a relative or `@/`-aliased import to a repo-relative file, if it is
 * one of ours. Bare package specifiers resolve to null on purpose: the import
 * graph this feeds is about *our* modules reaching *our* secrets.
 */
function resolveImport(specifier, fromRel, byRel) {
  let base;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  else return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const candidate of candidates) if (byRel.has(candidate)) return candidate;
  return null;
}

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import\s[\s\S]*?from\s*|import\s*|export\s[\s\S]*?from\s*)["']([^"']+)["']/g;
const REQUIRE_PATTERN = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file, byRel) {
  const out = new Set();
  for (const pattern of [IMPORT_PATTERN, REQUIRE_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(file.text))) {
      const resolved = resolveImport(match[1], file.rel, byRel);
      if (resolved) out.add(resolved);
    }
  }
  return [...out];
}

export async function createProject(root = process.cwd()) {
  const all = (await walk(root)).filter((rel) => !isIgnored(rel)).sort();

  const byRel = new Map();
  const files = [];
  for (const rel of all) {
    const ext = path.extname(rel);
    if (!SOURCE_EXTENSIONS.has(ext) && ext !== ".sql" && ext !== ".json" && ext !== ".md") continue;
    let file;
    try {
      file = makeFile(root, rel);
    } catch {
      continue;
    }
    byRel.set(rel, file);
    files.push(file);
  }

  const source = files.filter((file) => file.isSource);

  // The import graph, both ways. `importers` answers "who can reach this?",
  // which is the question a secret-leak check actually asks.
  const imports = new Map();
  const importers = new Map();
  for (const file of source) {
    const list = importsOf(file, byRel);
    imports.set(file.rel, list);
    for (const target of list) {
      if (!importers.has(target)) importers.set(target, []);
      importers.get(target).push(file.rel);
    }
  }

  /**
   * Every module a browser bundle can reach.
   *
   * Seeded with the `"use client"` modules themselves and closed over imports.
   * Deliberately *not* seeded with server components: a server component that
   * imports a secret is fine, and treating it as client-reachable would drown
   * the check in false positives and get it deleted.
   */
  const clientReachable = new Set();
  const queue = source.filter((file) => file.isClient).map((file) => file.rel);
  while (queue.length > 0) {
    const rel = queue.pop();
    if (clientReachable.has(rel)) continue;
    clientReachable.add(rel);
    for (const next of imports.get(rel) ?? []) {
      if (!clientReachable.has(next)) queue.push(next);
    }
  }

  let programCache = null;

  return {
    root,
    files,
    source,
    byRel,
    imports,
    importers,
    get(rel) {
      return byRel.get(rel) ?? null;
    },
    /** App Router surfaces, pre-split because four checks want them. */
    routeHandlers: source.filter((file) => /^app\/.*\/route\.[tj]sx?$/.test(file.rel)),
    pages: source.filter((file) => /^app\/.*\/page\.tsx$/.test(file.rel)),
    serverActions: source.filter(
      (file) => file.rel.startsWith("app/") && /actions\.ts$/.test(file.rel),
    ),
    migrations: files.filter((file) => file.isMigration),
    isClientReachable(rel) {
      return clientReachable.has(rel);
    },
    clientReachable,
    /** Product code: not a test, not a script, not the scanner itself. */
    product: source.filter(
      (file) => !file.isTest && !file.isScript && !file.rel.startsWith(SELF),
    ),
    /**
     * The TypeScript program, built once, on demand.
     *
     * `noLib` keeps it cheap: the checks that use this want the AST and the
     * symbol table for *our* code, not a fully diagnosed compilation — the
     * repo already runs `tsc --noEmit` in CI and duplicating it here would be
     * both slow and somebody else's job.
     */
    async program() {
      if (programCache) return programCache;
      const ts = (await import("typescript")).default;
      const configPath = path.join(root, "tsconfig.json");
      const raw = existsSync(configPath)
        ? ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8")).config
        : { compilerOptions: {} };
      const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, root);
      const fileNames = source
        .filter((file) => file.ext === ".ts" || file.ext === ".tsx")
        .map((file) => file.absolute);
      const program = ts.createProgram(fileNames, {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
      });
      programCache = { ts, program, checker: program.getTypeChecker() };
      return programCache;
    },
  };
}

export function fileExists(root, rel) {
  const full = path.join(root, rel);
  try {
    return statSync(full).isFile();
  } catch {
    return false;
  }
}
