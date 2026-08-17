/**
 * The reads every tool family shares.
 *
 * The one rule enforced here: `getFinancialRows` takes a named scope and has no
 * default. The previous version had `onlyActive = true`, so a tool that said
 * nothing got active-only — which is how the money tools came to under-report
 * students who left owing, and why two tools in the same payload disagreed.
 */

import { createDegradationLog, rpc, select, selectAll } from "./supabase.mjs";
import { resolveScope, scopeParams } from "./scope.mjs";
import { FINANCIAL_FIELDS, mapFinancialRow } from "./shape/student.mjs";
import { getSessionInstallmentsByStudent } from "./shape/installment.mjs";
import { getPlanCoverage } from "./shape/plan.mjs";
import { getContactSummaries, getNoCallStudentIds } from "./shape/contact.mjs";
import { todayIst } from "./freshness.mjs";

/**
 * Student financial rows for a session under an explicit scope.
 * @param {object} options
 * @param {string} options.scope one of on_roll | collectable | left_owing | everyone
 */
export async function getFinancialRows(env, { sessionLabel, scope, classId, routeId, limit } = {}) {
  if (!sessionLabel) throw new Error("getFinancialRows requires a sessionLabel.");
  // Throws on an unnamed scope rather than quietly picking one.
  resolveScope(scope);

  const params = {
    select: FINANCIAL_FIELDS,
    session_label: `eq.${sessionLabel}`,
    order: "sort_order.asc,student_name.asc",
    ...scopeParams(scope),
  };

  if (classId) params.class_id = `eq.${classId}`;
  if (routeId) params.transport_route_id = `eq.${routeId}`;
  if (limit) params.limit = limit;

  return selectAll(env, "v_workbook_student_financials", params);
}

/**
 * How many students a scope covers, without reading them.
 *
 * Two callers wanted a headcount and got it by fetching ~500 rows of 60 columns
 * and taking `.length`. PostgREST will just count them; `select` has supported
 * `count=exact` since it was written and nothing had ever asked for it.
 */
export async function countFinancialRows(env, { sessionLabel, scope, classId, routeId } = {}) {
  if (!sessionLabel) throw new Error("countFinancialRows requires a sessionLabel.");
  resolveScope(scope);

  const params = {
    select: "student_id",
    session_label: `eq.${sessionLabel}`,
    limit: 1,
    ...scopeParams(scope),
  };
  if (classId) params.class_id = `eq.${classId}`;
  if (routeId) params.transport_route_id = `eq.${routeId}`;

  const { totalCount } = await select(env, "v_workbook_student_financials", params, {
    count: true,
  });

  // Never fall back to 0. A headcount is the denominator of half the answers
  // this server gives, and "0 students on the roll" is a far worse failure than
  // an error saying the count could not be read.
  if (totalCount === null) {
    throw new Error(
      "Could not read an exact count for v_workbook_student_financials (no content-range header). Refusing to report a headcount of 0.",
    );
  }

  return totalCount;
}

/**
 * Every session label that exists, as a Set.
 *
 * `sessionSchema` only checks the *shape* of a label, so `2024-25` passed
 * validation, matched no rows anywhere, and every tool returned a fully-formed
 * payload of zeros — `degraded: []`, `truncated: false`, normal prose notes.
 * An assistant reading that would report "₹0 collected in 2024-25" as fact.
 * A label that does not exist is a caller mistake, and it has to look like one.
 */
export async function getKnownSessionLabels(env) {
  const { rows } = await selectAll(env, "academic_sessions", { select: "session_label" });
  return new Set(rows.map((row) => row.session_label).filter(Boolean));
}

export class UnknownSessionError extends Error {
  constructor(sessionLabel, known) {
    super(
      `Academic session "${sessionLabel}" does not exist. This is not a session with no data — there is no such ledger. Valid sessions: ${[...known].sort().join(", ")}. Call list_sessions to see which is live.`,
    );
    this.name = "UnknownSessionError";
    this.sessionLabel = sessionLabel;
  }
}

/**
 * The student ids a scope covers, plus each one's enrollment status.
 *
 * `v_workbook_installment_balances` carries no `record_status` of its own, so a
 * tool reading it cannot express a scope in PostgREST. It fell back to no scope
 * at all: every student in the session, leavers included, with the caveat left
 * in prose. This is the join that lets that tool answer under a named scope
 * like every other one.
 */
