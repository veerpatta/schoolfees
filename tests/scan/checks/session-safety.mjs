/**
 * Which academic year a line of code is about to touch.
 *
 * `2026-27` is the live session. It holds the school's real students and their
 * real payments, and Hard Safety Rule 6 says no test data, no test payments and
 * no experimental change ever lands there — `TEST-2026-27` is where all of that
 * goes. The rule works because the label arrives as data: from the session
 * cookie, from `getActiveSessionLabel()`, from a `--session` flag a human typed.
 * Nothing decides for itself which year it is writing to.
 *
 * A hardcoded `"2026-27"` in a write path breaks exactly that. The switcher
 * still says TEST, the developer still believes they are in TEST, and the
 * insert lands on the live ledger anyway. That is the P0.
 *
 * Everything else that mentions the label is P3, and the split is not squeamish
 * — it is the difference between a value that steers a write and a value that
 * fills a default. `FALLBACK_OFFICE_SESSION_LABEL = "2026-27"` in
 * `src/platform/session/available-sessions.ts` is correct, documented, and deliberately
 * named rather than indexed out of a list; reporting it as a defect would be
 * wrong. Reporting it as *inventory* is useful, because "where is the live
 * label baked in" is a question worth being able to answer in one place.
 *
 * Three things this check refuses to accuse, each learned from a real line in
 * the tree:
 *
 *   - **The shape is not the label.** `src/modules/dashboard/ui/boards.tsx` has
 *     `months.at(-1)?.month ?? "2026-04"`, which matches `\d{4}-\d{2}` and is a
 *     month. So the year arithmetic from `parseAcademicSessionLabel` is applied
 *     too: the suffix must be the start year plus one. `2026-04` is not a
 *     session and is not reported.
 *   - **Comments are not code.** `src/platform/config/fee-rules.ts` explains the format
 *     with `2026-27` and `TEST-2026-27` in prose, and half the migrations
 *     narrate the live session in a header. Comments are masked before the
 *     search.
 *   - **A placeholder is prose that happens to sit in an attribute.**
 *     `placeholder="2026-27"` on the promotion and master-data forms tells a
 *     user what to type. It is not a value the program uses.
 *
 * Two whole populations are excluded, and they are the interesting exclusions.
 *
 * `scripts/**` is excluded from the P0. Operator scripts are supposed to be
 * able to name the live session — that is what they are for — and the way they
 * stay safe is a flag, not silence. `scripts/bulk-apply.mjs` holds
 * `const LIVE_SESSION_LABEL = "2026-27"` for the sole purpose of refusing to
 * run against it without `--live`; `scripts/verify-live-sync-health.mjs` checks
 * `["2026-27", "TEST-2026-27"]` because verifying live health is its job.
 * Flagging the guard as the hazard is the fastest way to get a P0 rule muted.
 *
 * `supabase/migrations/**` is excluded too. A migration that wrote to the live
 * session is applied history: the file is a record of a write that already
 * happened, editing it changes nothing about the database, and the review that
 * mattered happened at push time. Twenty-odd historical P0s would bury the one
 * that is about code somebody can still change.
 */

export const id = "session-safety";
export const title = "Hardcoded live academic sessions";

/** The session with real money in it. */
const LIVE_SESSION_LABEL = "2026-27";

/** Prefixes `isTestAcademicSessionLabel()` treats as safe. */
const TEST_PREFIXES = new Set(["TEST", "UAT", "DEMO"]);

/**
 * A quoted literal that is nothing but a session label.
 *
 * Anchored to the quotes on both sides so `"2026-27-backup"` and a template
 * literal with an interpolation do not match — a label built at runtime is
 * being computed, not hardcoded.
 */
