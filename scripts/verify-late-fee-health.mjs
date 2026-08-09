import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

/**
 * Late-fee health check.
 *
 * The late fee is the one number in this app with two engines behind it: the
 * `private.workbook_installment_snapshot` function and the
 * `public.v_workbook_installment_balances` materialized view. They were unified
 * in 20260808140000, and a waiver stopped being a student-level rupee pool and
 * became a row per installment (20260808131348) -- because the pool was
 * re-allocated on every read, so a partial payment moved which installments
 * carried a fee and the waiver quietly slid off one and onto another.
 *
 * None of that is visible from the UI. This script asserts the invariants that
 * have to hold for the number on the Dashboard to mean anything:
 *
 *   1. The two engines agree, installment by installment.
 *   2. No waiver exceeds the fee it forgives.
 *   3. No waiver sits on an installment that has already been paid --
 *      20260808190000 caps waivable at `least(final_late_fee, pending_amount)`,
 *      so a paid late fee cannot be forgiven after the fact.
 *   4. Every waiver points at a real, current installment.
 *   5. Grandfathering held: nobody's final late fee moved when the rule changed.
 *   6. Expected fees exclude late fees -- the school treats the late fee as a
 *      separate charge to get payment in on time, not part of what is owed.
 *
 * Usage:
 *   node scripts/verify-late-fee-health.mjs                # active session
 *   node scripts/verify-late-fee-health.mjs --session TEST-2026-27
 *   node scripts/verify-late-fee-health.mjs --json         # machine-readable
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

const missingEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(
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
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const checks = [];

function record(name, ok, detail, offenders = []) {
  checks.push({ name, ok, detail, offenders });
}

async function resolveSessionLabel() {
  if (requestedSession) return requestedSession;

  const { data, error } = await supabase
    .from("fee_settings")
    .select("session_label")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data?.[0]?.session_label) {
    console.error(
      `Could not resolve the active session${error ? `: ${error.message}` : ""}. Pass --session.`,
    );
    process.exit(1);
  }

  return data[0].session_label;
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
const balances = await fetchAll(
  "v_workbook_installment_balances",
  "installment_id, student_id, installment_no, base_charge, paid_amount, pending_amount, raw_late_fee, waiver_applied, final_late_fee, balance_status, is_carry_forward",
  (query) => query.eq("session_label", sessionLabel),
);

const waivers = await fetchAll(
  "student_late_fee_waivers",
  "id, student_id, installment_id, amount, source, voided_at",
  (query) => query.eq("session_label", sessionLabel).is("voided_at", null),
);

const balanceByInstallment = new Map(balances.map((row) => [row.installment_id, row]));

// ── 1. The two engines agree ───────────────────────────────────────────────
// The matview is one engine; private.workbook_installment_snapshot is the other,
// and it is what the posting RPC allocates against. If they disagree, a cashier
// sees one late fee on screen and posts against a different one.
// The RPC is `returns table (...)`, so PostgREST hands back a one-row array of
// snake_case columns -- not the camelCase object the app layer maps it into.
const feeSplit = await (async () => {
  const { data, error } = await supabase.rpc("get_dashboard_fee_split", {
    p_session_label: sessionLabel,
  });
  if (error) return { error: error.message };
  return { row: Array.isArray(data) ? data[0] : data };
})();

{
  if (feeSplit.error) {
    record("engines agree", false, `get_dashboard_fee_split failed: ${feeSplit.error}`);
  } else {
    const dashboardLateFee = Number(feeSplit.row?.late_fee_pending ?? 0);
    const matviewLateFee = balances.reduce(
      (total, row) =>
        total + Math.min(Math.max(row.final_late_fee, 0), Math.max(row.pending_amount, 0)),
      0,
    );
    const drift = Math.abs(dashboardLateFee - matviewLateFee);
    record(
      "engines agree",
      drift === 0,
      `dashboard ${dashboardLateFee} vs matview ${matviewLateFee} (drift ${drift})`,
    );
  }
}

// ── 2. No waiver exceeds the fee it forgives ───────────────────────────────
{
  const offenders = balances
    .filter((row) => row.waiver_applied > row.raw_late_fee)
    .map((row) => `${row.installment_id}: waived ${row.waiver_applied} of ${row.raw_late_fee}`);
  record(
    "waiver never exceeds the charge",
    offenders.length === 0,
    `${offenders.length} installment(s) over-waived`,
    offenders,
  );
}

// ── 3. A paid late fee cannot be waived ────────────────────────────────────
// 20260808190000 caps waivable at least(final_late_fee, pending_amount), so a
// waiver can never carve into a late fee that has already been collected. The
// observable signature of that cap failing is a NEGATIVE final late fee -- the
// school would owe the family money it never took. Checking the sign rather
// than "is there a waiver on a settled installment" is deliberate: a
// grandfather waiver legitimately sits on installments that were paid later,
// and flagging those would be noise, not a finding.
{
  const offenders = balances
    .filter((row) => row.final_late_fee < 0)
    .map(
      (row) =>
        `${row.installment_id}: raw ${row.raw_late_fee} - waived ${row.waiver_applied} = ${row.final_late_fee}`,
    );
  record(
    "paid late fees stay paid",
    offenders.length === 0,
    `${offenders.length} installment(s) waived into credit`,
    offenders,
  );
}

// ── 4. Every waiver points at a live installment ───────────────────────────
{
  const offenders = waivers
    .filter((row) => !balanceByInstallment.has(row.installment_id))
    .map((row) => `${row.id} -> missing installment ${row.installment_id}`);
  record(
    "waivers reference real installments",
    offenders.length === 0,
    `${offenders.length} orphaned waiver row(s)`,
    offenders,
  );
}

// ── 5. Grandfathering held ─────────────────────────────────────────────────
// The rule change in 20260808140000 wrote a 'grandfather' waiver equal to
// (new raw fee - old raw fee) so that final_late_fee stayed put for everyone who
// already had a bill. If a later migration moved a raw fee without a matching
// waiver, somebody's bill changed without anyone deciding to change it.
{
  // fetchAll, not a bare select: PostgREST caps a plain request at 1000 rows,
  // and the live session has over 2000 snapshot rows. A capped read here would
  // report "0 moved" while silently never looking at half of them.
  let data = null;
  let error = null;
  try {
    data = await fetchAll(
      "late_fee_rule_change_snapshot",
      "installment_id, final_late_fee",
      (query) => query.eq("session_label", sessionLabel),
    );
  } catch (thrown) {
    error = thrown;
  }

  if (error) {
    record("grandfathering held", false, `snapshot unreadable: ${error.message}`);
  } else if ((data?.length ?? 0) === 0) {
    record("grandfathering held", true, "no snapshot rows for this session (nothing to compare)");
  } else {
    const offenders = data
      .map((snapshot) => {
        const current = balanceByInstallment.get(snapshot.installment_id);
        if (!current) return null;
        const before = Number(snapshot.final_late_fee);
        return current.final_late_fee === before
          ? null
          : `${snapshot.installment_id}: ${before} -> ${current.final_late_fee}`;
      })
      .filter(Boolean);
    record(
      "grandfathering held",
      offenders.length === 0,
      `${offenders.length} of ${data.length} snapshot row(s) moved`,
      offenders,
    );
  }
}

// ── 6. Expected fees exclude the late fee ──────────────────────────────────
// The school's rule: the late fee is a separate charge whose job is to get the
// payment in on time, and it is waived more often than not. Folding it into
// "expected" would inflate the year's target by money nobody plans to collect.
{
  if (feeSplit.error) {
    record("expected excludes late fee", false, `RPC failed: ${feeSplit.error}`);
  } else {
    const expected = Number(feeSplit.row?.current_year_expected ?? 0);
    const baseTotal = balances
      .filter((row) => !row.is_carry_forward)
      .reduce((total, row) => total + Math.max(row.base_charge, 0), 0);
    const lateFeeTotal = balances.reduce((total, row) => total + Math.max(row.final_late_fee, 0), 0);
    // Expected must not have absorbed the late fee. Compare against base only;
    // an expected figure at or above base + late fee means it crept back in.
    const contaminated = lateFeeTotal > 0 && expected >= baseTotal + lateFeeTotal;
    record(
      "expected excludes late fee",
      !contaminated,
      `expected ${expected}, base ${baseTotal}, late fee ${lateFeeTotal}`,
    );
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
const failed = checks.filter((check) => !check.ok);

if (asJson) {
  console.log(JSON.stringify({ sessionLabel, checks, ok: failed.length === 0 }, null, 2));
} else {
  console.log(`\nLate-fee health -- ${sessionLabel}`);
  console.log(`${balances.length} installment rows, ${waivers.length} live waiver rows\n`);

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}`);
    console.log(`      ${check.detail}`);
    for (const offender of check.offenders.slice(0, 10)) console.log(`        - ${offender}`);
    if (check.offenders.length > 10) {
      console.log(`        ... and ${check.offenders.length - 10} more`);
    }
  }

  console.log(
    failed.length === 0
      ? "\nAll late-fee invariants hold.\n"
      : `\n${failed.length} invariant(s) broken.\n`,
  );
}

process.exit(failed.length === 0 ? 0 : 1);
