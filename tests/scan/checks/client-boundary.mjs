/**
 * What ships to the browser.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS completely. A copy of it in a
 * JavaScript bundle is not a leak of one page's data — it is a leak of the
 * whole database, to anyone who opens devtools. So the three rules here are
 * about one question, asked three ways: can a browser bundle reach this?
 *
 * `project.clientReachable` answers a close cousin of that question, and the
 * difference is the whole difficulty of this check. It closes over *every*
 * import edge, and two kinds of edge do not put code in a bundle:
 *
 *   1. **`import type`.** `src/components/staff/password-change-form.tsx` does
 *      `import type { StaffFormActionState } from "@/lib/staff-management/data"`.
 *      TypeScript erases that. The raw closure follows it, walks into
 *      `src/lib/staff-management/data.ts`, and lands on `createAdminClient()`.
 *   2. **The `"use server"` boundary.** A client component that imports
 *      `src/app/protected/payments/actions.ts` does not get that module's code; it
 *      gets a server reference that Next.js turns into a POST. Following that
 *      edge drags `src/lib/fees/policy.ts`, `src/lib/students/data.ts` and most of the
 *      data layer into the "client" set.
 *
 * Run raw, `scan.service-role-client-reachable` reports nine modules, all of
 * them correct code, and a P0 rule with nine false positives is a P0 rule
 * somebody mutes. So this check builds its own closure over *value* edges
 * only, stopping at every `"use server"` module — 321 modules instead of 407 —
 * and reports nothing today. That is the intended reading: the boundary holds.
 * The rule exists for the commit that breaks it.
 *
 * Deliberately not narrowed any further. The closure still follows
 * `import()`, `require()` and side-effect imports, because all three do ship;
 * and it still seeds from every `"use client"` module rather than from route
 * entry points, because a component is client code whether or not a page
 * currently renders it.
 *
 * What it cannot see: an edge built at runtime (a specifier assembled from a
 * variable), and a secret read through an indirection this check does not
 * name — `process.env[someKey]`. Both are stated in the coverage note.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export const id = "client-boundary";
export const title = "Server secrets and the client bundle";

/**
 * The definition site, which is not the leak.
 *
 * `src/platform/supabase/admin.ts` exists to hold the service-role key; naming
 * `SUPABASE_SERVICE_ROLE_KEY` is its entire job. If it ever became
 * client-reachable that would be caught — by `scan.server-client-boundary`,
 * because it carries `import "server-only"`, and reported against the module
 * that imported it, which is the file somebody would have to change.
 */
const SERVICE_ROLE_DEFINITION = "src/platform/supabase/admin.ts";

/**
 * Modules that are server-side by construction, whether or not they say so.
 *
 * `src/platform/supabase/server.ts` reads `next/headers`; `src/platform/supabase/session.ts` and
 * `src/platform/supabase/admin.ts` both carry `import "server-only"` and are listed
 * anyway so the rule keeps working if that import is ever dropped.
 */
const NAMED_SERVER_MODULES = new Set([
  "src/platform/supabase/server.ts",
  "src/platform/supabase/session.ts",
  "src/platform/supabase/admin.ts",
]);

/**
 * Secrets that code uses and `.env.example` never declares.
 *
 * `CRON_SECRET` guards four route handlers and appears nowhere in
 * `.env.example`; `POSTGRES_URL` arrives from the Vercel/Supabase integration
 * rather than from a file anybody edits. Enumerating from `.env.example` alone
 * would leave both unwatched.
 */
const SECRET_FLOOR = ["CRON_SECRET", "POSTGRES_URL", "DATABASE_URL"];

const MODULE_EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

/**
 * Blank out comments, leave string literals alone.
 *
 * Both halves matter. A secret named in a warning comment — "never expose
 * SUPABASE_SERVICE_ROLE_KEY in browser code" — is the opposite of a finding,
 * and `getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY")` is a string literal and
 * is exactly the finding. A regex that strips both, or neither, gets one of
 * those two wrong.
 *
 * Offsets are preserved (comment bytes become spaces, newlines survive) so a
 * match index in the masked text is still a line number in the original.
 */
