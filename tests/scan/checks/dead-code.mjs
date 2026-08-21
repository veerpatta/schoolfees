/**
 * Exports nothing imports.
 *
 * This is the rule that will drown the scanner if it is written honestly and
 * broadly, so it is written narrowly and says exactly how narrowly. Run
 * unfiltered over this repo — every export, every kind, every directory — it
 * produces 379 findings. Almost none of them are what a reader wants: 247 are
 * prop types that exist so a component's own signature can name them, and most
 * of the rest are constants used inside their own file and exported out of
 * habit. A P2 with 379 entries is a P2 nobody opens.
 *
 * So three gates, each of which throws away real findings on purpose:
 *
 *   1. **Value exports only.** `const`, `let`, `var`, `function`, `class`, and
 *      names in an `export { … }` list. No `type`, no `interface`, no `enum`.
 *      A `type FooProps` that only the component's own signature mentions is
 *      the normal way to write a React component here, it costs nothing at
 *      runtime, and there are 247 of them.
 *
 *   2. **Nothing anywhere names it.** Not "no importer" — *no file in the
 *      repository contains the identifier at all*. `project.importers` alone
 *      reports a symbol dead when its only consumer imports it through a
 *      barrel, an alias, or a chain the resolver did not follow; requiring the
 *      name to be absent from all 1,134 source files closes that off. It also
 *      auto-excuses short and generic names, which is the right direction to
 *      be wrong in.
 *
 *   3. **Not referenced inside its own file either.** A helper used twice in
 *      its own module and exported anyway is an over-wide surface, not dead
 *      code, and every one of those is arguably fine. What is left — 59
 *      symbols — is code that runs nowhere: declared, exported, and never
 *      named again by anything.
 *
 * That last set is the interesting one, and it is not theoretical. It once
 * held `hooks/use-online-status.ts` and `components/ui/empty-state.tsx`, both
 * named in `quality/office-quality-budgets.json` as extractions made to bring
 * a file under its line budget: the extraction happened, the call site was
 * never rewired, and the budget note described a refactor that had not landed.
 * Both were deleted in the feature-first restructure, along with 57 others and
 * a superseded 1,437-line copy of the fee-setup change engine. The rule found
 * all of it; nothing else in this repository would have.
 *
 * The Next.js exclusions are not a nicety; without them the rule is wrong
 * rather than noisy. Nothing imports the default export of a `page.tsx` — the
 * framework finds it by filename — and nothing imports `revalidate`,
 * `generateMetadata` or `GET` either. Those are named below, along with the
 * config files at the repo root that a bundler loads by convention.
 *
 * Two populations are excluded wholesale. `workers/` is a separate Cloudflare
 * Worker with its own `wrangler` entry point and its own module graph, and
 * judging its exports by this repo's imports would report the whole thing.
 * `tests/` and `scripts/` are excluded as *authors* of findings but very much
 * included as *readers*: a helper whose only consumer is a test is not dead,
 * it is tested, and the coverage note carries that count separately.
 */

export const id = "dead-code";
export const title = "Exports nothing imports";

/**
 * File names Next.js resolves by convention. Their default export has no
 * importer anywhere and never will.
 *
 * Written without a wildcard inside the comment above on purpose — a literal
 * app/api/(star)(slash)route.ts closes the block comment.
 */
const CONVENTION_FILE =
  /(?:^|\/)(page|layout|route|loading|error|global-error|not-found|template|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(?:tsx?|jsx?|mjs)$/;

/**
 * Route segment config and route handler verbs. Next.js reads these by name
 * off the module; no source file mentions them.
 */
const FRAMEWORK_EXPORT = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "runtime",
  "fetchCache",
  "preferredRegion",
  "maxDuration",
  "metadata",
  "generateMetadata",
  "generateStaticParams",
  "generateViewport",
  "viewport",
  "alt",
  "size",
  "contentType",
  "experimental_ppr",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Loaded by a tool, not by an import. `proxy.ts` is Next's request hook for
 * this repo (root `proxy.ts` delegates to `lib/supabase/proxy.ts`);
 * `instrumentation*.ts` and `sentry.*.config.ts` are picked up by name.
 */
const CONFIG_FILE = new Set([
  "next.config.ts",
  "tailwind.config.ts",
  "eslint.config.mjs",
  "vitest.config.ts",
  "postcss.config.mjs",
  "playwright.config.ts",
  "proxy.ts",
  "middleware.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "sentry.client.config.ts",
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "i18n/request.ts",
]);

/** A barrel re-exports on someone else's behalf; its own names are not the API. */
const BARREL = /(?:^|\/)index\.(?:tsx?|jsx?|mjs)$/;

/** Directories whose exports this repo's import graph cannot judge. */
const FOREIGN = ["workers/", "supabase/", "tests/", "scripts/", "public/"];

/**
 * `export const NAME`, `export async function NAME`, `export default …`.
 *
 * Anchored at line start so a `//`-commented export cannot match, and run over
 * comment-blanked text so a block-commented one cannot either.
 */
const DECLARATION =
  /^[ \t]*export[ \t]+(?:(default)\b|(?:declare[ \t]+)?(?:async[ \t]+)?(const|let|var|function|class|type|interface|enum)[ \t]+\*?[ \t]*([A-Za-z_$][\w$]*))/gm;

/** `export { a, b as c }` and `export { a } from "…"`. */
const NAMED_LIST = /^[ \t]*export[ \t]*\{([^}]*)\}/gm;

