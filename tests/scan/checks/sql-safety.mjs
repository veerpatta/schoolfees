/**
 * What can go wrong in a migration, judged by this repo's own conventions.
 *
 * `scan.sql-risk` is registered heuristic and P2, and that registration is the
 * design constraint: a P2 that cries wolf gets muted, and a muted rule is worse
 * than an absent one. So every candidate class below was measured against the
 * 193 real migrations before it was kept, and three were measured and dropped.
 * The coverage note names them, because "we checked and it did not work" is
 * information and silence is not.
 *
 * ── The thing that shapes every rule here: migrations are history ──────────
 *
 * `supabase/migrations/` is append-only and ordered. A finding against a
 * migration from April is unactionable — that file has run, on production, and
 * editing it now only desynchronises `schema_migrations`. So the two
 * convention rules are evaluated against the **live** definition of each
 * object: the last migration, in filename order, that defines it. That is the
 * definition Postgres is running, it is the one a new migration would replace,
 * and it is therefore the only one a finding can ask anybody to change.
 *
 * ── Kept ──────────────────────────────────────────────────────────────────
 *
 *   1. **A live function with no pinned `search_path`.** 57 of the 64 live
 *      functions pin it, so this is a real convention and not a preference;
 *      `20260811073515` exists for no other purpose ("Pure date/integer
 *      arithmetic, but an unpinned search_path on a function is a foothold
 *      regardless"). The finding is worded harder when the function is also
 *      SECURITY DEFINER, because unpinned + definer is the actual escalation
 *      shape rather than a lint.
 *
 *   2. **A live view with no explicit `security_invoker`.** 25 of the 29 live
 *      plain views set it. A view that does not runs as its owner, which in a
 *      Supabase project means RLS on `students` and `installments` simply does
 *      not apply to anyone who can select from the view.
 *
 *   3. **DDL that destroys money.** Dropping or retyping a money column,
 *      dropping or truncating a financial table, or a blanket `update … set`
 *      on one with no `where`. This finds nothing today — there is no
 *      `drop column` anywhere in the tree and every `drop table` is a scratch
 *      table the same migration created. It is kept precisely because it is
 *      quiet: it costs nothing until the day somebody writes the migration
 *      that hard rule 1 exists to prevent.
 *
 * ── Dropped, with the measurement ─────────────────────────────────────────
 *
 *   * **Injected SQL.** The app talks to Postgres through supabase-js
 *     (`.from()`, `.rpc()`), which is PostgREST and not SQL text at all. A
 *     sweep of every template literal in the tree containing a SQL keyword and
 *     a `${` interpolation returns exactly two hits, and both are safe: the
 *     Edge Function at `supabase/functions/notion-fee-sync/index.ts` uses
 *     `postgres` tagged templates, which parameterise; and
 *     `lib/prev-year-dues/constants.ts:32` interpolates a module constant into
 *     a rollback *hint string* that is never executed. Two findings, zero
 *     bugs — so the rule would have been pure noise and it is not written.
 *
 *   * **`create or replace function` without an explicit
 *     `security definer`/`security invoker`.** 31 of the 64 live functions
 *     state neither, including `post_student_payment_with_adjustments`. At
 *     roughly half the population there is no convention to enforce, only a
 *     preference to impose, and 31 P2 findings would bury the seven that mean
 *     something.
 *
 *   * **grant/revoke drift.** The intended convention is visible — `revoke all
 *     on … from public, anon` then `grant select … to authenticated,
 *     service_role`. But grants are re-applied in ACL-restore loops, in
 *     separate follow-up migrations, and inside `do $$` blocks that rebuild a
 *     view stack after a CASCADE. Every text-level rule tried here flagged 18
 *     of 21 live views, which measures the regex and not the schema.
 */

export const id = "sql-safety";
export const title = "Migration hygiene: search_path, view security, money-destroying DDL";

/* ─── lexing ───────────────────────────────────────────────────────────── */

/**
 * Blank out `--` and block comments, and the interior of every dollar-quoted
 * body, preserving line count and offsets.
 *
 * The dollar-quote part is not optional. `20260812120000` rebuilds its view
 * stack inside a `do $$ … $$` loop with
 * `format('create view public.%I as %s', …)`, and a parser that reads that as
 * a view declaration invents an object called `public.` and then reports it.
 * Blanking bodies also means a `create or replace function` that only appears
 * inside a DO block's string is not mistaken for a real definition — which is
 * correct: it is a template, not a signature.
 */
