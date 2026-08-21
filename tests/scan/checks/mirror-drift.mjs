/**
 * The same rule, written twice, in two languages.
 *
 * Several rules in this app exist once in TypeScript and once in PL/pgSQL, and
 * the source says so out loud — "Byte-identical to …", "Edit both or neither",
 * "any change here must be mirrored in the migration, and vice versa". Nothing
 * enforces those sentences. When one copy moves and the other does not, the app
 * and its database disagree about money, quietly, and every screen stays green.
 *
 * It has already happened. Migration `20260812001114` string-patched
 * `private.workbook_installment_snapshot` and left
 * `v_workbook_installment_balances` alone, so EMI late fees were visible to the
 * Payment Desk and invisible to the dashboard, the defaulter list and every
 * export for four days. That is the failure this check exists for.
 *
 * ── How it works ───────────────────────────────────────────────────────────
 *
 * A pinned-hash manifest, `tests/scan/baseline/mirrors.json`. For each declared
 * pair it stores both locations, a normalised excerpt hash of each side, and one
 * line saying what the shared rule is. The check recomputes the hashes and
 * reports `scan.mirror-drift` when either side has moved since the pair was last
 * reconciled. Regenerate it with `node tests/scan/checks/mirror-drift.mjs
 * --write-baseline` — and only ever as a deliberate act, after checking that
 * both sides really do agree again.
 *
 * The hash is taken over a NORMALISED excerpt: comments gone, whitespace
 * collapsed, case folded. A reformat is not a finding. Operators, identifiers
 * and numeric literals survive untouched, because those are exactly the drift —
 * `>=` becoming `>`, `pending_amount` becoming `total_pending`, `1000` becoming
 * `500`. Normalising those away would be normalising away the bug.
 *
 * ── Five ways a pair goes wrong, and how each is caught ────────────────────
 *
 *   1. **One side edited.** Its hash no longer matches the pin. This is the
 *      common case and the whole point.
 *   2. **The anchor is gone.** A function renamed, a block deleted, a view
 *      restructured — and the manifest is now describing something that does
 *      not exist. Reported as `scan.mirror-drift` too, with an `actual` that
 *      says the manifest is lying rather than pretending the pair is clean. A
 *      pin that silently stops matching anything is worse than no pin.
 *   3. **The SQL side redefined in a newer migration.** Migrations are
 *      append-only, so the pinned file's bytes never change — a *later*
 *      migration is how SQL moves. Each SQL side therefore carries
 *      `redefinedBy` anchors; a migration newer than the pinned one containing
 *      any of them means the live definition is no longer what was pinned.
 *   4. **The two copies inside one migration disagreed on arrival.** The late-fee
 *      rule is duplicated verbatim inside a single file. That pair is compared
 *      side-to-side, live, against no pin at all: if the copies differ right
 *      now, that is a P1 today and not a question about history.
 *   5. **A new migration touches one engine and not the other.** Exactly what
 *      `20260812001114` did — it never carried the shared-rule marker, so a
 *      marker-only check would have missed it, but it did name one engine and
 *      not its twin while editing a late-fee branch. Applied only to migrations
 *      newer than `lastReconciledMigration`, because everything before that pin
 *      is by definition already reconciled.
 *
 * ── What it deliberately does not do ───────────────────────────────────────
 *
 * A pin proves *movement*, not *agreement*. Pinning two sides today says
 * nothing about whether they meant the same thing today — the check cannot read
 * SQL and TypeScript and decide they compute the same number. Where a pair is
 * known to have already diverged, the manifest carries a `diverged` note and the
 * check reports it as `scan.observation` (P3) so it is stated rather than
 * implied by silence.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const id = "mirror-drift";
export const title = "TS/SQL pairs the source declares must move together";

const MANIFEST_REL = "tests/scan/baseline/mirrors.json";

/**
 * The declared pairs.
 *
 * Every one of these is a mirror the repository names itself — a comment saying
 * "mirrors X", "byte-identical to Y", "edit both or neither". None is invented
 * here. `declaredAt` is where the source makes the claim, so a reader can check
 * that the pair is real before trusting the pin.
 *
 * A side is located by two literal anchors rather than a line number: line
 * numbers rot on the first unrelated edit above them, and a rotted line number
 * silently hashes the wrong block. `from` and `to` are inclusive and both are
 * expanded to whole lines.
 */
