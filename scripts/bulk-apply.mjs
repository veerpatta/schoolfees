import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { FORBIDDEN_TABLES, OPERATIONS, describeOperations } from "./bulk-apply-operations.mjs";

/**
 * Apply a bulk data change described by a plan file.
 *
 * This is the sanctioned path for a coding agent to change many rows at once
 * when no screen in the app can do it. It generalises
 * `scripts/repair-discount-drift.mjs`, which is the shape that already works:
 * read with the service role, print the whole diff, write nothing unless asked
 * twice, and re-measure afterwards.
 *
 *   node scripts/bulk-apply.mjs --plan plans/fix-phones.json --session TEST-2026-27
 *   node scripts/bulk-apply.mjs --plan plans/fix-phones.json --session TEST-2026-27 --apply
 *
 * A plan is JSON:
 *
 *   {
 *     "operation": "student-fields",
 *     "reason": "Office corrected 40 wrong parent phone numbers, 2026-08-13",
 *     "rows": [
 *       { "admission_no": "TEST-NUR-001", "set": { "primary_phone": "9876543210" } }
 *     ]
 *   }
 *
 * Read `docs/workflows/agent-bulk-operations.md` before using this.
 */

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const planPath = readFlag("plan");
const sessionLabel = readFlag("session");
const apply = process.argv.includes("--apply");
const live = process.argv.includes("--live");
const allowFeeImpact = process.argv.includes("--allow-fee-impact");
const maxRows = Number(readFlag("max", "500"));
const actor = readFlag("actor", process.env.BULK_APPLY_ACTOR ?? "agent");

