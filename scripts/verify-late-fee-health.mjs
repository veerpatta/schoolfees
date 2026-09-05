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
 *   3. No final late fee has gone negative. This used to read "no waiver sits
 *      on an installment that has already been paid", which 20260826120000
 *      makes untrue on purpose: an admin may now forgive a late fee the family
 *      HAS paid, and the released money comes back to them as dues relief. The
 *      arithmetic check is unchanged -- a waiver is capped at the charge, so
 *      `greatest(raw - waiver, 0)` can never go below zero -- and invariant 9
 *      is what actually watches the new case.
 *   4. Every waiver points at a real, current installment.
 *   5. Grandfathering held: nobody's final late fee moved when the rule changed.
 *   6. Expected fees exclude late fees -- the school treats the late fee as a
 *      separate charge to get payment in on time, not part of what is owed.
 *   7. Fees and late fee stay in their own columns and still add up.
 *   8. Every chargeable installment carries a late-fee rate.
 *   9. Nothing a waiver released has gone missing: per student, what the
 *      per-installment engine says is owed equals total charge minus everything
 *      settled. This is the check that earns 20260826120000 -- forgiving a
 *      collected late fee is only honest if the money it frees actually lands
 *      on the next installments.
 *  10. Money settles the installments oldest-first (20260905064847): no row
 *      carries money while a row ahead of it in the pool's order still owes.
 *      A later installment reading "Paid" beside an earlier one reading
 *      "Overdue" is exactly the picture SR 660 showed, and it is never right.
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
  "installment_id, student_id, session_label, installment_no, base_charge, paid_amount, applied_amount, discount_closeout_amount, settled_amount, total_charge, pending_amount, late_fee_pending, total_pending, raw_late_fee, waiver_applied, final_late_fee, balance_status, late_fee_status, is_carry_forward, settlement_rank",
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
    // late_fee_pending is a real column since 20260812120000. It used to be
    // spelled least(final_late_fee, pending_amount), which worked only while
    // pending_amount still had the late fee inside it -- once pending_amount
    // became fees-only that expression read 0 for every family whose fees were
    // clear, which is most of the people who actually still owe a late fee.
    const matviewLateFee = balances.reduce(
      (total, row) => total + Math.max(row.late_fee_pending, 0),
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

// NOTE (20260812140000): this check compares against the 2026-08-08 snapshot to
// prove THE RULE CHANGE did not raise anyone's bill. A row whose
// late_fee_flat_amount was 0 at the cut-over and has since been corrected is a
// different event, and correcting a rate is allowed to raise a bill -- that is
// what correcting it means. Such a row is excluded below: it shows in the
// snapshot as raw_late_fee 0 on an installment that was already past due, which
// can only mean the rate was 0 then.
const CUT_OVER_DATE = "2026-08-08";

// ── 5. Grandfathering held ─────────────────────────────────────────────────
// The rule change in 20260808140000 wrote a 'grandfather' waiver equal to
// (new raw fee - old raw fee) so that final_late_fee stayed put for everyone who
// already had a bill. 20260905064847 did the same when settlement became
// pooled oldest-first, and wrote its own snapshot. If a later migration moved a
// raw fee without a matching waiver, somebody's bill changed without anyone
// deciding to change it.
//
// The NEWER snapshot is the baseline wherever it has a row: the pooled cut-over
// may legitimately have LOWERED a late fee (money dated before a due date that
// a regeneration had pinned to a later row), and that release is not drift.
{
  // fetchAll, not a bare select: PostgREST caps a plain request at 1000 rows,
  // and the live session has over 2000 snapshot rows. A capped read here would
  // report "0 moved" while silently never looking at half of them.
  let data = null;
  let error = null;
  try {
    const older = await fetchAll(
      "late_fee_rule_change_snapshot",
      "installment_id, final_late_fee, raw_late_fee, due_date, base_charge, applied_amount",
      (query) => query.eq("session_label", sessionLabel),
    );
    let newer = [];
    try {
      newer = await fetchAll(
        "settlement_pool_change_snapshot",
        "installment_id, final_late_fee, raw_late_fee, due_date, base_charge, applied_amount",
        (query) => query.eq("session_label", sessionLabel),
      );
    } catch {
      // Not applied yet: the older snapshot alone is the baseline.
      newer = [];
    }
    const newerById = new Map(newer.map((row) => [row.installment_id, row]));
    data = [
      ...older.map((row) => newerById.get(row.installment_id) ?? row),
      ...newer.filter((row) => !older.some((old) => old.installment_id === row.installment_id)),
    ];
  } catch (thrown) {
    error = thrown;
  }

  if (error) {
    record("grandfathering held", false, `snapshot unreadable: ${error.message}`);
  } else if ((data?.length ?? 0) === 0) {
    record("grandfathering held", true, "no snapshot rows for this session (nothing to compare)");
  } else {
    // Rows whose rate was 0 at the cut-over. Past its due date, still owing
    // base, and charging nothing: under the unified rule that combination is
    // impossible unless no rate was set. Their rate has since been corrected,
    // which is allowed to raise the bill. See CUT_OVER_DATE above. The
    // applied < base term matters -- without it this also swallows every row
    // that was legitimately settled on time, which was 986 of 2116.
    const rateFixedLater = new Set(
      data
        .filter(
          (snapshot) =>
            Number(snapshot.raw_late_fee) === 0 &&
            String(snapshot.due_date) < CUT_OVER_DATE &&
            Number(snapshot.applied_amount) < Number(snapshot.base_charge),
        )
        .map((snapshot) => snapshot.installment_id),
    );

    // A waiver granted AFTER the cut-over lowers final_late_fee, and that is a
    // person deciding, which is the opposite of what this check hunts for. It
    // used to read as drift: waiving 7 students' late fees off a fee-correction
    // register turned this invariant red while nothing had gone wrong.
    //
    // Subtracted rather than skipped, so the row is still checked — it just has
    // to have moved by EXACTLY what somebody waived. A rate that also drifted
    // underneath a waiver still shows up.
    let waivedSince = new Map();
    try {
      const waivers = await fetchAll(
        "student_late_fee_waivers",
        "installment_id, amount, source, waived_at, voided_at",
        (query) =>
          query
            .eq("session_label", sessionLabel)
            .is("voided_at", null)
            .neq("source", "grandfather")
            .gt("waived_at", CUT_OVER_DATE),
      );
      waivedSince = waivers.reduce((map, waiver) => {
        const key = waiver.installment_id;
        return map.set(key, (map.get(key) ?? 0) + Number(waiver.amount || 0));
      }, new Map());
    } catch {
      // Unreadable waivers must not silently excuse a real move.
      waivedSince = new Map();
    }

    const offenders = data
      .map((snapshot) => {
        const current = balanceByInstallment.get(snapshot.installment_id);
        if (!current) return null;
        if (rateFixedLater.has(snapshot.installment_id)) return null;
        const before = Number(snapshot.final_late_fee);
        const decided = waivedSince.get(snapshot.installment_id) ?? 0;
        const expected = Math.max(before - decided, 0);
        return current.final_late_fee === expected
          ? null
          : `${snapshot.installment_id}: ${before} -> ${current.final_late_fee}` +
              (decided > 0 ? ` (${decided} waived since, expected ${expected})` : "");
      })
      .filter(Boolean);

    const explained = [...waivedSince.keys()].filter((id) => balanceByInstallment.has(id)).length;

    record(
      "grandfathering held",
      offenders.length === 0,
      `${offenders.length} of ${data.length} snapshot row(s) moved`
        + (rateFixedLater.size > 0 ? `, ${rateFixedLater.size} excluded as later rate fixes` : "")
        + (explained > 0 ? `, ${explained} explained by a later waiver` : ""),
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

// ── 7. Fees and late fee stay in their own columns ─────────────────────────
// Since 20260812120000 pending_amount is fees only and late_fee_pending carries
// the late fee. The two must still add up to what a cashier can collect against
// the installment, or money has gone missing from one side of the split.
{
  const offenders = balances
    .filter((row) => row.pending_amount + row.late_fee_pending !== row.total_pending)
    .map(
      (row) =>
        `${row.installment_id}: fees ${row.pending_amount} + late fee ${row.late_fee_pending} <> total ${row.total_pending}`,
    );
  record(
    "fees and late fee add up",
    offenders.length === 0,
    offenders.length === 0
      ? "0 installment(s) with a broken split"
      : `${offenders.length} installment(s) with a broken split`,
    offenders,
  );
}

// ── 8. Every chargeable installment carries a rate ─────────────────────────
// The late fee is derived from installments.late_fee_flat_amount, which the
// generator stamps once at creation and nothing re-stamps afterwards. A row
// left at 0 can never accrue, however overdue it gets, and nothing anywhere
// says so -- 385 rows in the live 2026-27 session sat like that from 2026-05-24
// until 20260812130000 backfilled them. Carry-forward rows are the deliberate
// exception: they carry 0 on purpose and must never accrue.
{
  const { data, error } = await supabase
    .from("installments")
    .select("id, late_fee_flat_amount, is_carry_forward, status, classes!inner(session_label)")
    .eq("classes.session_label", sessionLabel)
    .neq("status", "cancelled")
    .or("late_fee_flat_amount.is.null,late_fee_flat_amount.lte.0");

  if (error) {
    record("chargeable installments carry a rate", false, `query failed: ${error.message}`);
  } else {
    const offenders = (data ?? []).filter((row) => !row.is_carry_forward);
    record(
      "chargeable installments carry a rate",
      offenders.length === 0,
      offenders.length === 0
        ? "0 installment(s) stuck at a zero rate"
        : `${offenders.length} non-carry-forward installment(s) stuck at a zero rate`,
      offenders.slice(0, 5).map((row) => `${row.id}: rate ${row.late_fee_flat_amount ?? "null"}`),
    );
  }
}

// ── 9. Nothing a waiver released has gone missing ──────────────────────────
// The check that earns 20260826120000.
//
// An admin may now forgive a late fee the family has ALREADY PAID. That lowers
// what the installment charges without lowering what was applied to it, and
// both engines used to clip the difference away with greatest(..., 0): the
// released rupees vanished from every per-installment figure while
// v_student_financial_state disagreed by exactly that amount. 20260826115000
// spills the surplus onto the next installments instead.
//
// So, per student, what the per-installment engine says is still owed must
// equal what the whole year charges minus everything settled against it. That
// is the arithmetic v_student_financial_state does; if the two part company,
// the spill is broken and somebody is being asked for money they have paid.
//
// This is checked for EVERY student, not just those with a manual_collected
// waiver: a divergence anywhere means an installment is over-applied for some
// other reason, which is worth knowing about on its own.
{
  const byStudent = new Map();
  for (const row of balances) {
    const acc = byStudent.get(row.student_id) ?? { pending: 0, charge: 0, settled: 0 };
    acc.pending += row.total_pending;
    acc.charge += row.total_charge;
    acc.settled += row.applied_amount + row.discount_closeout_amount;
    byStudent.set(row.student_id, acc);
  }

  const collectedWaiverStudents = new Set(
    waivers.filter((row) => row.source === "manual_collected").map((row) => row.student_id),
  );

  const offenders = [];
  for (const [studentId, acc] of byStudent) {
    const expected = Math.max(acc.charge - acc.settled, 0);
    if (acc.pending !== expected) {
      offenders.push(
        `${studentId}: installments say ${acc.pending} pending, charge - settled says ${expected}` +
          (collectedWaiverStudents.has(studentId) ? " (has a collected-late-fee waiver)" : ""),
      );
    }
  }

  record(
    "released money lands on the next installments",
    offenders.length === 0,
    offenders.length === 0
      ? `0 student(s) diverging; ${collectedWaiverStudents.size} carry a collected-late-fee waiver`
      : `${offenders.length} student(s) where per-installment dues disagree with charge - settled`,
    offenders.slice(0, 5),
  );
}

// ── 10. No later installment is settled while an earlier one still owes ────
// The rule 20260905064847 exists for. Money settles the rows in the pool's
// order -- settlement_rank -- fees first, then the late fee, before moving on.
// So within a student and session, a row with settled_amount > 0 can only
// follow rows with nothing pending at all.
{
  const byStudent = new Map();
  for (const row of balances) {
    const key = `${row.student_id}::${row.session_label}`;
    const rows = byStudent.get(key) ?? [];
    rows.push(row);
    byStudent.set(key, rows);
  }

  const offenders = [];
  let rowsChecked = 0;
  for (const [key, rows] of byStudent) {
    rows.sort((left, right) => Number(left.settlement_rank ?? 0) - Number(right.settlement_rank ?? 0));
    for (let later = 1; later < rows.length; later += 1) {
      if (Number(rows[later].settled_amount ?? 0) <= 0) continue;
      rowsChecked += 1;
      const owedAhead = rows.slice(0, later).find((earlier) => Number(earlier.total_pending ?? 0) > 0);
      if (owedAhead) {
        offenders.push(
          `${key}: installment ${rows[later].installment_no} carries ${rows[later].settled_amount} while installment ${owedAhead.installment_no} still owes ${owedAhead.total_pending}`,
        );
        break;
      }
    }
  }

  record(
    "money settles oldest-first",
    offenders.length === 0,
    offenders.length === 0
      ? `${rowsChecked} settled row(s) checked across ${byStudent.size} student/session pair(s); none sits behind an owed row`
      : `${offenders.length} student(s) read a later installment as settled while an earlier one is owed`,
    offenders.slice(0, 10),
  );
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
