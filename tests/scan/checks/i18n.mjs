/**
 * Three catalogues that have to stay the same shape.
 *
 * `i18n/request.ts` picks one of `messages/en.json`, `messages/hi.json` and
 * `messages/hi-en.json` from the `vpps_locale` cookie and hands the whole
 * object to next-intl. There is no build step that compares them, no type that
 * ties a key to a catalogue, and — this is the part that matters — no runtime
 * error when a key is absent. next-intl resolves a missing key to the key's
 * own name and renders that. So the failure is not a crash in CI; it is the
 * literal string `Payments.confirmPostingTitle` on a Payment Desk button, in
 * production, in front of a parent, for whichever staff member happened to
 * pick Hindi.
 *
 * Two ways that happens, both recorded as `scan.i18n-key-missing`:
 *
 *   1. **Parity.** A key added to `en.json` and not to the other two. This is
 *      the common one, because English is where every new string is written.
 *      Reported against the catalogue that lacks the key — that is the file
 *      somebody has to edit — at the line of its nearest existing sibling, so
 *      the fix lands in the right object and not at the bottom of the file.
 *
 *   2. **Reference.** A `t("…")` call whose resolved path exists in no
 *      catalogue at all. Rarer and worse: it is broken in every language.
 *
 * The reference half is deliberately half-blind, and the coverage note says by
 * how much. A namespace is only trusted when it is written as a literal in the
 * same file — `const t = useTranslations("Defaulters")`. This repo also has a
 * widespread indirect idiom, roughly sixty sites of it, where the key travels
 * in a data structure (`t(item.i18nKey)`, `t(MODE_KEYS[mode])`,
 * `t(ACTIVITY_KIND_I18N[kind])`). Those are correct code — several of them are
 * even guarded with `t.has(...)` first — and resolving them means evaluating a
 * const map, so they are counted and skipped rather than guessed at. A guessed
 * namespace produces a finding that points at a key which does not exist,
 * which is precisely the thing this rule exists to complain about.
 *
 * What this does not do is duplicate `scripts/translate-placeholders.mjs`.
 * That script is a one-shot value-level tool: it walks the Hindi catalogues
 * replacing `[HI]` / `[HI-EN]` prefixed placeholders with real prose and
 * printing whatever it could not translate. It never compares catalogues and
 * never reads source. It owns the question "is this string translated yet";
 * this owns "is this key there at all". Both are checked against the same
 * flattened dotted paths so the two vocabularies match.
 */

export const id = "i18n";
export const title = "Locale catalogue parity and key resolution";

/**
 * The locale catalogues, read from `i18n/locales.ts` rather than globbed.
 *
 * `messages/` also holds `receipts-bilingual.json`, which is not a locale — it
 * is the fixed en+hi pair printed on every receipt regardless of the staff
 * member's UI language, and it is loaded directly, not through next-intl. A
 * glob would compare it against `en.json` and report two thousand missing
 * keys.
 */
const LOCALES_MODULE = "i18n/locales.ts";
const FALLBACK_LOCALES = ["en", "hi", "hi-en"];

function readSupportedLocales(project) {
  // Named `localesFile`, not `module`: @next/next/no-assign-module-variable
  // errors on the latter, and the scanner has no business failing the lint it
  // shares a repository with.
  const localesFile = project.get(LOCALES_MODULE);
  if (!localesFile) return { locales: FALLBACK_LOCALES, sourced: false };
  const match = localesFile.text.match(/supportedLocales\s*=\s*\[([^\]]+)\]/);
  if (!match) return { locales: FALLBACK_LOCALES, sourced: false };
  const locales = [...match[1].matchAll(/["']([^"']+)["']/g)].map((hit) => hit[1]);
  return locales.length > 0
    ? { locales, sourced: true }
    : { locales: FALLBACK_LOCALES, sourced: false };
}

/** Dotted leaf paths, in the same shape `translate-placeholders.mjs` uses. */
function flattenKeys(value, prefix, into) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenKeys(child, path, into);
    } else {
      into.set(path, child);
    }
  }
  return into;
}