const MIRRORS = [
  {
    id: "late-fee-rule",
    rule:
      "An overdue installment carries its flat late fee unless it is waived, is a carry-forward "
      + "row (flat 0), or was settled by its due date -- and an EMI late-fee row is the charge, "
      + "so it is tested before the zero-base guard that would otherwise cancel it.",
    declaredAt:
      "supabase/migrations/20260812120000_late_fee_is_a_separate_charge.sql:218 "
      + "(\"Byte-identical to private.workbook_installment_snapshot ... edit the other in the same migration\")",
    sides: [
      {
        name: "v_workbook_installment_balances",
        file: "supabase/migrations/20260812120000_late_fee_is_a_separate_charge.sql",
        from: ">>> SHARED LATE FEE RULE <<<",
        to: "as raw_late_fee",
        occurrence: 1,
      },
      {
        name: "private.workbook_installment_snapshot",
        file: "supabase/migrations/20260812120000_late_fee_is_a_separate_charge.sql",
        from: ">>> SHARED LATE FEE RULE <<<",
        to: "as raw_late_fee",
        occurrence: 2,
      },
    ],
  },
  {
    id: "repayment-plan-schedule",
    rule:
      "An EMI schedule: term = ceil(opening / monthly) with a floor of 1, one row per month with "
      + "the day-of-month clamped to the shortest month, and the final instalment absorbing the "
      + "remainder rather than the term rounding up.",
    declaredAt:
      "src/lib/repayment-plans/schedule.ts:2-8 (\"The database is authoritative ... Any change here "
      + "must be mirrored in the migration, and vice versa\")",
    sides: [
      {
        name: "buildRepaymentSchedule + addMonthsClamped + calculateRepaymentTermMonths",
        file: "src/lib/repayment-plans/schedule.ts",
        from: "export function addMonthsClamped",
        to: "}));",
      },
      {
        name: "private.repayment_plan_schedule",
        file: "supabase/migrations/20260811073515_repayment_plan_schedule_pins_search_path.sql",
        from: "with term as (",
        to: "order by n;",
        redefinedBy: ["function private.repayment_plan_schedule("],
      },
    ],
  },
  {
    id: "conventional-discount-tuition",
    rule:
      "A conventional discount policy resolves to a tuition figure: zero, a percentage of base "
      + "tuition rounded to whole rupees with the percentage clamped to 0-100, or a fixed amount. "
      + "`percentage` is the RETAINED share, not the discount share.",
    declaredAt:
      "supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql:131-141 "
      + "(\"Mirrors applyConventionalDiscountsToTuition ... see calculateConventionalPolicyTuition\")",
    sides: [
      {
        name: "calculateConventionalPolicyTuition",
        file: "src/lib/fees/conventional-discount-rules.ts",
        from: "export function calculateConventionalPolicyTuition",
        to: "return toWholeNumber(payload.policy.fixedTuitionAmount);",
      },
      {
        name: "v_workbook_student_financials conventional-discount lateral",
        file: "supabase/migrations/20260807120000_workbook_financials_conventional_discount.sql",
        from: "CASE policy_row.calculation_type",
        to: "ELSE GREATEST(COALESCE(policy_row.fixed_tuition_amount",
        redefinedBy: ["CASE policy_row.calculation_type"],
      },
    ],
  },
  {
    id: "installment-amount-due",
    rule: "amount_due = (base_amount + transport_amount) - discount_amount.",
    declaredAt:
      "src/lib/fees/generator.ts:357-360 (\"`installments.amount_due` is a generated column ... "
      + "Mirror the generation expression here\")",
    sides: [
      {
        name: "plannedAmountDue",
        file: "src/lib/fees/generator.ts",
        from: "function plannedAmountDue",
        to: "}",
      },
      {
        name: "installments.amount_due generated column",
        file: "supabase/migrations/20260421054019_initial_fee_management_schema.sql",
        from: "amount_due integer generated always as",
        to: "stored,",
        redefinedBy: ["amount_due integer generated always as", "alter column amount_due"],
      },
    ],
  },
  {
    id: "pending-late-fee",
    rule:
      "The late fee a student still owes for the session, summed across installments, net of "
      + "waivers and of any payment that already covered it.",
    declaredAt:
      "supabase/migrations/20260809110000_late_fee_waived_means_manually_waived.sql:54 "
      + "(\"Mirrors calculatePendingLateFeeAmount (lib/fees/due-amounts.ts:40-45)\")",
    sides: [
      {
        name: "calculatePendingLateFeeAmount",
        file: "src/lib/fees/due-amounts.ts",
        from: "export function calculatePendingLateFeeAmount",
        to: "}",
      },
      {
        name: "v_student_installment_facets.pending_late_fee_amount",
        file: "supabase/migrations/20260812120000_late_fee_is_a_separate_charge.sql",
        from: "'COALESCE(sum(GREATEST(late_fee_pending, 0)), 0::bigint)::integer AS pending_late_fee_amount'",
        to: "'COALESCE(sum(GREATEST(late_fee_pending, 0)), 0::bigint)::integer AS pending_late_fee_amount'",
        redefinedBy: ["as pending_late_fee_amount", "AS pending_late_fee_amount"],
      },
    ],
    /*
     * The `diverged` note this pair used to carry is gone because the divergence
     * is gone. `20260812120000` moved the SQL side off
     * `LEAST(GREATEST(final_late_fee,0), GREATEST(pending_amount,0))` and onto
     * `GREATEST(late_fee_pending,0)` when fees and late fees became separate
     * columns; the TypeScript kept computing the older expression until
     * 2026-08-19, and on the live 2026-27 session that hid Rs 2,000 across two
     * students -- min(final_late_fee, pending_amount) is 0 for a family whose
     * fees are clear and whose late fee is not, which is the family the figure
     * exists to describe. calculatePendingLateFeeAmount now reads lateFeePending
     * first, so both sides read the same column. Re-pinned the same day.
     */
  },
  {
    id: "year-clear",
    rule:
      "\"Year clear\" = nothing outstanding AND something actually settled, where a discount "
      + "close-out counts as settlement -- so a student whose dues were never prepared is not "
      + "stamped clear.",
    declaredAt:
      "supabase/migrations/20260810090000_money_segments_read_money_not_status_label.sql:103 "
      + "(\"Mirrors isYearCleared() in lib/fees/year-clear.ts, including the reason it exists\")",
    sides: [
      {
        name: "isYearCleared",
        file: "src/lib/fees/year-clear.ts",
        from: "export function isYearCleared",
        to: "return input.outstandingAmount",
      },
      {
        name: "seg_year_clear",
        file: "supabase/migrations/20260811080026_student_directory_emi_segments.sql",
        from: "COALESCE(f.outstanding_amount, 0::bigint) <= 0 AND (COALESCE(f.total_paid, 0)",
        to: "AS seg_year_clear,",
        redefinedBy: ["as seg_year_clear"],
      },
    ],
  },
  {
    id: "fee-exception",
    rule:
      "A student has a fee exception when an active override row sets any of: custom tuition, "
      + "custom transport, a positive discount, a positive late-fee waiver, an other-adjustment "
      + "amount, or a non-blank other-adjustment head.",
    declaredAt:
      "supabase/migrations/20260809100000_student_segment_facets.sql:210 "
      + "(\"Mirrors hasFeeException in lib/students/data.ts\")",
    sides: [
      {
        name: "hasFeeException",
        file: "src/lib/students/data.ts",
        from: "const hasFeeException =",
        to: "Boolean(override.other_adjustment_head?.trim())",
      },
      {
        name: "seg_fee_exception",
        file: "supabase/migrations/20260811080026_student_directory_emi_segments.sql",
        from: "o.id IS NOT NULL AND (o.custom_tuition_fee_amount IS NOT NULL",
        to: "AS seg_fee_exception,",
        redefinedBy: ["as seg_fee_exception"],
      },
    ],
  },
  {
    id: "collectable-scope",
    rule:
      "Money counts `record_status = 'active' OR total_paid > 0`. A student who left owing money "
      + "still owes it -- and headcount, which is active-only, must never borrow this predicate.",
    declaredAt:
      "workers/schoolfees-mcp/src/scope.mjs:23-24 (\"Mirrors lib/workbook/data.ts:680, "
      + "src/lib/defaulters/data.ts:133 and lib/recovery/types.ts:11\")",
    sides: [
      {
        name: "STUDENT_SCOPES.collectable",
        file: "workers/schoolfees-mcp/src/scope.mjs",
        from: "rule: \"record_status = 'active' OR total_paid > 0\"",
        to: "predicate: { or: \"(record_status.eq.active,total_paid.gt.0)\" },",
      },
      {
        name: "workbook activeOnly filter",
        file: "src/lib/workbook/data.ts",
        from: "query.or(\"record_status.eq.active,total_paid.gt.0\")",
        to: "query.or(\"record_status.eq.active,total_paid.gt.0\")",
      },
    ],
  },
];

