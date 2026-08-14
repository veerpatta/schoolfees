/**
 * The reads every tool family shares.
 *
 * The one rule enforced here: `getFinancialRows` takes a named scope and has no
 * default. The previous version had `onlyActive = true`, so a tool that said
 * nothing got active-only — which is how the money tools came to under-report
 * students who left owing, and why two tools in the same payload disagreed.
 */

import { createDegradationLog, selectAll } from "./supabase.mjs";
import { resolveScope, scopeParams } from "./scope.mjs";
import { FINANCIAL_FIELDS, mapFinancialRow } from "./shape/student.mjs";
import { getSessionInstallmentsByStudent } from "./shape/installment.mjs";
import { getPlanCoverage } from "./shape/plan.mjs";
import { getContactSummaries, getNoCallStudentIds } from "./shape/contact.mjs";

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

/**
 * Receipts in a window, scoped by session through the student's class.
 *
 * The old version resolved its student set with `students.status = 'active'`
 * joined to active classes, so a leaver's payment vanished from "who paid
 * recently" — money that demonstrably came in, reported as not having.
 */
export async function getSessionStudentIds(env, sessionLabel, scope) {
  const { rows } = await getFinancialRows(env, {
    sessionLabel,
    scope,
    limit: undefined,
  });
  return rows.map((row) => row.student_id).filter(Boolean);
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