/**
 * Dotted path → 1-based line, for both leaves and the objects above them.
 *
 * A line scan rather than a parser, and it is safe to be one: every catalogue
 * is written by `JSON.stringify(json, null, 2)` — `translate-placeholders.mjs`
 * ends by doing exactly that — so there is one key per line and the brace
 * depth is the nesting depth. If that ever stops being true the worst case is
 * a finding anchored to line 1, which the caller already handles.
 */
function indexKeyLines(text) {
  const lines = text.split(/\r?\n/);
  const index = new Map();
  const stack = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const key = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:/);
    if (key) {
      const name = key[1].replace(/\\(.)/g, "$1");
      const path = [...stack, name].join(".");
      index.set(path, i + 1);
      if (/:\s*\{\s*$/.test(line)) stack.push(name);
      continue;
    }
    // A closing brace on its own line ends the object the stack is inside.
    if (/^\s*\}/.test(line) && stack.length > 0) stack.pop();
  }
  return index;
}

/**
 * Where a missing key belongs.
 *
 * Not "line 1", and not the parent object's line either. The catalogues are
 * two thousand lines each and a finding that points at the top of the file
 * makes the reader do the search again. The donor catalogue — whichever locale
 * does have the key — already knows the answer: the key that precedes this one
 * in *its* ordering is where the missing one goes. So walk backwards through
 * the donor's key order until hitting a path the target catalogue also has,
 * and anchor there.
 *
 * Walking forwards is the fallback for a key that is first in its object, and
 * line 1 the fallback for a catalogue with nothing in common at all — which
 * would be a different and much louder problem.
 */
function anchorLine(missingPath, donorOrder, targetLines) {
  const position = donorOrder.indexOf(missingPath);
  if (position === -1) return 1;
  for (let i = position - 1; i >= 0; i -= 1) {
    const line = targetLines.get(donorOrder[i]);
    if (line) return line;
  }
  for (let i = position + 1; i < donorOrder.length; i += 1) {
    const line = targetLines.get(donorOrder[i]);
    if (line) return line;
  }
  return 1;
}

/* ─── the reference half ─────────────────────────────────────────────────── */

/**
 * `const t = useTranslations("Ns")` / `const t = await getTranslations("Ns")`,
 * with the optional type argument the repo writes on a few of them
 * (`getTranslations<"AdminTools">`).
 */
const TRANSLATOR_DECLARATION =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*(?:<[^>()]*>)?\s*\(\s*(?:["']([^"']+)["'])?\s*\)/g;