/**
 * The two engines that carry the shared late-fee rule.
 *
 * Named here rather than derived, because the whole point is that they are two
 * hand-maintained copies of one rule: there is nothing in the schema that
 * relates them, which is precisely why they drift.
 */
const LATE_FEE_ENGINES = [
  "v_workbook_installment_balances",
  "workbook_installment_snapshot",
];

/** The marker both copies carry, in either the self-closing or the paired form. */
const SHARED_RULE_MARKER = "SHARED LATE FEE RULE";

/** A late-fee branch in real SQL, not in a comment. Comments are stripped first. */
const LATE_FEE_BRANCH = /\bwhen\b[^\n]*\blate_fee_flat_amount\b/i;

/**
 * `file.lines` with every SQL comment blanked, same length and same count.
 *
 * Both migration sweeps below search for a literal that names an object. Prose
 * names objects constantly in this repo — a `comment on view` string in
 * `20260812120000` lists three `seg_*` columns it does not define — so matching
 * raw text would report a paragraph as a redefinition. Only code counts.
 */
function sqlCodeLines(file) {
  const out = [];
  let inBlock = false;
  for (const raw of file.lines) {
    let line = raw;
    if (inBlock) {
      const close = line.indexOf("*" + "/");
      if (close === -1) {
        out.push("");
        continue;
      }
      line = " ".repeat(close + 2) + line.slice(close + 2);
      inBlock = false;
    }
    const lineComment = line.indexOf("--");
    if (lineComment !== -1) line = line.slice(0, lineComment);
    line = line.replace(/\/\*[\s\S]*?\*\//g, " ");
    const open = line.indexOf("/" + "*");
    if (open !== -1) {
      line = line.slice(0, open);
      inBlock = true;
    }
    out.push(line);
  }
  return out;
}

/* ─── normalisation ────────────────────────────────────────────────────── */

function languageOf(rel) {
  return rel.endsWith(".sql") ? "sql" : "ts";
}

/**
 * Strip what a reformat can change; keep everything a bug can change.
 *
 * Comments go (the two late-fee copies carry deliberately different comments,
 * each pointing at the other). Whitespace collapses to a single space rather
 * than vanishing, so token boundaries survive. Case folds because SQL does not
 * care and the pins should not either.
 *
 * Comment stripping is per language, not a union: applying SQL's `--` rule to
 * TypeScript would eat a decrementing expression, and applying JavaScript's
 * `//` rule to SQL would eat the middle of a regex or a path in a string. A
 * `--` inside a SQL string literal is still stripped — a false negative, never
 * a false positive, which is the right direction for a pin.
 */
function normalise(text, language = "sql") {
  let out = String(text).replace(/\/\*[\s\S]*?\*\//g, " ");
  out = language === "sql" ? out.replace(/--[^\n]*/g, " ") : out.replace(/\/\/[^\n]*/g, " ");
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}

function hashOf(normalised) {
  return createHash("sha1").update(normalised).digest("hex").slice(0, 16);
}

function indexOfNth(text, needle, occurrence) {
  let index = -1;
  for (let seen = 0; seen < occurrence; seen += 1) {
    index = text.indexOf(needle, index + 1);
    if (index === -1) return -1;
  }
  return index;
}

function lineOfIndex(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

/**
 * Pull one side out of its file, expanded to whole lines.
 *
 * Returns `{ missing }` rather than throwing, because "the anchor is gone" is
 * itself a finding this check has to report — a pin that resolves to nothing is
 * a pin that has stopped watching anything.
 */
function extractSide(file, side) {
  const text = file.text;
  const startAt = indexOfNth(text, side.from, side.occurrence ?? 1);
  if (startAt === -1) {
    return { missing: `start anchor ${JSON.stringify(side.from)}` };
  }

  const searchFrom = side.to === side.from ? startAt : startAt + side.from.length;
  const endAt = text.indexOf(side.to, searchFrom);
  if (endAt === -1) {
    return { missing: `end anchor ${JSON.stringify(side.to)} after the start anchor` };
  }

  const lineStart = text.lastIndexOf("\n", startAt) + 1;
  const lineEndBreak = text.indexOf("\n", endAt + side.to.length);
  const lineEnd = lineEndBreak === -1 ? text.length : lineEndBreak;
  const body = text.slice(lineStart, lineEnd);
  const language = languageOf(file.rel);

  return {
    body,
    language,
    normalised: normalise(body, language),
    startLine: lineOfIndex(text, lineStart),
    endLine: lineOfIndex(text, lineEnd),
  };
}

/* ─── baseline generation ──────────────────────────────────────────────── */

/**
 * Recompute every pin from the tree as it stands and write the manifest.
 *
 * Deliberately a separate entry point rather than a self-healing check: a pin
 * that regenerates itself on drift is a pin that reports nothing, ever. Running
 * this is an assertion by a person that both sides agree again.
 */
export function writeBaseline(project) {
  const pairs = [];
  const problems = [];

  for (const pair of MIRRORS) {
    const sides = [];
    for (const side of pair.sides) {
      const file = project.get(side.file);
      if (!file) {
        problems.push(`${pair.id}: ${side.file} does not exist`);
        continue;
      }
      const found = extractSide(file, side);
      if (found.missing) {
        problems.push(`${pair.id}/${side.name}: ${found.missing} not found in ${side.file}`);
        continue;
      }
      sides.push({
        name: side.name,
        file: side.file,
        startLine: found.startLine,
        endLine: found.endLine,
        chars: found.normalised.length,
        hash: hashOf(found.normalised),
      });
    }
    pairs.push({
      id: pair.id,
      rule: pair.rule,
      declaredAt: pair.declaredAt,
      ...(pair.diverged ? { diverged: pair.diverged } : {}),
      sides,
    });
  }

  const migrations = project.migrations.map((file) => file.rel).sort();
  const manifest = {
    note:
      "Pinned hashes for the TS/SQL pairs the source declares must move together. Each hash is "
      + "sha1 of the excerpt with comments removed, whitespace collapsed and case folded — a "
      + "reformat does not move it, an operator or a literal does. Regenerate with `node "
      + "tests/scan/checks/mirror-drift.mjs --write-baseline`, and only after confirming by hand "
      + "that both sides of every changed pair agree again.",
    lastReconciledMigration: migrations[migrations.length - 1] ?? null,
    pairs,
  };

  const target = path.join(project.root, MANIFEST_REL);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, problems, target };
}

function loadManifest(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, MANIFEST_REL), "utf8"));
  } catch {
    return null;
  }
}

