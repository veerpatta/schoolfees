import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

/**
 * Report — and optionally repair — students whose fee ledger disagrees with
 * their resolved fee policy.
 *
 * Two bugs produced the drift:
 *
 *   1. `v_workbook_student_financials` could not see conventional discounts
 *      (RTE / Staff Child / 3rd Child). Fixed by migration 20260807120000 —
 *      a view change, no data repair needed.
 *   2. A discount applied to a student who had ALREADY PAID was silently
 *      discarded: every installment carrying money was frozen and the plan
 *      thrown away. Those students still owe the pre-discount amount.
 *
 * RUN ORDER MATTERS. Before migration 20260807120000 this script flags students
 * because the VIEW is wrong; after it, only students whose LEDGER is wrong. The
 * numbers move for two different reasons — run the migration first.
 *
 * Read-only by default. `--apply` posts to the repair route, which re-runs the
 * real fee engine (a SQL reimplementation would be a second engine, free to
 * drift from the first).
 *
 *   node scripts/repair-discount-drift.mjs --session 2026-27
 *   node scripts/repair-discount-drift.mjs --session 2026-27 --apply
 *
 * `--apply` needs CRON_SECRET and, unless --url is given, NEXT_PUBLIC_SITE_URL.
 */

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
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

const sessionLabel = readFlag("session", "2026-27");
const apply = process.argv.includes("--apply");
// Repair only the students whose dues would GO DOWN. The increases are a
// different decision — on this data they are hand-written settlements, not
// stale ledgers — so they never ride along with a discount repair.
const onlyDecreases = process.argv.includes("--only-decreases");
const baseUrl = readFlag("url", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. The drift query reads every active student, so it needs the service role.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rupees = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

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

/**
 * Current-year installment net per student, EXCLUDING carry-forward rows.
 *
 * Carry-forward lines are a deliberate prior-year balance carried into this
 * session, not part of the current policy total. Counting them flags every
 * student with previous-year dues as drifted — which is how a first pass
 * produced 104 false positives against 31 real ones.
 */
async function loadLedgerNet(studentIds) {
  const byStudent = new Map();

  for (let index = 0; index < studentIds.length; index += 200) {
    const slice = studentIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("installments")
      .select("student_id, amount_due, is_carry_forward")
      .in("student_id", slice)
      .neq("status", "cancelled");

    if (error) {
      throw new Error(`Unable to read installments: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (row.is_carry_forward) {
        continue;
      }
      byStudent.set(row.student_id, (byStudent.get(row.student_id) ?? 0) + Number(row.amount_due ?? 0));
    }
  }

  return byStudent;
}

async function findDrift() {
  const { data, error } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, admission_no, student_name, class_label, gross_base_before_discount, discount_amount",
    )
    .eq("session_label", sessionLabel)
    .eq("record_status", "active");

  if (error) {
    throw new Error(`Unable to read financials: ${error.message}`);
  }

  const rows = data ?? [];
  const ledgerNet = await loadLedgerNet(rows.map((row) => row.student_id));

  return rows
    .filter((row) => ledgerNet.has(row.student_id))
    .map((row) => {
      const viewNet = Number(row.gross_base_before_discount ?? 0) - Number(row.discount_amount ?? 0);
      const actual = ledgerNet.get(row.student_id) ?? 0;
      return { ...row, viewNet, ledgerNet: actual, drift: viewNet - actual };
    })
    .filter((row) => row.drift !== 0)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

async function main() {
  console.log(`\n## Discount drift — ${sessionLabel}${apply ? "" : " (dry run)"}\n`);

  const drifted = await findDrift();

  if (drifted.length === 0) {
    console.log("No drift. Every active student's ledger matches their resolved fee policy.\n");
    return;
  }

  printTable(drifted, [
    { header: "SR", get: (row) => row.admission_no ?? "" },
    { header: "Name", get: (row) => row.student_name ?? "" },
    { header: "Class", get: (row) => row.class_label ?? "" },
    { header: "Policy says", get: (row) => rupees(row.viewNet) },
    { header: "Ledger has", get: (row) => rupees(row.ledgerNet) },
    { header: "Drift", get: (row) => rupees(row.drift) },
  ]);

  // drift = what the policy says - what the ledger holds.
  //   drift < 0 → the ledger is charging MORE than the policy. Repairing LOWERS
  //               the parent's dues. This is the discount-never-landed case.
  //   drift > 0 → the ledger is charging LESS than the policy. Repairing RAISES
  //               the parent's dues, which is never a silent operation.
  const duesWouldFall = drifted.filter((row) => row.drift < 0);
  const duesWouldRise = drifted.filter((row) => row.drift > 0);

  console.log(`\n${drifted.length} student(s) drifted.`);
  console.log(
    `  ${duesWouldFall.length} would see dues GO DOWN by ${rupees(
      duesWouldFall.reduce((sum, row) => sum + Math.abs(row.drift), 0),
    )} — a discount that never landed.`,
  );
  console.log(
    `  ${duesWouldRise.length} would see dues GO UP by ${rupees(
      duesWouldRise.reduce((sum, row) => sum + row.drift, 0),
    )} — ledger below current policy.`,
  );

  if (duesWouldRise.length > 0) {
    console.log(
      "\n  ⚠  Raising a parent's dues is not a silent repair. Review these before --apply:",
    );
    printTable(duesWouldRise, [
      { header: "SR", get: (row) => row.admission_no ?? "" },
      { header: "Name", get: (row) => row.student_name ?? "" },
      { header: "Class", get: (row) => row.class_label ?? "" },
      { header: "Increase", get: (row) => rupees(row.drift) },
    ]);
  }

  if (!apply) {
    console.log("\nDry run — nothing was written. Re-run with --apply to repair.\n");
    return;
  }

  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    console.error("\nCRON_SECRET is required for --apply.\n");
    process.exit(1);
  }

  console.log(`\nApplying via ${baseUrl}/api/admin/repair-discount-drift …\n`);

  const response = await fetch(`${baseUrl}/api/admin/repair-discount-drift`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ sessionLabel, dryRun: false, onlyDecreases }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    console.error(`Repair failed: ${payload.error ?? response.statusText}\n`);
    process.exit(1);
  }

  console.log(
    `Applied: ${payload.applied.installmentsToUpdate} updated, ` +
      `${payload.applied.installmentsToInsert} inserted, ` +
      `${payload.applied.lockedInstallments} kept for review.`,
  );

  if (payload.skippedIncreases?.length) {
    console.log(
      `
Skipped ${payload.skippedIncreases.length} student(s) whose dues would have gone UP. ` +
        "Review them before deciding.",
    );
  }

  if (payload.residualCreditStudents?.length) {
    console.log("\n## Now refundable (discount exceeded the balance)\n");
    printTable(payload.residualCreditStudents, [
      { header: "SR", get: (row) => row.admissionNo },
      { header: "Name", get: (row) => row.fullName },
      { header: "Credit", get: (row) => rupees(row.residualCreditAmount) },
    ]);
    console.log("\n  Settle these in Finance Controls → Refunds.");
  }

  console.log("\n## Still drifted after repair\n");
  printTable(payload.remaining ?? [], [
    { header: "SR", get: (row) => row.admission_no },
    { header: "Name", get: (row) => row.student_name },
    { header: "Drift", get: (row) => rupees(row.drift) },
  ]);
  console.log("");
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