export async function getScopedStudentIds(env, { sessionLabel, scope } = {}) {
  if (!sessionLabel) throw new Error("getScopedStudentIds requires a sessionLabel.");
  resolveScope(scope);

  const { rows, truncated } = await selectAll(env, "v_workbook_student_financials", {
    select: "student_id,record_status",
    session_label: `eq.${sessionLabel}`,
    ...scopeParams(scope),
  });

  return {
    ids: new Set(rows.map((row) => row.student_id).filter(Boolean)),
    statusById: new Map(rows.map((row) => [row.student_id, row.record_status])),
    truncated,
  };
}

/**
 * The two headline figures the office Dashboard shows, from the RPC the screen
 * itself reads.
 *
 * `get_dashboard_summary` nests the headcount at `kpis.totalStudents` and puts
 * `studentsWithPending` at the top level. Three call sites read
 * `summaryRpc.totalStudents` and `summaryRpc.students_with_pending` — neither
 * key exists on that payload — and a `?? 0` turned both misses into a confident
 * zero. The RPC call itself succeeds, so `degraded.tolerate` never fired and
 * nothing was reported as broken: `get_system_health` answered "0 students on
 * the roll" while the correct 507 sat one level down, leaving an unfiltered
 * 535 as the only student number in the payload.
 *
 * So this reader validates rather than coalesces. A shape change now fails
 * loudly into `degraded[]` instead of quietly into a wrong number, which is the
 * same rule `countFinancialRows` above already applies to its own count.
 */
export async function getDashboardHeadline(env, sessionLabel) {
  if (!sessionLabel) throw new Error("getDashboardHeadline requires a sessionLabel.");

  const payload = await rpc(env, "get_dashboard_summary", {
    p_session_label: sessionLabel,
    p_today: todayIst(),
  });

  const figures = {
    totalStudents: payload?.kpis?.totalStudents,
    studentsWithPending: payload?.studentsWithPending,
  };
  const paths = { totalStudents: "kpis.totalStudents", studentsWithPending: "studentsWithPending" };

  for (const [key, value] of Object.entries(figures)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `get_dashboard_summary returned no numeric ${paths[key]} (got ${JSON.stringify(value)}). Refusing to report a figure this reader cannot verify.`,
      );
    }
  }

  return figures;
}

/**
 * Everything the recovery tools need, fetched once. Scoped `collectable`: a
 * family that paid something and then left still owes the rest, and the office
 * still has to collect it.
 */
export async function getRecoveryContext(env, sessionLabel, { scope = "collectable" } = {}) {
  const degradation = createDegradationLog();
  const { rows: financialRows, truncated } = await getFinancialRows(env, {
    sessionLabel,
    scope,
  });
  const studentIds = financialRows.map((row) => row.student_id).filter(Boolean);

  const [contactSummaries, noCallIds, installments, planCoverage] = await Promise.all([
    getContactSummaries(env, sessionLabel, studentIds, degradation),
    getNoCallStudentIds(env, sessionLabel, studentIds, degradation),
    degradation.tolerate(
      "v_workbook_installment_balances",
      () => getSessionInstallmentsByStudent(env, sessionLabel),
      { byStudent: new Map(), truncated: false },
    ),
    degradation.tolerate(
      "v_student_repayment_plan_status",
      () => getPlanCoverage(env, sessionLabel, studentIds),
      new Map(),
    ),
  ]);

  return {
    scope,
    financialRows,
    truncated: truncated || installments.truncated,
    contactSummaries,
    noCallIds,
    installmentsByStudent: installments.byStudent,
    planCoverage,
    degraded: degradation.entries,
  };
}

/** Match a free-text query against the fields a person would actually type. */
export function matchesQuery(row, normalizedQuery) {
  if (!normalizedQuery) return true;
  return [
    row.student_name,
    row.admission_no,
    row.father_name,
    row.mother_name,
    row.father_phone,
    row.mother_phone,
    row.class_label,
  ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
}

export function normalizeQuery(value) {
  return (value || "").trim().toLowerCase();
}

/** Financial rows mapped for output, keeping the raw row available for scoping. */
export function mapRows(rows) {
  return rows.map(mapFinancialRow);
}