/* ─── the check ────────────────────────────────────────────────────────── */

function recordDrift(sink, { file, line, title: findingTitle, actual, evidence, pair, fix }) {
  sink.record({
    rule: "scan.mirror-drift",
    file,
    line,
    title: findingTitle,
    expected:
      `Both copies of the rule move together. ${pair.rule} Declared at ${pair.declaredAt}.`,
    actual,
    evidence,
    why:
      "This rule exists twice, in TypeScript and in PL/pgSQL, and nothing but a comment holds "
      + "the copies together. When they disagree the app and its database compute different "
      + "money from the same row and every screen still renders — 20260812001114 edited one copy "
      + "of the late-fee rule and EMI late fees were invisible to the dashboard, the defaulters "
      + "list and every export for four days.",
    fix,
  });
}

export async function run({ project, sink, coverage }) {
  const manifest = loadManifest(project.root);
  const migrations = [...project.migrations].sort((a, b) => a.rel.localeCompare(b.rel));

  let sidesExamined = 0;
  const sidesDeclared = MIRRORS.reduce((sum, pair) => sum + pair.sides.length, 0);

  if (!manifest) {
    sink.record({
      rule: "scan.observation",
      file: MANIFEST_REL,
      line: 1,
      title: `${MANIFEST_REL} is missing, so no mirror is pinned`,
      expected: `${MANIFEST_REL} holds one pinned hash per side of every declared mirror.`,
      actual:
        `The manifest could not be read, so all ${sidesDeclared} declared sides went unchecked. `
        + "This check reported nothing because it looked at nothing.",
      evidence: MANIFEST_REL,
      why:
        "A drift check with no baseline is indistinguishable from a clean tree in the report, "
        + "which is the one thing the coverage ledger exists to prevent.",
      fix: "Run `node tests/scan/checks/mirror-drift.mjs --write-baseline` and commit the result.",
    });
  }

  const pinnedById = new Map((manifest?.pairs ?? []).map((pair) => [pair.id, pair]));

  /* ── 1-3: every declared side against its pin ───────────────────────── */

  for (const pair of MIRRORS) {
    const pinnedPair = pinnedById.get(pair.id);

    for (const side of pair.sides) {
      const file = project.get(side.file);
      const pinned = pinnedPair?.sides?.find((entry) => entry.name === side.name);

      if (!file) {
        recordDrift(sink, {
          file: side.file,
          line: 1,
          pair,
          title: `${pair.id}: the file holding "${side.name}" is gone`,
          actual:
            `${side.file} is pinned as one side of the "${pair.id}" mirror and no longer exists `
            + "in the tree. The pin is now describing something that is not there.",
          evidence: side.file,
          fix:
            "Move the pin to wherever the rule lives now, or delete the pair from MIRRORS in "
            + "tests/scan/checks/mirror-drift.mjs if the duplication is genuinely over.",
        });
        continue;
      }

      sidesExamined += 1;
      const found = extractSide(file, side);

      if (found.missing) {
        recordDrift(sink, {
          file: side.file,
          line: 1,
          pair,
          title: `${pair.id}: "${side.name}" can no longer be located in ${side.file}`,
          actual:
            `The manifest pins this side by anchor, and its ${found.missing} is not in the file. `
            + "Either the rule was renamed or restructured and the mirror was not re-pinned, or "
            + "it was deleted outright — in both cases the manifest is now lying about watching "
            + "it, and no drift on this side would be reported.",
          evidence: side.from,
          fix:
            "Re-point the anchors in MIRRORS (tests/scan/checks/mirror-drift.mjs) at wherever "
            + "the rule now lives, then regenerate the manifest with --write-baseline.",
        });
        continue;
      }

      if (!pinned) continue;

      if (pinned.hash !== hashOf(found.normalised)) {
        recordDrift(sink, {
          file: side.file,
          line: found.startLine,
          pair,
          title: `${pair.id}: "${side.name}" has changed since the mirror was last reconciled`,
          actual:
            `Normalised hash is ${hashOf(found.normalised)}; the manifest pins ${pinned.hash}. `
            + `The excerpt at ${side.file}:${found.startLine}-${found.endLine} moved in a way `
            + "that comment, whitespace and case normalisation does not explain — an operator, "
            + "an identifier or a literal changed. Its counterpart"
            + `${pair.sides.length === 2 ? ` (${pair.sides.find((other) => other.name !== side.name)?.name})` : ""}`
            + " is still at its pinned value.",
          evidence: file.lines[found.startLine - 1],
          fix:
            "Make the same change on the other side, then re-pin with `node "
            + "tests/scan/checks/mirror-drift.mjs --write-baseline`. If the change was deliberate "
            + "and one-sided, say so in both files first — a mirror that is no longer a mirror "
            + "should stop claiming to be one.",
        });
      }

      /* A newer migration redefining the pinned SQL object. */
      if (!side.redefinedBy || !file.isMigration) continue;
      for (const later of migrations) {
        if (later.rel <= side.file) continue;
        const code = sqlCodeLines(later).map((line) => line.toLowerCase());
        const anchor = side.redefinedBy.find((needle) =>
          code.some((line) => line.includes(needle.toLowerCase())));
        if (!anchor) continue;
        const lineIndex = code.findIndex((line) => line.includes(anchor.toLowerCase()));
        recordDrift(sink, {
          file: later.rel,
          line: lineIndex + 1,
          pair,
          title: `${pair.id}: "${side.name}" is redefined by a migration newer than the pin`,
          actual:
            `${later.rel} contains ${JSON.stringify(anchor)}, so the live definition of `
            + `"${side.name}" is no longer the one pinned in ${side.file}. Migrations are `
            + "append-only: the pinned file's bytes cannot change, so a later migration is the "
            + "only way this side moves, and the pin cannot see it.",
          evidence: later.lines[lineIndex] ?? anchor,
          fix:
            "Confirm the TypeScript side matches the new definition, re-point this side at the "
            + "newer migration in MIRRORS, and regenerate the manifest.",
        });
        break;
      }
    }

    /* ── the pair that is already known to disagree ─────────────────── */
    if (pair.diverged) {
      const first = project.get(pair.sides[0].file);
      const located = first ? extractSide(first, pair.sides[0]) : null;
      sink.record({
        rule: "scan.observation",
        file: pair.sides[0].file,
        line: located?.startLine ?? 1,
        title: `${pair.id}: the two sides are pinned, and they already disagree`,
        expected: `${pair.rule} Declared at ${pair.declaredAt}.`,
        actual: pair.diverged,
        evidence: first?.lines[(located?.startLine ?? 1) - 1] ?? pair.sides[0].from,
        why:
          "A pinned hash proves that neither side has moved since it was pinned. It cannot prove "
          + "they agreed when they were pinned — this check reads text, not semantics. Recording "
          + "the known divergence keeps a silent manifest from reading as a clean bill of health.",
        fix:
          "Bring the TypeScript in line with the migration, re-pin, and drop the `diverged` note "
          + "from the pair in tests/scan/checks/mirror-drift.mjs.",
      });
    }
  }

  /* ── 4: the two copies inside one migration, compared live ──────────── */

  const markerCarriers = migrations.filter((file) => file.text.includes(SHARED_RULE_MARKER));
  const newestCarrier = markerCarriers[markerCarriers.length - 1] ?? null;

  if (newestCarrier) {
    const copies = [];
    let cursor = 0;
    for (;;) {
      const at = newestCarrier.text.indexOf(SHARED_RULE_MARKER, cursor);
      if (at === -1) break;
      cursor = at + SHARED_RULE_MARKER.length;
      const found = extractSide(newestCarrier, {
        from: SHARED_RULE_MARKER,
        to: "as raw_late_fee",
        occurrence: copies.length + 1,
      });
      if (found.missing) continue;
      copies.push(found);
    }

    // A `>>> … <<<` open/close pair produces two marker hits for one copy; the
    // extracted bodies are then identical by construction. Dedupe on the
    // extracted span so the comparison is between real copies, not markers.
    const distinct = [];
    for (const copy of copies) {
      if (!distinct.some((seen) => seen.startLine === copy.startLine)) distinct.push(copy);
    }

    if (distinct.length >= 2) {
      const [first, ...rest] = distinct;
      for (const other of rest) {
        if (other.normalised === first.normalised) continue;
        recordDrift(sink, {
          file: newestCarrier.rel,
          line: other.startLine,
          pair: MIRRORS[0],
          title: `${newestCarrier.rel} carries two copies of the shared late-fee rule that differ`,
          actual:
            `The copy at line ${first.startLine} and the copy at line ${other.startLine} do not `
            + "normalise to the same text. Both are marked "
            + `"${SHARED_RULE_MARKER}" and the file says to edit both or neither. This is not a `
            + "question about history — the two engines in the newest migration that defines them "
            + "disagree right now.",
          evidence: newestCarrier.lines[other.startLine - 1],
          fix:
            "Diff the two blocks and make them identical, in the same migration. They are the "
            + "same rule twice; there is no version of this where one is right.",
        });
      }
    }
  }

  /* ── 5: a new migration that touches one engine and not its twin ────── */

  const reconciledUpTo = manifest?.lastReconciledMigration ?? null;
  let newMigrationsChecked = 0;

  for (const file of migrations) {
    if (!reconciledUpTo || file.rel <= `supabase/migrations/${path.basename(reconciledUpTo)}`) {
      continue;
    }
    newMigrationsChecked += 1;

    // Comments first: a migration explaining the rule in prose is not editing it.
    // 20260812130000 quotes the rule in a header comment and touches one engine;
    // reading raw text would report it, and it would be wrong.
    const code = sqlCodeLines(file);
    const body = code.join("\n");
    const touchesRule = LATE_FEE_BRANCH.test(body) || body.includes(SHARED_RULE_MARKER);
    if (!touchesRule) continue;

    const named = LATE_FEE_ENGINES.filter((engine) => body.includes(engine));
    if (named.length !== 1) continue;

    const missing = LATE_FEE_ENGINES.find((engine) => engine !== named[0]);
    const lineIndex = code.findIndex((line) => LATE_FEE_BRANCH.test(line));
    recordDrift(sink, {
      file: file.rel,
      line: lineIndex + 1,
      pair: MIRRORS[0],
      title: `${file.rel} edits the late-fee rule in ${named[0]} and never names ${missing}`,
      actual:
        `This migration contains a late-fee branch and mentions ${named[0]}, but never mentions `
        + `${missing}, which carries the same rule. The two are hand-maintained copies with `
        + "nothing in the schema relating them.",
      evidence: file.lines[lineIndex] ?? named[0],
      fix:
        `Apply the same edit to ${missing} in this migration, or — if the change genuinely `
        + "belongs to one engine only — say why in the file, because the next reader will "
        + "assume it was an omission.",
    });
  }

  coverage.declare({
    check: id,
    dimension: "declared TS/SQL mirror sides, plus migrations added since the last reconcile",
    domainSize: sidesDeclared + migrations.length,
    examined: sidesExamined + migrations.length,
    strategy: "targeted",
    note:
      `${MIRRORS.length} pairs (${sidesDeclared} sides) are pinned in ${MANIFEST_REL}; `
      + `${newMigrationsChecked} migration(s) postdate lastReconciledMigration `
      + `(${reconciledUpTo ?? "unset"}) and were swept for a one-sided late-fee edit. `
      + "Three limits are worth stating. (1) The pairs are the ones the source declares in a "
      + "comment — \"mirrors X\", \"byte-identical\", \"edit both or neither\". An undeclared "
      + "duplication is invisible here, and the honest fix is a comment in the code, not a "
      + "cleverer scanner. (2) A pin proves movement, never agreement: two sides pinned while "
      + "already disagreeing stay silent, which is why pending-late-fee carries an explicit "
      + "`diverged` note reported as scan.observation. (3) The Worker's RBAC copy "
      + "(workers/schoolfees-mcp/src/permissions.mjs, declared a mirror of lib/auth/roles.ts) is "
      + "deliberately NOT pinned here — tests/unit/mcp-permissions.test.ts already asserts the "
      + "two are equivalent at runtime, which is strictly stronger than a text hash, and a second "
      + "mechanism would only be a second place to forget.",
  });
}

/* ─── `node tests/scan/checks/mirror-drift.mjs --write-baseline` ───────── */

if (process.argv[1] && process.argv[1].endsWith("mirror-drift.mjs")) {
  const { createProject } = await import("../lib/project.mjs");
  const project = await createProject(path.resolve(process.cwd()));
  const { problems, target, manifest } = writeBaseline(project);
  for (const problem of problems) console.error(`unresolved: ${problem}`);
  const sides = manifest.pairs.reduce((sum, pair) => sum + pair.sides.length, 0);
  console.log(`wrote ${target}: ${manifest.pairs.length} pairs, ${sides} sides pinned.`);
  if (problems.length > 0) process.exitCode = 1;
}