const SESSION_LITERAL = /(["'`])([A-Za-z][A-Za-z0-9]*-)?(\d{4})-(\d{2})\1/g;

/**
 * Supabase mutation idioms.
 *
 * `.rpc(` is the awkward one: this app posts payments, waives late fees and
 * reverses receipts through it, but it also reads the whole dashboard through
 * it. Every read RPC in the tree is named `get_*` or `preview_*` —
 * `get_dashboard_summary`, `preview_workbook_payment_allocation` — and every
 * writer is a verb: `post_student_payment_with_adjustments`, `waive_late_fee`,
 * `undo_recent_payment`. So a literal name with a read prefix does not count.
 * An RPC name this cannot read — built from a variable — counts as a write,
 * because the safe direction for a P0 about live money is to look.
 */
const TABLE_WRITE = /\.\s*(?:insert|update|upsert|delete)\s*\(/;
const RPC_CALL = /\.\s*rpc\s*\(\s*(?:["']([a-z_]+)["'])?/g;
const READ_RPC_PREFIX = /^(?:get|preview)_/;

/** The first mutating call in `text`, or null. */
function findWriteCall(text) {
  const table = text.match(TABLE_WRITE);
  if (table) return table[0].trim();
  RPC_CALL.lastIndex = 0;
  let match;
  while ((match = RPC_CALL.exec(text))) {
    if (match[1] && READ_RPC_PREFIX.test(match[1])) continue;
    return match[0].trim();
  }
  return null;
}

/**
 * `.delete(` is also how you remove a Map key and `.update(` is a common
 * method name, so a write idiom only counts in a file that also holds a
 * Supabase client or a table reference.
 */
const TOUCHES_SUPABASE = /createClient\s*\(|createAdminClient\s*\(|\bsupabase\b|\.from\s*\(/;

/** Attributes whose string value is shown to a user, not used by the program. */
const PROSE_ATTRIBUTE = /\b(?:placeholder|title|aria-label|aria-describedby|alt|label|example|pattern)\s*=\s*\{?\s*$/;

/**
 * Blank out comments, leave string literals alone.
 *
 * A session label in a comment is documentation — `src/platform/config/fee-rules.ts`
 * and `workers/schoolfees-mcp/src/tools/orientation.mjs` both explain
 * themselves with one — and a session label in a string literal is the whole
 * finding. Offsets are preserved so a match index still maps to a line.
 *
 * Deliberately duplicated from `client-boundary.mjs` rather than shared: the
 * two checks are meant to stay independently readable and independently
 * deletable, and this is twenty-five lines.
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
    if (char === "\\") { index += 2; continue; }
    if (char === state) { state = null; index += 1; continue; }
    if (state !== "`" && char === "\n") { state = null; index += 1; continue; }
    index += 1;
  }
  return out.join("");
}

function lineOf(text, offset) {
  let line = 1;
  for (let cursor = 0; cursor < offset && cursor < text.length; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/**
 * The end-year check `parseAcademicSessionLabel()` performs.
 *
 * `2026-27` is a session; `2026-04` is April 2026 and `2026-30` is a typo.
 * Applying the same arithmetic here is what keeps a chart's month bucket out
 * of a P0 about the live ledger.
 */
function isSessionShape(startYear, endSuffix) {
  return ((Number(startYear) + 1) % 100).toString().padStart(2, "0") === endSuffix;
}

/**
 * How the label is being used, from the shape of the line around it.
 *
 * Only ever reported, never used to decide severity — the severity comes from
 * whether the file writes. It is here so nine P3 observations read as an
 * inventory with categories rather than nine identical lines.
 */
function roleOf(line, literal) {
  const before = line.slice(0, line.indexOf(literal));
  if (/(\|\||\?\?)\s*$/.test(before)) return "a fallback for a value read at runtime";
  if (/[=!]==?\s*$/.test(before)) return "a comparison against the live session";
  if (/^\s*(?:export\s+)?const\b/.test(line)) return "a named constant";
  if (/^\s*["'`]?[\w-]*["'`]?\s*[,[]?\s*$/.test(before.trim()) && /^\s*["'`]/.test(line.trim())) {
    return "an entry in a literal list";
  }
  return "a literal";
}

export async function run({ project, sink, coverage }) {
  // Product code only. Tests, scripts and the scanner itself are excluded for
  // the reasons in the header; `project.product` already draws that line, and
  // `.sql` never reaches it because migrations are not source modules.
  const considered = project.product;
  let examined = 0;

  for (const file of considered) {
    examined += 1;
    const masked = maskComments(file.text);

    const isServerAction = /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(file.text.slice(0, 400));
    const writeCall = TOUCHES_SUPABASE.test(masked) ? findWriteCall(masked) : null;
    const isWritePath = isServerAction || Boolean(writeCall);

    SESSION_LITERAL.lastIndex = 0;
    let match;
    while ((match = SESSION_LITERAL.exec(masked))) {
      const [literal, , rawPrefix, startYear, endSuffix] = match;
      if (!isSessionShape(startYear, endSuffix)) continue;

      const prefix = (rawPrefix ?? "").replace(/-$/, "").toUpperCase();
      // TEST-/UAT-/DEMO- labels are the safe ones — that is the entire point
      // of the prefix, and naming one is a developer doing the right thing.
      if (prefix && TEST_PREFIXES.has(prefix)) continue;

      const line = lineOf(masked, match.index);
      const source = file.lines[line - 1] ?? "";
      const columnBefore = source.slice(0, Math.max(0, source.indexOf(literal)));
      if (PROSE_ATTRIBUTE.test(columnBefore)) continue;

      const isLive = !prefix && `${startYear}-${endSuffix}` === LIVE_SESSION_LABEL;
      const role = roleOf(source, literal);

      if (isWritePath && !prefix) {
        const writeLine = writeCall ? lineOf(masked, masked.indexOf(writeCall)) : null;
        sink.record({
          rule: "scan.live-session-hardcoded-write",
          file: file.rel,
          line,
          title: `${file.rel} names the ${isLive ? "live" : "unprefixed"} session ${literal} in a file that writes`,
          expected:
            "A write path receives its academic session as data — from the session cookie, from "
            + "getActiveSessionLabel(), or from an argument — and never spells one out. Only "
            + "TEST-/UAT-/DEMO- prefixed labels are safe to hardcode.",
          actual:
            `${literal} appears here as ${role}, in a module that `
            + (isServerAction
              ? "is a \"use server\" action module."
              : `calls ${writeCall}${writeLine ? ` (line ${writeLine})` : ""} on a Supabase client.`),
          evidence: source.trim(),
          why:
            isLive
              ? "2026-27 holds the school's real students and real payments. A write that names it "
                + "in source ignores whichever session the operator actually selected, so a change "
                + "made and verified in TEST-2026-27 lands on the live ledger anyway. Hard Safety "
                + "Rule 6, and the reason the whole test protocol works."
              : "An unprefixed label is a production-shaped session. Hardcoding one in a write path "
                + "means the write ignores the selected session, which is the failure Hard Safety "
                + "Rule 6 exists to prevent — it is only not about live money today by luck of "
                + "which year is current.",
          fix:
            "Take the session label as a parameter, or read it with getActiveSessionLabel() / the "
            + "resolver in lib/session/. If the value genuinely must be constant, prefix it "
            + "TEST- so it can never reach live data.",
        });
        continue;
      }

      if (!isLive) continue;

      sink.record({
        rule: "scan.observation",
        file: file.rel,
        line,
        title: `${file.rel} hardcodes the live session ${LIVE_SESSION_LABEL}`,
        expected:
          "The live session label is written down in as few places as possible, so that the "
          + "next rollover is a data change rather than a code change.",
        actual:
          `${literal} appears as ${role}. Nothing in this module writes through a Supabase `
          + "client and it is not a \"use server\" action, so no ledger is at risk — this is "
          + "inventory of where the live year is baked in, not a defect.",
        evidence: source.trim(),
        why:
          "Every hardcoded copy is a place the AY 2027-28 rollover has to find. It also quietly "
          + "decides for a reader which session they are looking at: a fallback or an is-current "
          + "comparison that names 2026-27 keeps saying so after the school has moved on.",
        fix:
          "Prefer the resolved session — getActiveSessionLabel(), the switcher's value, or "
          + "FALLBACK_OFFICE_SESSION_LABEL in lib/session/available-sessions.ts, which is the one "
          + "place this label is meant to live.",
      });
    }
  }

  coverage.declare({
    check: id,
    dimension: "product source modules scanned for hardcoded academic-session labels",
    domainSize: considered.length,
    examined,
    strategy: "exhaustive",
    note:
      "Two populations are excluded from the P0 on purpose. scripts/** names the live session "
      + "legitimately and often — scripts/bulk-apply.mjs holds it precisely so it can refuse "
      + "--session 2026-27 without --live, and the verify-live-* scripts exist to check live "
      + "health — so a P0 there would fire on the guard rather than the hazard. "
      + "supabase/migrations/** is applied history: the write already happened, editing the file "
      + "does not undo it, and ~20 historical hits would bury the one finding about code that "
      + "can still be changed. Neither is reachable from project.product, so both are excluded "
      + "structurally rather than by allowlist. Within what is scanned, the check sees only "
      + "labels written as a complete quoted literal: one assembled at runtime "
      + "(`${year}-${suffix}`, a value read from a column, a label pasted into a plan file) is "
      + "invisible here and is the reason scripts/bulk-apply.mjs and the Payment Desk still need "
      + "their own runtime refusals. Placeholders and other user-facing attribute strings are "
      + "skipped, as are comments; the end-year arithmetic from parseAcademicSessionLabel() is "
      + "applied so a month bucket like \"2026-04\" is not mistaken for a session.",
  });
}