function maskComments(text) {
  const out = text.split("");
  let state = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (state === null) {
      if (char === "/" && next === "/") { out[index] = " "; out[index + 1] = " "; state = "line"; index += 2; continue; }
      if (char === "/" && next === "*") { out[index] = " "; out[index + 1] = " "; state = "block"; index += 2; continue; }
      if (char === '"' || char === "'" || char === "`") { state = char; index += 1; continue; }
      index += 1;
      continue;
    }
    if (state === "line") {
      if (char === "\n") { state = null; index += 1; continue; }
      out[index] = " "; index += 1; continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { out[index] = " "; out[index + 1] = " "; state = null; index += 2; continue; }
      if (char !== "\n") out[index] = " ";
      index += 1;
      continue;
    }
    // Inside a string literal.
    if (char === "\\") { index += 2; continue; }
    if (char === state) { state = null; index += 1; continue; }
    // An unterminated quote is almost always an apostrophe in JSX text.
    // Bounding it to the line keeps one <p>don't</p> from swallowing a file.
    if (state !== "`" && char === "\n") { state = null; index += 1; continue; }
    index += 1;
  }
  return out.join("");
}

function lineOf(file, offset) {
  let line = 1;
  for (let cursor = 0; cursor < offset && cursor < file.text.length; cursor += 1) {
    if (file.text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/** First occurrence of `pattern` outside a comment, as `{ line, evidence }`. */
function locate(file, masked, pattern) {
  const search = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const match = search.exec(masked);
  if (!match) return null;
  const line = lineOf(file, match.index);
  return { line, evidence: (file.lines[line - 1] ?? "").trim() };
}

function resolveSpecifier(specifier, fromRel, byRel) {
  let base;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  } else return null;
  for (const suffix of MODULE_EXTENSIONS) {
    if (byRel.has(`${base}${suffix}`)) return `${base}${suffix}`;
  }
  return null;
}

const STATIC_IMPORT = /(?:^|\n)[ \t]*(import|export)\b([^"';]*?)from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_CALL = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

/**
 * True when an import contributes nothing to the emitted JavaScript.
 *
 * Both spellings count: `import type { A } from …` and the per-specifier
 * `import { type A, type B } from …`. A clause mixing the two — `import { A,
 * type B }` — still emits, so it is a value edge.
 */
function isTypeOnly(clause) {
  const trimmed = clause.trim();
  if (/^type\b/.test(trimmed)) return true;
  const braced = trimmed.match(/^\{([\s\S]*)\}$/);
  if (!braced) return false;
  const specifiers = braced[1].split(",").map((part) => part.trim()).filter(Boolean);
  return specifiers.length > 0 && specifiers.every((part) => /^type\s/.test(part));
}

/** Value edges out of one module, each with the offset of its import statement. */
function valueEdges(file, masked, byRel) {
  const edges = new Map();
  const add = (specifier, offset) => {
    const resolved = resolveSpecifier(specifier, file.rel, byRel);
    if (resolved && !edges.has(resolved)) edges.set(resolved, offset);
  };
  for (const pattern of [STATIC_IMPORT, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT, REQUIRE_CALL]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(masked))) {
      if (pattern === STATIC_IMPORT) {
        if (isTypeOnly(match[2])) continue;
        add(match[3], match.index);
        continue;
      }
      add(match[1], match.index);
    }
  }
  return edges;
}

function hasServerOnlyImport(text) {
  return /(?:^|\n)\s*import\s+(?:["']server-only["']|[^;\n]*?\bfrom\s*["']server-only["'])/.test(text);
}

function hasUseServerDirective(text) {
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(text.slice(0, 400));
}

/**
 * Every secret name worth watching.
 *
 * Read out of `.env.example` rather than hardcoded, so a new secret is watched
 * the moment somebody documents it. Two filters:
 *
 *   - `NEXT_PUBLIC_*` is public by definition — that prefix is the mechanism
 *     for putting a value in the bundle on purpose.
 *   - A name with a value committed next to it in `.env.example` is not a
 *     secret. `APP_MODE=production`, `OPENAI_MODEL=gpt-5.5` and
 *     `SCHOOLFEES_MCP_HOST=127.0.0.1` are server-side configuration, and
 *     firing P0 on one of them would be crying wolf about a value already in
 *     git. A blank right-hand side is the file saying "this one is real".
 */
function secretNamesFrom(root) {
  let text = "";
  try {
    text = readFileSync(path.join(root, ".env.example"), "utf8");
  } catch {
    return { names: [...SECRET_FLOOR], sourced: false };
  }
  const names = new Set(SECRET_FLOOR);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (match[1].startsWith("NEXT_PUBLIC_")) continue;
    if (match[2].trim() !== "") continue;
    names.add(match[1]);
  }
  return { names: [...names], sourced: true };
}

export async function run({ project, sink, coverage }) {
  const considered = project.source.filter(
    (file) => !file.isTest && !file.isScript && !file.rel.startsWith("tests/scan/"),
  );

  const masked = new Map();
  for (const file of project.source) masked.set(file.rel, maskComments(file.text));

  const edges = new Map();
  for (const file of project.source) {
    edges.set(file.rel, valueEdges(file, masked.get(file.rel), project.byRel));
  }

  const serverOnly = new Set(NAMED_SERVER_MODULES);
  const useServer = new Set();
  for (const file of project.source) {
    if (hasServerOnlyImport(file.text)) serverOnly.add(file.rel);
    if (hasUseServerDirective(file.text)) useServer.add(file.rel);
  }

  // The bundle graph: seeded with every "use client" module, closed over value
  // edges, stopping at "use server". `parent` is kept so a finding can print
  // the chain — an accusation with no path is one nobody can act on.
  const parent = new Map();
  const bundle = new Set();
  const queue = [];
  for (const file of project.source) {
    if (!file.isClient) continue;
    if (file.isTest || file.rel.startsWith("tests/scan/")) continue;
    bundle.add(file.rel);
    parent.set(file.rel, null);
    queue.push(file.rel);
  }
  while (queue.length > 0) {
    const rel = queue.shift();
    for (const target of (edges.get(rel) ?? new Map()).keys()) {
      if (useServer.has(target)) continue;
      if (bundle.has(target)) continue;
      bundle.add(target);
      parent.set(target, rel);
      queue.push(target);
    }
  }

  const chainTo = (rel) => {
    const out = [];
    let cursor = rel;
    while (cursor !== null && cursor !== undefined) {
      out.push(cursor);
      cursor = parent.get(cursor);
    }
    return out.reverse().join(" -> ");
  };

  const { names: secretNames, sourced } = secretNamesFrom(project.root);
  // A file reported for the service-role client is not reported a second time
  // for naming the same key — and `src/platform/supabase/admin.ts` is never reported for
  // naming it at all. If that module is ever in the bundle, the finding that
  // matters is against whoever imported it, which is the file somebody edits.
  const alreadyReported = new Set([`${SERVICE_ROLE_DEFINITION}|SUPABASE_SERVICE_ROLE_KEY`]);

  for (const file of considered) {
    const text = masked.get(file.rel);

    // ---- scan.service-role-client-reachable --------------------------------
    if (file.rel !== SERVICE_ROLE_DEFINITION && bundle.has(file.rel)) {
      const spot =
        locate(file, text, /\bcreateAdminClient\s*\(/)
        ?? locate(file, text, /\bSUPABASE_SERVICE_ROLE_KEY\b/);
      if (spot) {
        alreadyReported.add(`${file.rel}|SUPABASE_SERVICE_ROLE_KEY`);
        sink.record({
          rule: "scan.service-role-client-reachable",
          file: file.rel,
          line: spot.line,
          title: `${file.rel} uses the service-role client and is reachable from a client component`,
          expected:
            "The service-role Supabase client is reachable only from server code: Server "
            + "Components, Route Handlers, Server Actions and scripts.",
          actual:
            `Value-import chain from a "use client" module: ${chainTo(file.rel)}. No hop in that `
            + "chain is type-only and none crosses a \"use server\" boundary, so this module's code "
            + "is compiled into the browser bundle along with its service-role usage.",
          evidence: spot.evidence,
          why:
            "The service-role key bypasses Row Level Security entirely. In a browser bundle it is "
            + "not one page's data that leaks but every student, payment and receipt in the "
            + "database, readable and writable by anyone who opens devtools. Hard Safety Rule 2.",
          fix:
            "Break the chain: move the server-side work behind a \"use server\" action or a Route "
            + "Handler and have the client component call that instead, or make the offending "
            + "import type-only if the client only needed the types.",
        });
      }
    }

    // ---- scan.secret-in-client-bundle --------------------------------------
    if (bundle.has(file.rel)) {
      for (const name of secretNames) {
        if (alreadyReported.has(`${file.rel}|${name}`)) continue;
        const spot = locate(file, text, new RegExp(`\\b${name}\\b`));
        if (!spot) continue;
        sink.record({
          rule: "scan.secret-in-client-bundle",
          file: file.rel,
          line: spot.line,
          title: `${file.rel} names the server-only secret ${name} and ships to the browser`,
          expected:
            "Only NEXT_PUBLIC_* values appear in client-reachable modules. Every other name in "
            + ".env.example is read on the server and never named where a bundle can see it.",
          actual:
            `${name} is referenced outside a comment here, and this module is reachable from a `
            + `"use client" module through value imports: ${chainTo(file.rel)}.`,
          evidence: spot.evidence,
          why:
            "Next.js inlines env references it can see at build time, and the surrounding source "
            + "is emitted verbatim either way. Naming the variable in bundled code is how a value "
            + "meant for the server ends up readable in devtools.",
          fix:
            "Read the secret in a Server Component, Route Handler or \"use server\" action and pass "
            + "only the derived result to the client. If the value really is safe in a browser, "
            + "rename it with the NEXT_PUBLIC_ prefix so the intent is declared.",
        });
      }
    }

    // ---- scan.server-client-boundary ---------------------------------------
    if (!bundle.has(file.rel)) continue;
    for (const [target, offset] of edges.get(file.rel) ?? new Map()) {
      if (!serverOnly.has(target)) continue;
      if (target === file.rel) continue;
      const line = lineOf(file, offset + 1);
      sink.record({
        rule: "scan.server-client-boundary",
        file: file.rel,
        line,
        title: `${file.rel} value-imports the server-only module ${target}`,
        expected:
          "A module the browser bundle can reach imports nothing marked server-only, and nothing "
          + "from lib/supabase/{server,session,admin}.",
        actual:
          `Imports ${target}, which is server-only, and is itself reachable from a "use client" `
          + `module: ${chainTo(file.rel)}.`,
        evidence: (file.lines[line - 1] ?? "").trim(),
        why:
          "The server-only package throws at build time when it lands in a client bundle. Today "
          + "this compiles because nothing renders the chain; it is a build failure waiting for "
          + "the first route that does, and until then it hides whatever the server-only module "
          + "was protecting.",
        fix:
          "Make the import type-only if only types were wanted, or move the call behind a "
          + "\"use server\" action so the client gets a server reference instead of the module.",
      });
    }
  }

  coverage.declare({
    check: id,
    dimension: "source modules crossed against the client bundle import graph",
    domainSize: considered.length,
    examined: considered.length,
    strategy: "exhaustive",
    note:
      "Reachability is recomputed here rather than taken from project.clientReachable, which "
      + "closes over type-only imports and across the \"use server\" boundary and would report "
      + "nine correct modules as service-role leaks. The narrower closure follows value imports "
      + "only — including import(), require() and side-effect imports — and stops at every "
      + "\"use server\" module, because a client component importing a server action gets a "
      + "server reference and not that module's code. Consequences of the narrowing, both "
      + "unseen: an import specifier built at runtime, and a secret read as process.env[name] "
      + "through a variable. Secret names come from .env.example, minus NEXT_PUBLIC_* and minus "
      + "any name with a value already committed beside it — a value in git is not a secret — "
      + `plus a floor of ${SECRET_FLOOR.join(", ")}, which code uses and that file never declares. `
      + `.env.example was ${sourced ? "read" : "MISSING, so only the floor list was watched"}.`,
  });
}
