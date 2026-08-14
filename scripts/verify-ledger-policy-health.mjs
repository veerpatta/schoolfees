import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

/**
 * Ledger-vs-policy health check.
 *
 * `v_workbook_student_financials` documents an identity that every active
 * student is supposed to satisfy:
 *
 *     gross_base_before_discount - discount_amount = base_charge_total
 *
 * Nothing enforced it, and when it broke it broke quietly. A bus route added
 * mid-year to a student who had already paid could not be written to any
 * installment -- the rise was dropped, no row changed, nothing was flagged, and
 * the ledger simply asked for less than the policy said. Eight students carried
 * Rs 54,225 of unbilled transport that way for three months, and the only
 * reason anyone found it was a hand-written audit.
 *
 * This script asserts the invariants that make the outstanding figure mean
 * something:
 *
 *   1. Ledger net equals policy net, student by student.
 *   2. Every active student has a ledger at all. The older drift detector
 *      skipped students with no installments entirely, so "dues never prepared"
 *      could hide behind "no drift".
 *   3. No installment points at a class the student has left. Free to miss
 *      whenever the old and new class price the same -- until one of them
 *      changes, and then it is a silent mis-bill.
 *   4. Same for carry-forward and EMI late-fee rows, which every regeneration
 *      sweep deliberately skips, so they stay stale until somebody moves them
 *      by hand.
 *   5. `installments.transport_amount` is 0 throughout. In workbook mode
 *      transport is folded into `base_amount` and that column is dead. It is
 *      asserted here so nobody builds a transport report on a column that
 *      returns zero for the whole school.
 *
 * Usage:
 *   node scripts/verify-ledger-policy-health.mjs                     # active session
 *   node scripts/verify-ledger-policy-health.mjs --session TEST-2026-27
 *   node scripts/verify-ledger-policy-health.mjs --json              # machine-readable
 *
 * Exits 1 if any invariant fails, so it can gate a deploy.
 */

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

