#!/usr/bin/env node
/**
 * What the deep harness left behind, and whether that is more than it promised.
 *
 * The ledger is append-only — a correction is a `payment_adjustment`, never a
 * delete — so there is no cleanup step and there should not be one: a test
 * harness that deletes from a financial table teaches exactly the wrong reflex,
 * and `src/modules/students/domain/delete-policy.ts` blocks a hard delete once a student has
 * receipts anyway.
 *
 * So the harness bounds its footprint instead, and this is the check. One
 * failure matters above the others: **a run over budget**. The write suite
 * posts six receipts. Seven means a retry created a second row rather than
 * resolving to the first, which means `client_request_id` dedup stopped
 * working — in production that is a family charged twice, and it is the single
 * most valuable thing this harness can catch.
 *
 * Attribution comes from the run's own write ledger
 * (`docs/smoke-reports/deep/<runId>/write-ledger.jsonl`) plus the manifest's
 * `startedAt`: receipts for the students that run touched, created since it
 * began. No marker column is needed, which matters because `receipts` has no
 * field the harness can safely stamp.
 *
 * Read-only, and it refuses the live session outright.
 *
 *   node scripts/verify-deep-test-footprint.mjs
 *   node scripts/verify-deep-test-footprint.mjs --json
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const at = trimmed.indexOf("=");
    const key = trimmed.slice(0, at).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sessionIndex = args.indexOf("--session");
const SESSION = sessionIndex >= 0 ? args[sessionIndex + 1] : "TEST-2026-27";
const LIVE_SESSION = "2026-27";

if (SESSION === LIVE_SESSION) {
  console.error("Refusing to audit the live session; this script is for TEST- ledgers.");
  process.exit(2);
}

/** Per run. The write suite's declared footprint. */
const BUDGET = { receipts: 6, students: 2 };

/** Total harness-created students before this becomes a housekeeping problem. */
const ACCUMULATION_CEILING = 500;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required " +
      "(they live in .env.local).",
  );
  process.exit(2);
}

async function select(table, query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

const RUN_ROOT = path.resolve(process.cwd(), "docs/smoke-reports/deep");

function readRuns() {
  if (!existsSync(RUN_ROOT)) return [];

  return readdirSync(RUN_ROOT)
    .map((runId) => {
      const dir = path.join(RUN_ROOT, runId);
      const manifestPath = path.join(dir, "manifest.json");
      const ledgerPath = path.join(dir, "write-ledger.jsonl");
      if (!existsSync(manifestPath) || !existsSync(ledgerPath)) return null;

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const entries = readFileSync(ledgerPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      // `note` is written as "<admissionNo> · ₹<amount> · <mode> · crid <uuid>".
      const admissionNumbers = new Set(
        entries
          .map((entry) => String(entry.note ?? "").split(" ")[0].trim())
          .filter((value) => /^TEST-/i.test(value)),
      );

      return { runId, manifest, entries, admissionNumbers: [...admissionNumbers] };
    })
    .filter(Boolean);
}

async function main() {
  const failures = [];
  const runs = readRuns();
  const perRun = [];

  for (const run of runs) {
    if (run.admissionNumbers.length === 0) continue;

    const inList = run.admissionNumbers.map((value) => `"${value}"`).join(",");
    const students = await select(
      "students",
      `select=id,admission_no&admission_no=in.(${encodeURIComponent(inList)})`,
    );

    if (students.length === 0) {
      failures.push(
        `Run ${run.runId} names ${run.admissionNumbers.length} student(s) that no longer exist.`,
      );
      continue;
    }

    const ids = students.map((student) => `"${student.id}"`).join(",");
    const receipts = await select(
      "receipts",
      `select=id,receipt_number,student_id,created_at,client_request_id` +
        `&student_id=in.(${encodeURIComponent(ids)})` +
        `&created_at=gte.${encodeURIComponent(run.manifest.startedAt)}` +
        `&limit=500`,
    );

    const distinctKeys = new Set(
      receipts.map((receipt) => receipt.client_request_id).filter(Boolean),
    );

    perRun.push({
      runId: run.runId,
      target: run.manifest.target,
      startedAt: run.manifest.startedAt,
      studentsTouched: students.length,
      receiptsCreated: receipts.length,
      distinctRequestKeys: distinctKeys.size,
      declaredWrites: run.entries.length,
    });

    if (receipts.length > BUDGET.receipts) {
      failures.push(
        `Run ${run.runId} created ${receipts.length} receipts against a budget of ` +
          `${BUDGET.receipts}. A run over budget usually means client_request_id ` +
          "stopped deduping — the retry made a second receipt instead of resolving " +
          "to the first.",
      );
    }

    // Two receipts sharing one key would mean the dedup ran but did not link.
    if (distinctKeys.size < receipts.filter((r) => r.client_request_id).length) {
      failures.push(
        `Run ${run.runId} has receipts sharing a client_request_id — the dedup ` +
          "resolved to a key but still wrote a row.",
      );
    }
  }

  // Students the harness created, all-time, and whether any escaped the test session.
  const created = await select(
    "students",
    "select=id,admission_no,class_id&admission_no=like.TEST-DEEP-*&limit=2000",
  );

  if (created.length > 0) {
    const classIds = [...new Set(created.map((student) => student.class_id).filter(Boolean))];
    if (classIds.length > 0) {
      const inList = classIds.map((value) => `"${value}"`).join(",");
      const classes = await select(
        "classes",
        `select=id,session_label&id=in.(${encodeURIComponent(inList)})`,
      );
      const sessionByClass = new Map(classes.map((row) => [row.id, row.session_label]));

      for (const student of created) {
        const label = sessionByClass.get(student.class_id);
        if (label && label !== SESSION) {
          // The one that would matter: a harness-created student sitting in the
          // live year. Hard safety rule 6, caught after the fact.
          failures.push(
            `Harness student ${student.admission_no} is in session ${label}, not ${SESSION}.`,
          );
        }
      }
    }
  }

  const report = {
    session: SESSION,
    runsWithWrites: perRun.length,
    harnessStudents: created.length,
    accumulationCeiling: ACCUMULATION_CEILING,
    perRun,
    failures,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Deep-test footprint in ${SESSION}`);
    console.log(`  runs with writes: ${perRun.length}`);
    console.log(`  harness-created students: ${created.length}`);
    for (const run of perRun) {
      console.log(
        `  ${run.runId} (${run.target}): ${run.receiptsCreated} receipt(s), ` +
          `${run.distinctRequestKeys} distinct request key(s), ` +
          `${run.declaredWrites} declared`,
      );
    }
    if (perRun.length === 0) {
      console.log("  (no run has written anything yet)");
    }
  }

  if (created.length > ACCUMULATION_CEILING) {
    console.warn(
      `\n${created.length} accumulated harness students is past the ` +
        `${ACCUMULATION_CEILING} ceiling. Not a bug — a reminder that the test ` +
        "ledger is drifting from the shapes docs/qa/smoke-test-data.md describes.",
    );
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} footprint failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("\nFootprint within budget.");
}

main().catch((error) => {
  console.error(`verify-deep-test-footprint failed: ${error.message}`);
  process.exit(2);
});