const LIVE_SESSION_LABEL = "2026-27";
const APPLY_CONCURRENCY = 10;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function usage() {
  console.log(`
Bulk apply — dry run by default.

  node scripts/bulk-apply.mjs --plan <file.json> --session <label> [--apply]

  --plan               JSON plan file (required)
  --session            academic session the plan targets (required)
  --apply              actually write. Without it, nothing is changed.
  --live               required alongside --session ${LIVE_SESSION_LABEL}
  --allow-fee-impact   required for operations that change what a family owes
  --max <n>            refuse a plan with more than n rows (default 500)
  --actor <name>       recorded in the audit trail (default "agent")

Operations:

${describeOperations()}

See docs/workflows/agent-bulk-operations.md
`);
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

// Run with no arguments at all: show the help rather than a bare error, but exit
// non-zero so a script that forgot its flags does not look like a success.
if (!planPath && !sessionLabel) {
  usage();
  process.exit(1);
}

if (!planPath) {
  fail("--plan is required.");
}

if (!sessionLabel) {
  fail("--session is required. A plan that does not name its session is a plan that can hit the wrong one.");
}

if (!existsSync(planPath)) {
  fail(`Plan file not found: ${planPath}`);
}

// The live-session guard. Until now this boundary was prose in five separate
// documents and nothing at all in the code.
if (sessionLabel === LIVE_SESSION_LABEL && !live) {
  fail(
    `Refusing to touch the live session ${LIVE_SESSION_LABEL} without --live.\n\n` +
      "That session holds real school financial records. Run the plan against TEST-2026-27\n" +
      "first, read the diff, and only then re-run with --live.",
  );
}

let plan;

try {
  // PowerShell's `Out-File -Encoding utf8` writes a BOM on Windows, and a plan
  // written that way is otherwise perfectly good JSON. Strip it rather than
  // fail on an invisible character.
  plan = JSON.parse(readFileSync(planPath, "utf8").replace(/^﻿/, ""));
} catch (error) {
  fail(`Plan file is not valid JSON: ${error.message}`);
}

const operation = OPERATIONS[plan.operation];

if (!operation) {
  fail(
    `Unknown operation "${plan.operation}".\n\nKnown operations:\n\n${describeOperations()}`,
  );
}

if (FORBIDDEN_TABLES.includes(operation.table)) {
  fail(
    `Operation "${plan.operation}" names table "${operation.table}", which is never writable by a script.`,
  );
}

if (!plan.reason || String(plan.reason).trim().length < 10) {
  fail(
    'Plan needs a "reason" of at least 10 characters. It is written to the audit trail, and\n' +
      "in six months it is the only thing that will explain this change.",
  );
}

if (!Array.isArray(plan.rows) || plan.rows.length === 0) {
  fail('Plan needs a non-empty "rows" array.');
}

if (plan.rows.length > maxRows) {
  fail(
    `Plan has ${plan.rows.length} rows, over the ${maxRows}-row ceiling.\n` +
      "Pass --max explicitly if that many rows is genuinely intended.",
  );
}

if (operation.feeImpact && !allowFeeImpact) {
  fail(
    `Operation "${plan.operation}" changes what families owe.\n\n` +
      `  ${operation.followUp ?? ""}\n\n` +
      "Re-run with --allow-fee-impact once you have read that.",
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  fail(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Resolving a whole session's rows needs the service role — RLS returns nothing without a staff session.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }

  const widths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => String(column.get(row)).length)),
  );

  const line = (cells) =>
    cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");

  console.log(`  ${line(columns.map((column) => column.header))}`);
  console.log(`  ${line(widths.map((width) => "-".repeat(width)))}`);

  for (const row of rows) {
    console.log(`  ${line(columns.map((column) => column.get(row)))}`);
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function display(operation, context, column, value) {
  if (operation.render && operation.writable.includes(column)) {
    return operation.render(context, value);
  }
  if (value === null || value === undefined) {
    return "(empty)";
  }
  return String(value);
}

/**
 * Turn the plan's rows into concrete column writes, resolving anything the plan
 * expressed in staff language (a class name, a route code) into the id the
 * database actually stores.
 */
async function buildChanges(context) {
  const changes = [];
  const unmatched = [];
  const rejected = [];

  for (const [index, planRow] of plan.rows.entries()) {
    const key = planRow[operation.matchColumn];

    if (!key) {
      rejected.push({ index, key: "(missing)", why: `row has no "${operation.matchColumn}"` });
      continue;
    }

    const current = context.byKey.get(key);

    if (!current) {
      unmatched.push({ key, why: context.missingNote ?? `not in session ${sessionLabel}` });
      continue;
    }

    const set = planRow.set;

    if (!set || typeof set !== "object" || Object.keys(set).length === 0) {
      rejected.push({ index, key, why: 'row has no "set" object' });
      continue;
    }

    const patch = {};
    const shown = [];
    let rowRejected = false;

    for (const [rawColumn, rawValue] of Object.entries(set)) {
      const column = operation.virtualColumns?.[rawColumn] ?? rawColumn;

      if (!operation.writable.includes(column)) {
        rejected.push({
          index,
          key,
          why: `"${rawColumn}" is not writable by ${plan.operation}`,
        });
        rowRejected = true;
        break;
      }

      let value = rawValue;

      if (operation.prepare && operation.virtualColumns?.[rawColumn]) {
        try {
          value = await operation.prepare({ context, value: rawValue, sessionLabel });
        } catch (error) {
          rejected.push({ index, key, why: error.message });
          rowRejected = true;
          break;
        }
      }

      const allowed = operation.allowedValues?.[column];

      if (allowed && value !== null && !allowed.includes(value)) {
        rejected.push({
          index,
          key,
          why: `"${value}" is not a valid ${column} (${allowed.join(" | ")})`,
        });
        rowRejected = true;
        break;
      }

      if (current[column] === value) {
        continue;
      }

      patch[column] = value;
      shown.push({
        column: rawColumn,
        from: display(operation, context, column, current[column]),
        to: display(operation, context, column, value),
      });
    }

    if (rowRejected || Object.keys(patch).length === 0) {
      continue;
    }

    changes.push({ key, id: current.id, current, patch, shown });
  }

  return { changes, unmatched, rejected };
}

async function main() {
  console.log(`\n## Bulk apply — ${plan.operation} — ${sessionLabel}${apply ? "" : " (dry run)"}\n`);
  console.log(`  Plan:   ${planPath}`);
  console.log(`  Reason: ${plan.reason}`);
  console.log(`  Table:  ${operation.table}`);
  console.log(`  Rows:   ${plan.rows.length} requested\n`);

  const context = await operation.resolve(supabase, sessionLabel);
  const { changes, unmatched, rejected } = await buildChanges(context);

  if (rejected.length > 0) {
    console.log("### Rejected rows — the plan is wrong, not the data\n");
    printTable(rejected, [
      { header: "#", get: (row) => row.index + 1 },
      { header: operation.matchColumn, get: (row) => row.key },
      { header: "Why", get: (row) => row.why },
    ]);
    console.log("");
    fail(`${rejected.length} row(s) rejected. Nothing was written. Fix the plan and re-run.`);
  }

  if (unmatched.length > 0) {
    console.log("### Not found — skipped\n");
    printTable(unmatched, [
      { header: operation.matchColumn, get: (row) => row.key },
      { header: "Why", get: (row) => row.why },
    ]);
    console.log("");
  }

  if (changes.length === 0) {
    console.log("Nothing to change — every row already holds the requested values.\n");
    return;
  }

  console.log(`### Diff — ${changes.length} row(s) would change\n`);
  printTable(
    changes.flatMap((change) =>
      change.shown.map((cell) => ({ key: change.key, ...cell })),
    ),
    [
      { header: operation.matchColumn, get: (row) => row.key },
      { header: "Column", get: (row) => row.column },
      { header: "From", get: (row) => row.from },
      { header: "To", get: (row) => row.to },
    ],
  );

  if (operation.feeImpact) {
    console.log(`\n  ⚠  This changes what families owe.\n  ${operation.followUp}`);
  }

  if (!apply) {
    console.log("\nDry run — nothing was written. Re-run with --apply once the diff above is right.\n");
    return;
  }

  if (sessionLabel === LIVE_SESSION_LABEL) {
    console.log(`\n  ⚠  Writing to the LIVE session ${LIVE_SESSION_LABEL}.\n`);
  }

  const runId = randomUUID();
  console.log(`\nApplying ${changes.length} row(s) … (run ${runId})\n`);

  const outcomes = await mapWithConcurrency(changes, APPLY_CONCURRENCY, async (change) => {
    const { error } = await supabase
      .from(operation.table)
      .update(change.patch)
      .eq("id", change.id);

    if (error) {
      return { key: change.key, ok: false, why: error.message };
    }

    // `recordActivity()` returns early without a userId, so a headless write is
    // invisible in the Activity feed. Write the trail here instead, or the
    // change has no author at all.
    const before = {};
    for (const column of Object.keys(change.patch)) {
      before[column] = change.current[column] ?? null;
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      table_name: operation.table,
      record_id: change.id,
      action: "update",
      before_data: before,
      after_data: {
        ...change.patch,
        _bulk_apply: {
          runId,
          operation: plan.operation,
          sessionLabel,
          reason: plan.reason,
          actor,
        },
      },
      changed_by: null,
    });

    if (auditError) {
      return { key: change.key, ok: false, why: `written, but audit failed: ${auditError.message}` };
    }

    return { key: change.key, ok: true };
  });

  const failed = outcomes.filter((outcome) => !outcome.ok);
  const succeeded = outcomes.length - failed.length;

  console.log(`Applied ${succeeded} of ${outcomes.length}.`);

  if (failed.length > 0) {
    console.log("\n### Failed\n");
    printTable(failed, [
      { header: operation.matchColumn, get: (row) => row.key },
      { header: "Why", get: (row) => row.why },
    ]);
  }

  // Re-measure. A repair that cannot verify itself is not a repair.
  const after = await operation.resolve(supabase, sessionLabel);
  const stillWrong = [];

  for (const change of changes) {
    const current = after.byKey.get(change.key);

    for (const [column, value] of Object.entries(change.patch)) {
      if (!current || current[column] !== value) {
        stillWrong.push({
          key: change.key,
          column,
          expected: display(operation, after, column, value),
          actual: current ? display(operation, after, column, current[column]) : "(row gone)",
        });
      }
    }
  }

  console.log("\n### Re-read after applying\n");

  if (stillWrong.length === 0) {
    console.log("  Every changed row now holds the requested value.");
  } else {
    printTable(stillWrong, [
      { header: operation.matchColumn, get: (row) => row.key },
      { header: "Column", get: (row) => row.column },
      { header: "Expected", get: (row) => row.expected },
      { header: "Actual", get: (row) => row.actual },
    ]);
  }

  if (operation.followUp) {
    console.log(`\n### Still to do\n\n  ${operation.followUp}`);
  }

  console.log("");

  if (failed.length > 0 || stillWrong.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
