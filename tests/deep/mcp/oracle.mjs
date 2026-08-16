/**
 * The differential oracle: ask the MCP, then compute the same figure from
 * Postgres and compare.
 *
 * This is the highest-value check in the whole harness, and the reason is
 * historical. The failure that motivated rebuilding the MCP server was not a
 * crash — it was the MCP quietly answering a *different question* from the
 * office app, with both answers looking entirely plausible. Nothing detects
 * that except recomputing the number a second way.
 *
 * The scope rules are re-implemented here rather than imported, for the same
 * reason: importing `scope.mjs` would make the oracle agree with the thing it
 * is checking.
 *
 *   headcount  = record_status = 'active'
 *   money      = record_status = 'active' OR total_paid > 0
 *
 * Those two count different students on purpose (`20260808210000`): a student
 * who left owing money still owes it. Conflating them is what once hid ₹17,250
 * of live collectable dues.
 */

/**
 * Read the environment lazily, not at import time.
 *
 * ESM evaluates every import before the importing module's body, so a
 * `const URL = process.env.…` here is captured *before* `run.mjs` has loaded
 * `.env.local`. The first run of this suite skipped the entire oracle — the
 * most valuable check in it — and said "credentials absent" while they sat in
 * a file two lines further down.
 */
const supabaseUrl = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function oracleAvailable() {
  return Boolean(supabaseUrl() && serviceKey());
}

async function select(pathname, params = {}) {
  const SUPABASE_URL = supabaseUrl();
  const SERVICE_KEY = serviceKey();
  const url = new URL(`${SUPABASE_URL}/rest/v1/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const response = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ${pathname}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

/** Every row, so a total is a total rather than the first page of one. */
export async function selectAll(table, params) {
  const rows = [];
  for (;;) {
    const page = await select(table, { ...params, limit: 1000, offset: rows.length });
    rows.push(...page);
    if (page.length < 1000) return rows;
    if (rows.length > 50_000) return rows;
  }
}

const num = (value) => Number(value ?? 0) || 0;

/**
 * The financial projection, straight from the view the app reads.
 * `v_workbook_student_financials` is the same source the MCP uses, so a
 * mismatch is the MCP's arithmetic or its filter, never a different table.
 */
export async function financialRows(sessionLabel) {
  // The column names matter and are not the ones the MCP's own vocabulary uses.
  // On the view, fees pending is `outstanding_amount` and the late fee lives in
  // `late_fee_outstanding_amount` — the split the whole late-fee migration
  // exists to keep. Expected fees is `base_charge_total`, falling back to
  // `total_due`, which is exactly what `shape/student.mjs` does.
  return selectAll("v_workbook_student_financials", {
    select:
      "student_id,record_status,total_paid,outstanding_amount," +
      "late_fee_outstanding_amount,base_charge_total,total_due,late_fee_total",
    session_label: `eq.${sessionLabel}`,
  });
}

export function inMoneyScope(row) {
  return row.record_status === "active" || num(row.total_paid) > 0;
}

export function inHeadcountScope(row) {
  return row.record_status === "active";
}

/** The figures the report puts side by side with the MCP's answers. */
export function computeFigures(rows) {
  const money = rows.filter(inMoneyScope);
  const onRoll = rows.filter(inHeadcountScope);

  const sum = (list, project) => list.reduce((total, row) => total + project(row), 0);

  const feesPendingOf = (row) => num(row.outstanding_amount);
  const lateFeePendingOf = (row) => num(row.late_fee_outstanding_amount);
  const expectedOf = (row) => num(row.base_charge_total ?? row.total_due);

  return {
    headcountOnRoll: onRoll.length,
    moneyStudents: money.length,
    expected: sum(money, expectedOf),
    collected: sum(money, (row) => num(row.total_paid)),
    feesPending: sum(money, feesPendingOf),
    lateFeePending: sum(money, lateFeePendingOf),
    // Deliberately not a field: fees + late fee is a figure the app computes
    // per student and never aggregates, because adding them at the session
    // level is the exact mistake the late-fee split exists to prevent.
    // A late fee never makes a student a defaulter — this count reads fees only.
    pendingStudents: money.filter((row) => feesPendingOf(row) > 0).length,
    lateFeePendingStudents: money.filter((row) => lateFeePendingOf(row) > 0).length,
    leftOwing: rows.filter(
      (row) => row.record_status !== "active" && feesPendingOf(row) > 0,
    ).length,
  };
}

export async function oracleFor(sessionLabel) {
  const rows = await financialRows(sessionLabel);
  return { rows, figures: computeFigures(rows) };
}

/**
 * Compare one figure. A tolerance of zero is the point — these are rupees and
 * headcounts, not estimates.
 */
export function compare(label, fromMcp, fromPostgres) {
  const mcp = num(fromMcp);
  const postgres = num(fromPostgres);
  return {
    label,
    mcp,
    postgres,
    delta: mcp - postgres,
    ok: mcp === postgres,
  };
}