/** A call on a known translator: `t(`, `t.rich(`, `t.raw(`, `t.markup(`. */
const TRANSLATOR_CALL = /\b([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\s*\(/g;
const KEY_BEARING_METHODS = new Set(["rich", "raw", "markup"]);

/**
 * The key argument, when it is one this check is willing to believe.
 *
 * Accepts a plain string literal and the ternary-of-two-literals form the repo
 * uses in a handful of places (`t(settled ? "a" : "b")`). Everything else —
 * a template literal, an identifier, a member expression — returns null and is
 * counted as unresolved. Deliberately does not follow an identifier to its
 * declaration: `t(MODE_KEYS[mode])` needs the const map evaluated, and a
 * half-evaluated map is how a rule starts inventing keys.
 */
function keysFromArgument(text, openIndex) {
  let cursor = openIndex + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

  const literal = () => {
    const quote = text[cursor];
    if (quote !== '"' && quote !== "'") return null;
    let end = cursor + 1;
    while (end < text.length) {
      if (text[end] === "\\") { end += 2; continue; }
      if (text[end] === quote) break;
      end += 1;
    }
    if (end >= text.length) return null;
    const value = text.slice(cursor + 1, end);
    cursor = end + 1;
    return value;
  };

  const first = literal();
  if (first !== null) {
    // `t("a")` — and nothing that follows can turn it into a different key.
    return [first];
  }

  // `t(cond ? "a" : "b")` — read the condition, then both branches.
  const question = text.indexOf("?", cursor);
  const closing = text.indexOf(")", cursor);
  if (question === -1 || (closing !== -1 && closing < question)) return null;
  cursor = question + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  const consequent = literal();
  if (consequent === null) return null;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] !== ":") return null;
  cursor += 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  const alternate = literal();
  if (alternate === null) return null;
  return [consequent, alternate];
}

function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

export async function run({ project, sink, coverage }) {
  const { locales, sourced } = readSupportedLocales(project);

  /* ─── parity ───────────────────────────────────────────────────────────── */

  const catalogues = new Map();
  const unreadable = [];
  for (const locale of locales) {
    const rel = `messages/${locale}.json`;
    const file = project.get(rel);
    if (!file) {
      unreadable.push(`${rel} (absent)`);
      continue;
    }
    try {
      const lines = indexKeyLines(file.text);
      catalogues.set(locale, {
        rel,
        keys: flattenKeys(JSON.parse(file.text), "", new Map()),
        lines,
        // Source order, objects and leaves alike — the insertion point a
        // sibling catalogue should copy.
        order: [...lines.keys()],
        file,
      });
    } catch (error) {
      unreadable.push(`${rel} (${String(error).slice(0, 80)})`);
    }
  }

  const union = new Set();
  for (const catalogue of catalogues.values()) {
    for (const key of catalogue.keys.keys()) union.add(key);
  }

  // Only meaningful with something to compare against: a single readable
  // catalogue would report every key in it as present everywhere, which is
  // true and useless.
  if (catalogues.size > 1) {
    for (const [locale, catalogue] of catalogues) {
      const others = [...catalogues.keys()].filter((name) => name !== locale);
      for (const key of union) {
        if (catalogue.keys.has(key)) continue;
        const present = others.filter((name) => catalogues.get(name).keys.get(key) !== undefined);
        if (present.length === 0) continue;
        const donor = catalogues.get(present[0]);
        const line = anchorLine(key, donor.order, catalogue.lines);
        const sample = donor.keys.get(key);
        sink.record({
          rule: "scan.i18n-key-missing",
          file: catalogue.rel,
          line,
          title: `${catalogue.rel} is missing "${key}", which ${present.join(" and ")} define`,
          expected:
            `All ${locales.length} catalogues under messages/ carry the same dotted key set. `
            + "i18n/request.ts loads exactly one of them per request and next-intl has no "
            + "fallback chain between them.",
          actual:
            `"${key}" exists in ${present.join(", ")} but not in ${locale}. `
            + `${present[0]} renders ${JSON.stringify(String(sample).slice(0, 80))}; `
            + `${locale} renders the literal string "${key}".`,
          evidence: (catalogue.file.lines[line - 1] ?? "").trim(),
          why:
            "A missing key is not an error in next-intl — it resolves to the key's own name and "
            + "renders it. Nothing fails in CI, nothing appears in Sentry, and the first person "
            + "to see it is a staff member who switched the app to Hindi, on whatever screen "
            + "this key is on.",
          fix:
            `Add "${key}" to ${catalogue.rel} beside its siblings. If the string is genuinely `
            + "not translated yet, add it with the English text and let "
            + "scripts/translate-placeholders.mjs carry it — an untranslated string is readable, "
            + "a raw key is not.",
        });
      }
    }
  }

  /* ─── reference ────────────────────────────────────────────────────────── */

  let callSites = 0;
  let unresolvedCalls = 0;
  let filesWithTranslator = 0;
  let filesCallingWithoutNamespace = 0;

  const scanned = project.product.filter((file) => file.ext === ".ts" || file.ext === ".tsx");

  for (const file of scanned) {
    const namespaces = new Map();
    TRANSLATOR_DECLARATION.lastIndex = 0;
    let declaration;
    while ((declaration = TRANSLATOR_DECLARATION.exec(file.text))) {
      // `useTranslations()` with no argument is root-scoped: the key written
      // at the call site is already the full path.
      namespaces.set(declaration[1], declaration[2] ?? "");
    }

    if (namespaces.size === 0) {
      if (/\bt\s*\(\s*["']/.test(file.text)) filesCallingWithoutNamespace += 1;
      continue;
    }
    filesWithTranslator += 1;

    TRANSLATOR_CALL.lastIndex = 0;
    let call;
    while ((call = TRANSLATOR_CALL.exec(file.text))) {
      const [, name, method] = call;
      if (!namespaces.has(name)) continue;
      // `t.has(key)` is the guard, not the read. Several nav components use it
      // precisely so a missing key degrades to a hard-coded label.
      if (method && !KEY_BEARING_METHODS.has(method)) continue;

      callSites += 1;
      const openIndex = call.index + call[0].length - 1;
      const keys = keysFromArgument(file.text, openIndex);
      if (!keys) {
        unresolvedCalls += 1;
        continue;
      }

      const namespace = namespaces.get(name);
      for (const key of keys) {
        const full = namespace ? `${namespace}.${key}` : key;
        if (union.has(full)) continue;
        const line = lineOf(file.text, call.index);
        sink.record({
          rule: "scan.i18n-key-missing",
          file: file.rel,
          line,
          title: `${file.rel}:${line} reads "${full}", which no catalogue defines`,
          expected:
            "Every key a t() call names resolves in every catalogue under messages/.",
          actual:
            `\`${name}\` is bound to the "${namespace || "(root)"}" namespace in this file, so `
            + `this call resolves to "${full}". None of ${[...catalogues.keys()].join(", ")} `
            + "has that key.",
          evidence: (file.lines[line - 1] ?? "").trim(),
          why:
            "Unlike a parity gap, this one is broken in every language at once — English "
            + "included. next-intl renders the key name, so the screen shows "
            + `"${full}" where the label should be.`,
          fix:
            `Add "${full}" to each catalogue, or correct the key at the call site if the `
            + "namespace prefix is what drifted.",
        });
      }
    }
  }

  const keySlots = union.size * Math.max(catalogues.size, 1);

  coverage.declare({
    check: id,
    dimension: "locale catalogue keys (union x locale) and t() call sites in product source",
    domainSize: keySlots + callSites,
    examined: keySlots + callSites,
    strategy: "exhaustive",
    note:
      `Locales come from supportedLocales in ${LOCALES_MODULE} `
      + `(${sourced ? `read: ${locales.join(", ")}` : `unreadable, fell back to ${FALLBACK_LOCALES.join(", ")}`}), `
      + "not from a glob over messages/ — messages/receipts-bilingual.json is a fixed en+hi pair "
      + "printed on receipts, is loaded without next-intl, and comparing it against en.json would "
      + `report every key in it. ${unreadable.length > 0 ? `UNREADABLE: ${unreadable.join("; ")}. ` : ""}`
      + `Parity is exhaustive over all ${union.size} keys in all ${catalogues.size} catalogues. `
      + `The reference half is not: it read ${scanned.length} product .ts/.tsx files, resolved a `
      + `namespace in ${filesWithTranslator} of them, and inspected ${callSites} calls on those `
      + `translators — of which ${unresolvedCalls} could not be resolved and were skipped rather `
      + "than guessed. Those are the indirect idiom this repo uses heavily: t(item.i18nKey), "
      + "t(MODE_KEYS[mode]), t(ACTIVITY_KIND_I18N[kind]), t(`${key}Desc`) — the key travels in a "
      + "const map or a template, several of them are already guarded by t.has(...), and "
      + "resolving them means evaluating the map. A namespace is trusted only when it is a "
      + "string literal in the same file, so a translator received as a prop (the "
      + `AdminToolsTranslator idiom) is invisible; ${filesCallingWithoutNamespace} file(s) call `
      + "t(\"…\") with no local binding and were skipped entirely. Value-level problems are out "
      + "of scope by design and belong to scripts/translate-placeholders.mjs: a key present but "
      + "empty, a leftover [HI] marker, a Hindi string still identical to the English one, and "
      + "ICU argument drift between catalogues are none of them reported here.",
  });
}