/** `export * from "…"` — the names leave through somebody else's module. */
const STAR_REEXPORT = /^[ \t]*export[ \t]*\*(?:[ \t]+as[ \t]+[A-Za-z_$][\w$]*)?[ \t]+from/m;

const VALUE_KINDS = new Set(["const", "let", "var", "function", "class", "named-list"]);

/**
 * Comments blanked, line count and line lengths preserved.
 *
 * Only used for finding the `export` keyword. A commented-out export is not an
 * export, and this repo comments in code — several modules carry a worked
 * example of the very declaration they define.
 */
function blankComments(text) {
  let out = "";
  let inBlock = false;
  let inLine = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\n") {
      inLine = false;
      out += char;
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        out += "  ";
        i += 1;
        continue;
      }
      out += " ";
      continue;
    }
    if (inLine) {
      out += " ";
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      out += "  ";
      i += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      out += "  ";
      i += 1;
      continue;
    }
    out += char;
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function parseExports(file) {
  const code = blankComments(file.text);
  const found = [];

  DECLARATION.lastIndex = 0;
  let match;
  while ((match = DECLARATION.exec(code))) {
    const line = lineOf(code, match.index);
    if (match[1]) found.push({ name: "default", kind: "default", line });
    else found.push({ name: match[3], kind: match[2], line });
  }

  NAMED_LIST.lastIndex = 0;
  while ((match = NAMED_LIST.exec(code))) {
    const line = lineOf(code, match.index);
    for (const raw of match[1].split(",")) {
      const part = raw.trim();
      if (!part) continue;
      // `type Foo`, `Foo as Bar`, `Foo as default`.
      const parsed = part.match(/^(?:type[ \t]+)?([A-Za-z_$][\w$]*)(?:[ \t]+as[ \t]+([A-Za-z_$][\w$]*))?$/);
      if (!parsed) continue;
      const isType = /^type[ \t]/.test(part);
      const exported = parsed[2] ?? parsed[1];
      if (exported === "default") continue;
      found.push({ name: exported, local: parsed[1], kind: isType ? "type" : "named-list", line });
    }
  }

  return found;
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * Every identifier in every source file, mapped to the files that contain it.
 *
 * Built once — one pass over 1,134 files rather than one regex per export over
 * all of them. Comments and string literals are *not* stripped here, and that
 * is the conservative choice: a name mentioned in a doc comment counts as a
 * reference, which loses findings and never invents one.
 */
function buildIdentifierIndex(files) {
  const index = new Map();
  for (const file of files) {
    IDENTIFIER.lastIndex = 0;
    const seen = new Set();
    let hit;
    while ((hit = IDENTIFIER.exec(file.text))) seen.add(hit[0]);
    for (const name of seen) {
      let holders = index.get(name);
      if (!holders) index.set(name, (holders = new Set()));
      holders.add(file.rel);
    }
  }
  return index;
}

function countOwnReferences(file, name) {
  const pattern = new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`, "g");
  return (file.text.match(pattern) ?? []).length;
}

export async function run({ project, sink, coverage }) {
  const identifiers = buildIdentifierIndex(project.source);

  const candidates = project.source.filter(
    (file) =>
      !file.isTest
      && !file.isScript
      && !file.rel.endsWith(".d.ts")
      && !FOREIGN.some((prefix) => file.rel.startsWith(prefix))
      && !CONFIG_FILE.has(file.rel)
      && !BARREL.test(file.rel)
      && !STAR_REEXPORT.test(file.text),
  );

  /**
   * Modules some barrel re-exports wholesale. Their names leave through the
   * barrel under a specifier this check never sees at the definition site.
   */
  const starReExported = new Set();
  for (const file of project.source) {
    if (!STAR_REEXPORT.test(file.text)) continue;
    for (const target of project.imports.get(file.rel) ?? []) starReExported.add(target);
  }

  let examined = 0;
  let skippedTypes = 0;
  let testOnly = 0;
  let overExported = 0;
  let reported = 0;

  for (const file of candidates) {
    if (starReExported.has(file.rel)) continue;

    const isApp = file.rel.startsWith("app/");
    for (const symbol of parseExports(file)) {
      examined += 1;

      if (symbol.kind === "default" && CONVENTION_FILE.test(file.rel)) continue;
      if (isApp && FRAMEWORK_EXPORT.has(symbol.name)) continue;
      if (!VALUE_KINDS.has(symbol.kind)) {
        skippedTypes += 1;
        continue;
      }
      // A default export with no name of its own cannot be searched for.
      if (symbol.name === "default") continue;

      const holders = identifiers.get(symbol.name) ?? new Set();
      const elsewhere = [...holders].filter((rel) => rel !== file.rel);
      if (elsewhere.length > 0) {
        if (elsewhere.every((rel) => project.get(rel)?.isTest)) testOnly += 1;
        continue;
      }

      // Named once in its own file — the declaration — and nowhere else.
      // Named more than once means it is used internally and merely exported
      // too widely, which is a different and much weaker complaint.
      if (countOwnReferences(file, symbol.local ?? symbol.name) > 1) {
        overExported += 1;
        continue;
      }

      const importers = project.importers.get(file.rel) ?? [];
      reported += 1;
      sink.record({
        rule: "scan.dead-export",
        file: file.rel,
        line: symbol.line,
        title: `${file.rel}:${symbol.line} exports ${symbol.name}, which nothing uses`,
        expected:
          "Every exported value is either imported somewhere, resolved by Next.js by "
          + "convention, or deleted.",
        actual:
          `\`${symbol.name}\` is exported and the identifier appears in no other source file in `
          + `the repository — not in app/, components/, lib/, hooks/, tests/ or scripts/ — and `
          + `only once inside ${file.rel}, at its own declaration. `
          + (importers.length === 0
            ? "Nothing imports this module at all."
            : `${importers.length} module(s) import this file, none of them for this name.`),
        evidence: (file.lines[symbol.line - 1] ?? "").trim(),
        why:
          "Dead code is not neutral here. It compiles, it is type-checked, it is counted "
          + "against the source-line budgets in quality/office-quality-budgets.json, and the "
          + "next reader takes it for something that runs — so a half-finished extraction reads "
          + "as a finished one, and a retired module reads as a live one.",
        fix:
          "Delete it, or wire up the caller it was written for. If it is deliberately kept as "
          + "an entry point for something outside this repo's import graph, say so in a comment "
          + "beside the export — this rule reads the whole tree and will keep reporting it "
          + "otherwise.",
      });
    }
  }

  coverage.declare({
    check: id,
    dimension: "export declarations in app/, components/, lib/, hooks/ and i18n/",
    domainSize: examined,
    examined,
    strategy: "exhaustive",
    note:
      `Every export in ${candidates.length} non-test, non-script source files was parsed; `
      + `${reported} were reported. The gap between those numbers is deliberate and is where `
      + "this rule's precision comes from. "
      + `(1) ${skippedTypes} type / interface / enum exports were skipped outright: a prop type `
      + "named only by its own component's signature is the house style, it costs nothing at "
      + "runtime, and reporting it would quadruple this rule. Type-only usage of a *value* "
      + "export is still tracked, because the identifier index does not care why a name "
      + "appears. "
      + `(2) ${overExported} exports are used inside their own module and nowhere else — `
      + "exported too widely rather than dead. They are counted here and not reported; the "
      + "finding a reader can act on is \"this code runs nowhere\", not \"this could be a "
      + "module-private const\". "
      + `(3) ${testOnly} exports are referenced only by files under tests/. Those are not dead, `
      + "they are tested, and deleting them would delete a test — but a value whose only caller "
      + "is its own test is worth knowing about, so the count is stated rather than hidden. "
      + "(4) Reachability is decided by an identifier index over all source files, comments and "
      + "string literals included. A name that appears in a doc comment counts as used: false "
      + "negatives, never false positives. It also means an export whose name collides with any "
      + "common identifier is invisible to this rule. "
      + "(5) Excluded by construction: default exports of Next.js convention files, route "
      + "segment config and HTTP verb exports under app/, the root config and instrumentation "
      + "files, index barrels, any module a barrel star-re-exports, and workers/ — a separate "
      + "Cloudflare bundle whose entry point is wrangler's, not an import. "
      + "(6) Not seen at all: a symbol reached only through a runtime-built import specifier, "
      + "and dead code *inside* a live export.",
  });
}