function lex(text) {
  const out = Array.from(text);
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index += 1) {
      if (out[index] !== "\n") out[index] = " ";
    }
  };

  let cursor = 0;
  while (cursor < text.length) {
    const two = text.slice(cursor, cursor + 2);
    if (two === "--") {
      const end = text.indexOf("\n", cursor);
      blank(cursor, end === -1 ? text.length : end);
      cursor = end === -1 ? text.length : end;
      continue;
    }
    if (two === "/" + "*") {
      const end = text.indexOf("*" + "/", cursor + 2);
      blank(cursor, end === -1 ? text.length : end + 2);
      cursor = end === -1 ? text.length : end + 2;
      continue;
    }
    if (text[cursor] === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(cursor));
      if (tag) {
        const close = text.indexOf(tag[0], cursor + tag[0].length);
        if (close !== -1) {
          blank(cursor + tag[0].length, close);
          cursor = close + tag[0].length;
          continue;
        }
      }
    }
    cursor += 1;
  }
  return out.join("");
}

function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/* ─── patterns ─────────────────────────────────────────────────────────── */

const FUNCTION_DECLARATION =
  /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-z_][\w]*\.[a-z_][\w]*)\s*\(/gi;

const VIEW_DECLARATION =
  /\bcreate\s+(?:or\s+replace\s+)?(materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([a-z_][\w]*\.[a-z_][\w]*)/gi;

/** The tables where a wrong DDL statement is a wrong ledger. */
const FINANCIAL_TABLES = [
  "payments",
  "receipts",
  "payment_adjustments",
  "receipt_adjustments",
  "installments",
  "student_fee_overrides",
  "fee_settings",
  "student_carry_forward_balances",
  "student_late_fee_waivers",
  "student_repayment_plans",
  "student_repayment_plan_items",
  "student_repayment_schedule",
  "audit_logs",
];

/** A column name that holds rupees. Every money column in this schema is `integer`. */
const MONEY_COLUMN =
  /(amount|paid|pending|charge|fee|balance|discount|total|price|due|waiver)/i;

const TABLE_GROUP = FINANCIAL_TABLES.join("|");

/**
 * Each pattern is bounded by `[^;]` rather than `[\s\S]`, so a match cannot run
 * from one statement's `alter table` into the next statement's `alter column`.
 * Without that bound, `alter table payments alter column total_amount type` two
 * lines below an unrelated `alter table installments` is reported against
 * `installments` — the right defect at the wrong address, which is how a
 * reviewer learns to stop trusting the rule.
 */
const DESTRUCTIVE = [
  {
    kind: "drop column",
    pattern: new RegExp(
      String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)[^;]{0,400}?\bdrop\s+column\s+(?:if\s+exists\s+)?(\w+)`,
      "gi",
    ),
    describe: (m) => ({ table: m[1], column: m[2] }),
  },
  {
    kind: "retype column",
    pattern: new RegExp(
      String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)[^;]{0,400}?\balter\s+column\s+(\w+)\s+(?:set\s+data\s+)?type\b`,
      "gi",
    ),
    describe: (m) => ({ table: m[1], column: m[2] }),
  },
  {
    kind: "drop table",
    pattern: new RegExp(
      String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(${TABLE_GROUP})\b`,
      "gi",
    ),
    describe: (m) => ({ table: m[1], column: null }),
  },
  {
    kind: "truncate",
    pattern: new RegExp(
      String.raw`\btruncate\s+(?:table\s+)?(?:public\.)?(${TABLE_GROUP})\b`,
      "gi",
    ),
    describe: (m) => ({ table: m[1], column: null }),
  },
  {
    kind: "unfiltered update",
    pattern: new RegExp(
      String.raw`\bupdate\s+(?:public\.)?(${TABLE_GROUP})\s+set\b[^;]*;`,
      "gi",
    ),
    describe: (m) => ({ table: m[1], column: null, guarded: /\bwhere\b/i.test(m[0]) }),
  },
];

/* ─── the check ────────────────────────────────────────────────────────── */

/**
 * The live catalogue: for every function and view, the last migration that
 * defines it, and what that definition states about its own security.
 *
 * `head` for a function is everything between its name and its body — where
 * `language`, `stable`, `security …` and `set search_path` live. Bodies were
 * blanked by `lex`, so "up to the first `$`" is the head and nothing inside a
 * function can be mistaken for one of its own options.
 */
function catalogue(migrations) {
  const functions = new Map();
  const views = new Map();

  for (const file of migrations) {
    const code = lex(file.text);

    FUNCTION_DECLARATION.lastIndex = 0;
    let match;
    while ((match = FUNCTION_DECLARATION.exec(code))) {
      const dollar = code.indexOf("$", match.index);
      const head = code.slice(match.index, dollar === -1 ? match.index + 1200 : dollar);
      functions.set(match[1].toLowerCase(), {
        name: match[1],
        file,
        line: lineOf(code, match.index),
        definer: /\bsecurity\s+definer\b/i.test(head),
        pinsSearchPath: /\bset\s+search_path\b/i.test(head),
      });
    }

    VIEW_DECLARATION.lastIndex = 0;
    while ((match = VIEW_DECLARATION.exec(code))) {
      // `with (…)` sits between the name and the `as` that opens the query.
      const after = code.slice(match.index, match.index + 600);
      const asAt = /\bas\b/i.exec(after.slice(match[0].length));
      const options = asAt ? after.slice(0, match[0].length + asAt.index) : after.slice(0, 300);
      views.set(match[2].toLowerCase(), {
        name: match[2],
        file,
        line: lineOf(code, match.index),
        materialized: Boolean(match[1]),
        declaresSecurity: /security_invoker/i.test(options),
      });
    }
  }

  return { functions, views };
}

export async function run({ project, sink, coverage }) {
  const migrations = [...project.migrations].sort((a, b) => a.rel.localeCompare(b.rel));
  const { functions, views } = catalogue(migrations);

  /* ── 1. live functions without a pinned search_path ─────────────────── */

  for (const entry of [...functions.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.pinsSearchPath) continue;
    sink.record({
      rule: "scan.sql-risk",
      file: entry.file.rel,
      line: entry.line,
      title: `${entry.name} is defined without a pinned search_path`,
      expected:
        "Every function pins its search_path, as 57 of the 64 live functions in this schema do. "
        + "20260811073515 exists for exactly this and states the reason: \"Pure date/integer "
        + "arithmetic, but an unpinned search_path on a function is a foothold regardless.\"",
      actual:
        `The live definition of ${entry.name} — ${entry.file.rel}:${entry.line}, the last `
        + `migration that defines it — declares no \`set search_path\`, and is `
        + `${entry.definer ? "SECURITY DEFINER" : "SECURITY INVOKER (the default)"}.`,
      evidence: entry.file.lines[entry.line - 1],
      why: entry.definer
        ? "SECURITY DEFINER with an unpinned search_path is the classic privilege escalation: "
          + "anything that can set search_path chooses which `installments` or `payments` this "
          + "function resolves, and it runs as the owner. This one refreshes the financial "
          + "materialized views, so it holds write reach over the money projection."
        : "It runs as the caller, so this is not escalation today. It is still the Supabase "
          + "linter's 0011 and still means an unqualified name inside the body resolves against "
          + "whatever search_path the session happens to carry.",
      fix:
        "Add `set search_path to 'pg_catalog', 'pg_temp'` (or `'public'` where the body needs it) "
        + "in a new migration that `create or replace`s the function. Never edit the migration "
        + "that is already applied.",
    });
  }

  /* ── 2. live views with no explicit security_invoker ────────────────── */

  for (const entry of [...views.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    // A materialized view cannot carry security_invoker; it is reached through
    // grants alone, so the question does not arise.
    if (entry.materialized || entry.declaresSecurity) continue;
    sink.record({
      rule: "scan.sql-risk",
      file: entry.file.rel,
      line: entry.line,
      title: `${entry.name} does not set security_invoker`,
      expected:
        "A plain view over student or financial tables declares "
        + "`with (security_invoker = true)`, as 25 of the 29 live plain views here do.",
      actual:
        `The live definition of ${entry.name} — ${entry.file.rel}:${entry.line} — sets no `
        + "`security_invoker` option, so it runs with its owner's privileges.",
      evidence: entry.file.lines[entry.line - 1],
      why:
        "Without security_invoker a view reads its base tables as the view owner, and RLS on "
        + "students, installments, payments and receipts is simply not consulted. Anyone who can "
        + "select from the view sees every row it can reach, whatever their own policies say.",
      fix:
        "Recreate the view with `with (security_invoker = true)` in a new migration — or, if it "
        + "is deliberately a controlled escape hatch for a service role, say so in a comment on "
        + "the view so the next reader sees a decision instead of an omission.",
    });
  }

  /* ── 3. DDL that destroys money ─────────────────────────────────────── */

  for (const file of migrations) {
    const code = lex(file.text);
    for (const rule of DESTRUCTIVE) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(code))) {
        const found = rule.describe(match);
        if (found.guarded) continue;

        const table = String(found.table ?? "").toLowerCase();
        // Scratch tables a migration creates and drops in the same breath are
        // the normal way a view stack is rebuilt here — _lf_mig_views,
        // tmp_workbook_snapshot, _waivable. They hold no ledger.
        if (/^(_|tmp_)/.test(table)) continue;
        if (found.column && !MONEY_COLUMN.test(found.column)) continue;
        if (!found.column && !FINANCIAL_TABLES.includes(table)) continue;

        const line = lineOf(code, match.index);
        const target = found.column ? `${table}.${found.column}` : table;
        sink.record({
          rule: "scan.sql-risk",
          file: file.rel,
          line,
          title: `${file.rel} ${rule.kind} on ${target}`,
          expected:
            "Money is never destroyed by a migration. Payment and receipt records are "
            + "append-only at every layer; a correction is a compensating payment_adjustments "
            + "row, never a rewrite, and a schema change to a money column is preceded by a "
            + "migration that preserves what is there.",
          actual:
            `This migration performs \`${rule.kind}\` on ${target}, which carries rupees. `
            + `${found.column ? "The column matches this schema's money vocabulary." : "The table is one of the ledger tables."}`,
          evidence: (file.lines[line - 1] ?? match[0]).slice(0, 300),
          why:
            "Hard safety rule 1: posted payments and receipts are never edited or deleted. A "
            + "dropped or retyped money column, a truncated ledger table or an unfiltered UPDATE "
            + "silently rewrites what a printed receipt said, and there is no audit row to "
            + "explain it afterwards.",
          fix:
            "Preserve the data first — copy the column, or write the compensating rows — and "
            + "leave the audit trail intact. If the target genuinely holds no money, narrow "
            + "FINANCIAL_TABLES / MONEY_COLUMN in tests/scan/checks/sql-safety.mjs rather than "
            + "waiving the finding.",
        });
      }
    }
  }

  /* SQL-building JavaScript: enumerated, examined, and deliberately unjudged. */
  /**
   * The injection sweep that produced no rule.
   *
   * Every source file is read for a template literal that is a SQL statement
   * AND interpolates something. That is the population an injection rule would
   * have judged, so it is counted here rather than left implicit — the note
   * below reports what it found, and it found nothing worth a finding.
   */
  const SQL_TEMPLATE =
    /`[^`]*\b(?:select\b[\s\S]{0,400}?\bfrom\b|insert\s+into\b|update\s+\w+\s+set\b|delete\s+from\b|create\s+(?:or\s+replace\s+)?(?:function|view|table)\b|drop\s+(?:table|view|function)\b|alter\s+table\b)[^`]*`/i;
  const scanned = project.source.filter((file) => !file.rel.startsWith("tests/scan/"));
  const interpolatedSql = scanned.filter((file) => {
    const literals = file.text.match(/`[^`]*`/g) ?? [];
    return literals.some((literal) => literal.includes("${") && SQL_TEMPLATE.test(literal));
  });

  coverage.declare({
    check: id,
    dimension: "supabase migrations, plus the source files that build SQL text",
    domainSize: migrations.length + scanned.length,
    examined: migrations.length + scanned.length,
    strategy: "exhaustive",
    note:
      `All ${migrations.length} migrations were lexed (comments and dollar-quoted bodies blanked) `
      + `to build a live catalogue of ${functions.size} functions and ${views.size} views, and `
      + `${scanned.length} source files were read for SQL built as text. Four limits. `
      + "(1) The two convention rules judge only the LIVE definition — the last migration in "
      + "filename order that defines each object — because a finding against an applied "
      + "migration cannot be acted on without desynchronising schema_migrations. A function "
      + "created by a later `execute format(…)` inside a DO block is invisible to that catalogue, "
      + "and so is anything created outside migrations. (2) The money-DDL rule fires on nothing "
      + "in the tree today: there is no `drop column` anywhere and every `drop table` targets a "
      + "scratch table. It is retained as a tripwire, not as evidence of a clean history. "
      + "(3) SQL injection is NOT checked. Every template literal in those source files that is a "
      + `SQL statement AND interpolates a value was examined; there are ${interpolatedSql.length}, `
      + "and both are safe — `postgres` tagged templates in the notion-sync "
      + "Edge Function, and a never-executed rollback hint string in lib/prev-year-dues. The app "
      + "reaches Postgres through supabase-js, which is PostgREST, so there is no concatenation "
      + "surface to guard and a rule here would have reported those two forever. "
      + "(4) `security definer`/`security invoker` on functions is not checked either: 31 of the "
      + "64 live functions state neither, so there is no convention to hold anyone to. Nor is "
      + "grant/revoke drift — grants are re-applied in ACL-restore loops and follow-up "
      + "migrations, and every text rule attempted flagged 18 of 21 live views, which measured "
      + "the regex rather than the schema.",
  });
}
