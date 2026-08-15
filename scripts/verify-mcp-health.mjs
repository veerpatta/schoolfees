#!/usr/bin/env node
/**
 * Cross-checks the deployed MCP server against the database it reads.
 *
 * The failure this guards against is the one that motivated the rebuild: the MCP
 * quietly answering a different question from the office app, and nobody
 * noticing because both answers looked plausible. So this does not test the
 * server against itself — it asks the MCP for a figure, computes the same figure
 * straight from Postgres, and fails on any difference.
 *
 * Read-only end to end. Safe against the live session.
 *
 *   node scripts/verify-mcp-health.mjs --session 2026-27
 *   node scripts/verify-mcp-health.mjs --session TEST-2026-27 --url http://127.0.0.1:8787
 *
 * Needs, from the environment or .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SCHOOLFEES_WORKER_MCP_TOKEN   the service-lane token
 *   SCHOOLFEES_MCP_URL            optional; defaults to the live Worker
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { FINANCIAL_FIELDS } from "../workers/schoolfees-mcp/src/shape/student.mjs";
import { INSTALLMENT_FIELDS } from "../workers/schoolfees-mcp/src/shape/installment.mjs";
import { PLAN_FIELDS } from "../workers/schoolfees-mcp/src/shape/plan.mjs";
import { RECEIPT_FIELDS } from "../workers/schoolfees-mcp/src/shape/receipt.mjs";
import {
  DIRECTORY_FIELDS,
  STUDENT_MASTER_FIELDS,
} from "../workers/schoolfees-mcp/src/tools/students.mjs";

const DEFAULT_URL = "https://schoolfees-live-mcp.raj-39e.workers.dev";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || line.trim().startsWith("#")) continue;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sessionLabel = arg("session", process.env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27");
const baseUrl = (arg("url", process.env.SCHOOLFEES_MCP_URL || DEFAULT_URL)).replace(/\/$/, "");
const token = process.env.SCHOOLFEES_WORKER_MCP_TOKEN || process.env.SCHOOLFEES_MCP_TOKEN;
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of [
  ["SCHOOLFEES_WORKER_MCP_TOKEN", token],
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
]) {
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment or .env.local.`);
    process.exit(2);
  }
}

let requestId = 0;

async function callTool(name, args = {}) {
  const response = await fetch(`${baseUrl}/svc/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++requestId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`${name} -> HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = await response.json();
  if (body.error) throw new Error(`${name} -> ${body.error.message}`);
  if (body.result?.isError) {
    throw new Error(`${name} -> ${JSON.stringify(body.result.content).slice(0, 300)}`);
  }
  return body.result.structuredContent;
}

async function supabase(pathname, params = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) {
    throw new Error(`Supabase ${pathname} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

/** Reads every row, so a total is a total. */
async function supabaseAll(table, params) {
  const rows = [];
  for (;;) {
    const page = await supabase(table, { ...params, limit: 1000, offset: String(rows.length) });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/**
 * Every column the Worker names in a `select`, by relation.
 *
 * The unit tests mock Supabase, so a column that does not exist passes them and
 * then 400s in production — which is exactly what happened to `students`
 * (`aadhaar_number`, `address_line1`, `village`) and `defaulter_contacts`
 * (`created_by`). Keep this in step with the Worker; the check below is what
 * makes the mismatch loud instead of silent.
 */
const COLUMN_CONTRACT = {
  v_workbook_student_financials: FINANCIAL_FIELDS,
  v_workbook_installment_balances: INSTALLMENT_FIELDS,
  v_student_repayment_plan_status: PLAN_FIELDS,
  receipts: RECEIPT_FIELDS,
  v_student_directory: DIRECTORY_FIELDS,
  students: STUDENT_MASTER_FIELDS,
  defaulter_contacts:
    "id,student_id,session_label,contacted_at,contacted_by,channel,outcome,note,snooze_until,phone_label,contacted_phone",
  student_collection_flags: "student_id,session_label,no_call",
  workbook_materialized_view_refresh_queue: "queue_key,pending,requested_at,last_refreshed_at",
  v_receipt_reversal_totals: "receipt_id,reversed_amount",
  student_repayment_plan_items: "plan_id,student_id,installment_id",
  payments:
    "id,receipt_id,student_id,installment_id,amount,notes,created_at,discount_applied_at_posting,waiver_applied_at_posting,pending_before_posting,pending_after_posting",
  payment_adjustments:
    "id,payment_id,student_id,installment_id,adjustment_type,amount_delta,reason,notes,created_at",
  refund_requests:
    "id,receipt_id,student_id,refund_date,requested_amount,refund_method,refund_reference,reason,notes,status,created_at,approved_at,processed_at",
  student_family_members:
    "family_group_id,student_id,sibling_order,academic_session_label,is_policy_candidate",
  student_family_groups:
    "id,family_label,guardian_name,guardian_phone,notes,academic_session_label",
  academic_sessions: "id,session_label,status,notes,created_at,updated_at",
  classes: "id,class_name,section,stream_name,sort_order,status,session_label",
  transport_routes: "id,route_name,route_code,default_installment_amount,is_active",
  fee_policy_configs:
    "academic_session_label,calculation_model,installment_schedule,late_fee_flat_amount,new_student_academic_fee_amount,old_student_academic_fee_amount,accepted_payment_modes,receipt_prefix,updated_at",
  v_student_carry_forward_balances:
    "student_id,admission_no,student_name,father_name,father_phone,class_label,source_session_label,target_session_label,fee_head,installment_label,due_date,original_amount,collected_amount,remaining_amount,balance_status,status",
};

/**
 * Asks PostgREST for one row of each relation, projecting exactly the columns
 * the Worker asks for. A wrong name comes back as a 400 naming it.
 *
 * `information_schema.columns` would be the obvious check and is the wrong one —
 * it does not list materialized views, and two of the three most important
 * relations here are materialized views.
 */
async function checkColumnContract() {
  for (const [relation, columns] of Object.entries(COLUMN_CONTRACT)) {
    try {
      await supabase(relation, { select: columns, limit: "1" });
      checks.push({ ok: true, label: `columns / ${relation}`, actual: "all present", expected: "all present" });
    } catch (error) {
      const detail = String(error.message).match(/column [^"]*"?([a-z_.]+)"?/i)?.[1] || "";
      failures.push(
        `columns / ${relation}: the Worker selects a column this database does not have${detail ? ` (${detail})` : ""}. Every tool touching ${relation} would fail with HTTP 400.`,
      );
      checks.push({ ok: false, label: `columns / ${relation}`, actual: "mismatch", expected: "all present" });
    }
  }
}

const failures = [];
const checks = [];

function check(label, actual, expected, detail = "") {
  const ok = actual === expected;
  checks.push({ ok, label, actual, expected, detail });
  if (!ok) failures.push(`${label}: MCP says ${actual}, database says ${expected}. ${detail}`);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Math.round(Number(row[key] || 0)), 0);
}

async function main() {
  console.log(`Verifying ${baseUrl} against ${supabaseUrl}, session ${sessionLabel}\n`);

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  console.log(`Server: ${health.name} v${health.version}, read-only: ${health.readOnly}\n`);

  // Before comparing any figure, prove the Worker's queries are even legal
  // against this schema. A wrong column name passes every mocked unit test and
  // then 400s in production.
  await checkColumnContract();

  const financials = await supabaseAll("v_workbook_student_financials", {
    select:
      "student_id,record_status,total_paid,outstanding_amount,late_fee_outstanding_amount,base_charge_total",
    session_label: `eq.${sessionLabel}`,
  });

  const onRoll = financials.filter((row) => row.record_status === "active");
  const collectable = financials.filter(
    (row) => row.record_status === "active" || Number(row.total_paid) > 0,
  );
  const leftOwing = financials.filter(
    (row) => row.record_status !== "active" && Number(row.outstanding_amount) > 0,
  );

  // 1. Headcount and money must be counted under DIFFERENT rules. Equality here
  //    would mean one of them has silently adopted the other's population.
  const summary = await callTool("get_session_money_summary", { sessionLabel });
  check("headcount / students on roll", summary.headcount.studentsOnRoll, onRoll.length);
  check("money / students in scope", summary.money.studentCount, collectable.length);
  check(
    "money / fees pending",
    summary.money.totalFeesPending,
    sum(collectable, "outstanding_amount"),
    "Fees pending must exclude late fees and include students who left owing.",
  );
  check(
    "money / late fee pending",
    summary.money.totalLateFeePending,
    sum(collectable, "late_fee_outstanding_amount"),
  );
  check("money / collected", summary.money.totalPaid, sum(collectable, "total_paid"));
  check("money scope name", summary.money.scope.name, "collectable");
  check("headcount scope name", summary.headcount.scope.name, "on_roll");

  // 2. The left-student queue is the non-active complement, and nothing else.
  const left = await callTool("get_left_student_recovery", { sessionLabel, includeDues: false });
  check("left students still owing", left.students.length, leftOwing.length);
  check(
    "left students / fees pending",
    left.totals.feesPending,
    sum(leftOwing, "outstanding_amount"),
  );

  // 3. Every money block in the AI context must agree with every other one.
  //    This is the exact contradiction the rebuild set out to end.
  const context = await callTool("get_ai_analysis_context", { sessionLabel });
  const classTotal = context.classSummaries.groups.reduce(
    (total, group) => total + group.totalFeesPending,
    0,
  );
  const routeTotal = context.routeSummaries.groups.reduce(
    (total, group) => total + group.totalFeesPending,
    0,
  );
  check("ai context / summary vs class rollup", classTotal, context.summary.totalFeesPending);
  check("ai context / summary vs route rollup", routeTotal, context.summary.totalFeesPending);
  check("ai context / summary vs money summary", context.summary.totalFeesPending, summary.money.totalFeesPending);

  // 4. The dashboard class board must agree with the class rollup, class by
  //    class — once previous-year dues are added back.
  //
  //    The board is not a like-for-like of the student view and must not be
  //    compared as one. `class_rows` in get_dashboard_analytics reads the
  //    installment view with `where not is_carry_forward`, so it is this year's
  //    installments only. `classSummaries` reads the student rollup, whose
  //    outstanding_amount includes balances carried forward from last session.
  //    Asserting them equal reports every class as broken while nothing is.
  //
  //    Reconciling instead still catches the failure this check exists for — a
  //    board built over a different population — because a population mismatch
  //    does not divide neatly into carry-forward.
  const carryForwardRows = await supabaseAll("v_student_carry_forward_balances", {
    select: "class_id,remaining_amount",
    target_session_label: `eq.${sessionLabel}`,
  });
  const carryForwardByClass = new Map();
  for (const row of carryForwardRows) {
    carryForwardByClass.set(
      row.class_id,
      (carryForwardByClass.get(row.class_id) || 0) + Number(row.remaining_amount || 0),
    );
  }

  const classByLabel = new Map(
    context.classSummaries.groups.map((group) => [group.key, group.totalFeesPending]),
  );
  for (const row of context.dashboardAnalytics?.classRecovery || []) {
    const expected = classByLabel.get(row.classId);
    if (expected === undefined) continue;
    check(
      `dashboard vs class rollup / ${row.classLabel}`,
      row.feesPending + (carryForwardByClass.get(row.classId) || 0),
      expected,
      "The dashboard class board plus previous-year dues must equal the class rollup.",
    );
  }

  // And the same reconciliation in total, stated once so the gap is a named
  // figure rather than something a reader has to derive from 19 rows.
  const boardTotal = (context.dashboardAnalytics?.classRecovery || []).reduce(
    (total, row) => total + row.feesPending,
    0,
  );
  const carryForwardTotal = carryForwardRows.reduce(
    (total, row) => total + Number(row.remaining_amount || 0),
    0,
  );
  check(
    "dashboard class board + previous-year dues vs money total",
    boardTotal + carryForwardTotal,
    summary.money.totalFeesPending,
    "The class board shows this year's installments only. Previous-year dues make up the difference.",
  );

  // 5. Enrollment status must come from the enrollment column. The old server
  //    published the academic-fee tier here, so this is a named regression guard.
  const sample = collectable[0];
  if (sample) {
    const identity = await supabase("v_workbook_student_financials", {
      select: "admission_no,record_status,student_status_label",
      student_id: `eq.${sample.student_id}`,
      session_label: `eq.${sessionLabel}`,
      limit: "1",
    });
    const row = identity[0];
    const student = await callTool("get_student_due_status", {
      sessionLabel,
      query: row.admission_no,
      limit: 1,
    });
    const found = student.students[0];
    if (!found) {
      failures.push(`enrollment: MCP could not find admission ${row.admission_no}.`);
    } else {
      check(`enrollment.status for ${row.admission_no}`, found.enrollment?.status, row.record_status);
      check(`feeTier for ${row.admission_no}`, found.feeTier, row.student_status_label);
      if ("studentStatus" in found) {
        failures.push(
          "enrollment: the removed `studentStatus` field is back. It carried the academic-fee tier while promising the enrollment status.",
        );
      }
    }
  }

  // 6. No test data may leak into a live answer.
  if (!/^(TEST|UAT|DEMO)-/.test(sessionLabel)) {
    const leaked = context.studentRows?.filter((row) => row.sessionLabel !== sessionLabel) || [];
    if (leaked.length > 0) {
      failures.push(`session isolation: ${leaked.length} row(s) from another session in a ${sessionLabel} answer.`);
    }
  }

  for (const entry of checks) {
    console.log(
      `${entry.ok ? "  ok " : "FAIL "} ${entry.label}: ${entry.actual}${entry.ok ? "" : ` (expected ${entry.expected})`}`,
    );
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`${failures.length} check(s) failed:\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`All ${checks.length} checks passed. The MCP and the database agree on ${sessionLabel}.`);
}

main().catch((error) => {
  console.error(`\nverify-mcp-health failed: ${error.message}`);
  process.exit(1);
});