// The service role, not the publishable key. `v_ledger_policy_drift` is a
// security_invoker view over `installments`, so an anon read is filtered by RLS
// to nothing at all -- which would report a perfectly clean school.
const missingEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missingEnv.length > 0) {
  console.error(`Missing required env vars: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const asJson = process.argv.includes("--json");
const sessionFlagIndex = process.argv.indexOf("--session");
const requestedSession =
  sessionFlagIndex >= 0 ? process.argv[sessionFlagIndex + 1]?.trim() : undefined;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const rupees = (value) => `Rs ${Math.round(Number(value)).toLocaleString("en-IN")}`;
const checks = [];

function record(name, ok, detail, offenders = []) {
  checks.push({ name, ok, detail, offenders, severity: "invariant" });
}

/**
 * Reported, but does not fail the run.
 *
 * For things that are inconsistent without being wrong. The exit code gates
 * deploys, so spending it on a condition where every rupee still adds up would
 * only teach people to pass --json and grep.
 */
function note(name, ok, detail, offenders = []) {
  checks.push({ name, ok, detail, offenders, severity: "note" });
}

async function resolveSessionLabel() {
  if (requestedSession) return requestedSession;

  const { data, error } = await supabase
    .from("fee_policy_configs")
    .select("academic_session_label")
    .eq("calculation_model", "workbook_v1")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data?.[0]?.academic_session_label) {
    console.error(
      `Could not resolve the active session${error ? `: ${error.message}` : ""}. Pass --session.`,
    );
    process.exit(1);
  }

  return data[0].academic_session_label;
}

const sessionLabel = await resolveSessionLabel();

async function fetchAll(table, columns, apply) {
  const pageSize = 1000;
  const rows = [];

  for (let page = 0; ; page += 1) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (apply) query = apply(query);

    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);

    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

// ── The data ───────────────────────────────────────────────────────────────
const students = await fetchAll(
  "v_ledger_policy_drift",
  "student_id, admission_no, student_name, class_label, policy_net, ledger_net, drift, has_ledger, stale_class_rows, stale_class_locked_rows",
  (query) => query.eq("session_label", sessionLabel),
);

const describe = (row) =>
  `${row.admission_no ?? "?"} ${row.student_name ?? ""} (${row.class_label ?? "?"})`;

// ── 1. The ledger charges what the policy says ─────────────────────────────
// Split by direction, because they are different failures with different
// consequences. drift > 0 means the school is billing LESS than its own policy
// -- money it never asked for. drift < 0 means a discount that was decided but
// never landed, so a family is being asked for more than was agreed.
{
  const withLedger = students.filter((row) => row.has_ledger);
  const under = withLedger.filter((row) => Number(row.drift) > 0);
  const over = withLedger.filter((row) => Number(row.drift) < 0);
  const offenders = [...under, ...over].sort(
    (a, b) => Math.abs(Number(b.drift)) - Math.abs(Number(a.drift)),
  );

  record(
    "ledger net equals policy net",
    offenders.length === 0,
    offenders.length === 0
      ? `${withLedger.length} student ledger(s) agree with their fee policy`
      : `${under.length} under-billed by ${rupees(
          under.reduce((total, row) => total + Number(row.drift), 0),
        )}, ${over.length} over-billed by ${rupees(
          over.reduce((total, row) => total - Number(row.drift), 0),
        )}`,
    offenders.map(
      (row) =>
        `${describe(row)}: policy ${rupees(row.policy_net)}, ledger ${rupees(
          row.ledger_net,
        )}, ${Number(row.drift) > 0 ? "under" : "over"} by ${rupees(Math.abs(Number(row.drift)))}`,
    ),
  );
}

// ── 2. Every active student has a ledger ───────────────────────────────────
{
  const offenders = students.filter((row) => !row.has_ledger);

  record(
    "every active student has dues prepared",
    offenders.length === 0,
    offenders.length === 0
      ? `all ${students.length} active student(s) have installment rows`
      : `${offenders.length} active student(s) have no installments at all`,
    offenders.map((row) => `${describe(row)}: policy says ${rupees(row.policy_net)}, ledger empty`),
  );
}

// ── 3. No installment points at a class the student has left ───────────────
// `installments.class_id` decides which class a charge is reported under. When
// a student moves and the row does not, every per-class board bills the money
// to the wrong class -- and if the two classes happen to charge the same, the
// amount looks right and nothing ever surfaces it.
{
  const offenders = students.filter((row) => Number(row.stale_class_rows) > 0);

  record(
    "installments point at the student's current class",
    offenders.length === 0,
    offenders.length === 0
      ? "0 installment(s) filed under a class the student has left"
      : `${offenders.length} student(s) with installments filed under a former class`,
    offenders.map((row) => `${describe(row)}: ${row.stale_class_rows} row(s) — re-run the ledger`),
  );
}

// ── 4. …including the rows regeneration never touches ──────────────────────
// Carry-forward (installment_no >= 90) and EMI late-fee (101-199) rows are
// filtered out of every regeneration sweep on purpose, so a stale class here is
// permanent until somebody moves it by hand.
{
  const offenders = students.filter((row) => Number(row.stale_class_locked_rows) > 0);

  record(
    "carry-forward and EMI rows point at the current class",
    offenders.length === 0,
    offenders.length === 0
      ? "0 carry-forward/EMI row(s) filed under a former class"
      : `${offenders.length} student(s) — regeneration will NOT fix these`,
    offenders.map(
      (row) => `${describe(row)}: ${row.stale_class_locked_rows} row(s) — needs a targeted update`,
    ),
  );
}

// ── 5. One row shape: transport lives in base_amount ───────────────────────
// Workbook mode folds transport into `base_amount` and writes
// `transport_amount = 0` (lib/fees/generator.ts). Rows written before the
// 20260423093000 cut-over kept transport in its own column, and 20260814100000
// folded the last of them in.
//
// No money rides on this — `amount_due` is generated from
// `base + transport - discount`, so which column holds the transport cannot
// change what a family owes. It is asserted because the column is a trap for
// whoever writes the next report: when it is neither reliably zero nor reliably
// the transport fee, `sum(transport_amount)` returns a number that looks like
// transport income, is not, and would be believed.
//
// Scoped to workbook sessions. The legacy branch of the generator still exists
// and would legitimately write a non-zero transport_amount on a session with
// `calculation_model = 'standard'`, so failing that would be wrong.
{
  const { data: policy } = await supabase
    .from("fee_policy_configs")
    .select("calculation_model")
    .eq("academic_session_label", sessionLabel)
    .limit(1);
  const isWorkbook = policy?.[0]?.calculation_model === "workbook_v1";

  if (!isWorkbook) {
    note(
      "transport lives in base_amount, not transport_amount",
      true,
      `${sessionLabel} is not a workbook session — the split column is expected here`,
    );
  } else {
    const rows = await fetchAll(
      "installments",
      "id, student_id, transport_amount, classes!inner(session_label)",
      (query) =>
        query
          .eq("classes.session_label", sessionLabel)
          .neq("status", "cancelled")
          .gt("transport_amount", 0),
    );
    const affected = new Set(rows.map((row) => row.student_id));
    const total = rows.reduce((sum, row) => sum + Number(row.transport_amount ?? 0), 0);

    record(
      "transport lives in base_amount, not transport_amount",
      rows.length === 0,
      rows.length === 0
        ? "transport_amount is 0 throughout, as workbook mode requires"
        : `${rows.length} row(s) across ${affected.size} student(s) carry transport in the legacy column (${rupees(
            total,
          )}). Totals are unaffected; the column split is not.`,
      rows.slice(0, 10).map((row) => `${row.id}: transport_amount ${row.transport_amount}`),
    );
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const failed = checks.filter((check) => !check.ok && check.severity === "invariant");

if (asJson) {
  console.log(JSON.stringify({ sessionLabel, checks, ok: failed.length === 0 }, null, 2));
} else {
  console.log(`\nLedger-vs-policy health -- ${sessionLabel}`);
  console.log(`${students.length} active student(s) in this session\n`);

  for (const check of checks) {
    const status = check.ok ? "PASS" : check.severity === "note" ? "NOTE" : "FAIL";
    console.log(`${status}  ${check.name}`);
    console.log(`      ${check.detail}`);
    for (const offender of check.offenders.slice(0, 10)) console.log(`        - ${offender}`);
    if (check.offenders.length > 10) {
      console.log(`        ... and ${check.offenders.length - 10} more`);
    }
  }

  console.log(
    failed.length === 0
      ? "\nEvery ledger agrees with its fee policy.\n"
      : `\n${failed.length} invariant(s) broken.\n`,
  );
}

process.exit(failed.length === 0 ? 0 : 1);
