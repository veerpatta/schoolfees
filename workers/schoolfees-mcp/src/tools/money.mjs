/**
 * Session-level money: what was expected, what came in, what is still owed.
 *
 * The old `get_ai_analysis_context` put two rollups of the same session in one
 * payload — one built from the financial view under one student rule, one from
 * the dashboard RPC under another — and let them disagree by six lakh rupees
 * without comment. Every block here names its scope, and where two blocks are
 * built differently on purpose, a reconciliation note says why.
 */

import * as z from "zod/v4";

import { rpc, selectAll } from "../supabase.mjs";
import { reconciliation } from "../scope.mjs";
import { getFinancialRows } from "../reads.mjs";
import {
  groupFinancialRows,
  routeLabel,
  summarizeFinancialRows,
} from "../shape/student.mjs";
import { INSTALLMENT_FIELDS, mapInstallmentRow } from "../shape/installment.mjs";
import { todayIst } from "../freshness.mjs";
import { decodeCursor, money, number, pageInfo, projectAll } from "../format.mjs";
import {
  cursorSchema,
  defineTool,
  fieldsSchema,
  limitSchema,
  scopeSchema,
  sessionSchema,
  toolResult,
  truncationNote,
  withScope,
} from "../toolkit.mjs";

async function loadDashboardAnalytics(env, sessionLabel) {
  const payload = await rpc(env, "get_dashboard_analytics", { p_session_label: sessionLabel });
  return {
    sessionLabel,
    debtAge: payload?.debtAge || [],
    lateFee: payload?.lateFee || {
      charged: 0,
      waived: 0,
      pending: 0,
      studentsWithPending: 0,
      byWaiverSource: [],
      nextAccrual: { dueDate: null, amount: 0, installments: 0 },
    },
    monthlyCollection: payload?.monthlyCollection || [],
    classRecovery: payload?.classRecovery || [],
    routeRecovery: payload?.routeRecovery || [],
    concentration: payload?.concentration || {
      studentsWithDues: 0,
      totalPending: 0,
      top10Amount: 0,
      top10Pct: 0,
      top50Amount: 0,
      top50Pct: 0,
    },
  };
}

export function registerMoneyTools(server, ctx) {
  const { env } = ctx;

  defineTool(server, ctx, {
    name: "get_session_money_summary",
    title: "Get Session Money Summary",
    description:
      "Use this for the headline position of a whole academic year: fees expected, collected and pending, this year versus last year's carry-forward, the separate late-fee ledger, and how many children are actually on the roll. This is the tool to answer 'how much is outstanding' or 'how are we doing this year'.",
    requires: ["dashboard:view", "finance:view", "reports:view"],
    money: true,
    inputSchema: { sessionLabel: sessionSchema(env) },
    handler: async ({ sessionLabel }) => {
      const [summaryRpc, feeSplit, collectable, onRoll] = await Promise.all([
        rpc(env, "get_dashboard_summary", {
          p_session_label: sessionLabel,
          p_today: todayIst(),
        }).catch(() => null),
        rpc(env, "get_dashboard_fee_split", { p_session_label: sessionLabel }).catch(() => null),
        getFinancialRows(env, { sessionLabel, scope: "collectable" }),
        getFinancialRows(env, { sessionLabel, scope: "on_roll" }),
      ]);

      const moneyTotals = summarizeFinancialRows(collectable.rows);
      const split = Array.isArray(feeSplit) ? feeSplit[0] : feeSplit;

      return toolResult(
        `${sessionLabel}: ${onRoll.rows.length} students on the roll. Fees pending ${money(moneyTotals.totalFeesPending)} across ${moneyTotals.pendingStudentCount} families, plus ${money(moneyTotals.totalLateFeePending)} of late fee. Collected ${money(moneyTotals.totalPaid)} of ${money(moneyTotals.totalExpectedFees)} expected.`,
        {
          sessionLabel,
          headcount: withScope(
            {
              studentsOnRoll: onRoll.rows.length,
              note: "Children currently enrolled. A student who has left is not on the roll, however much they owe.",
            },
            "on_roll",
            onRoll.rows,
          ),
          money: withScope(
            {
              ...moneyTotals,
              note: "Includes students who left owing money, because that money is still collectable. Fees and late fees are never added together.",
            },
            "collectable",
            collectable.rows,
          ),
          yearSplit: split
            ? {
                currentYear: {
                  expected: number(split.current_year_expected),
                  collected: number(split.current_year_collected),
                  pending: number(split.current_year_pending),
                },
                previousYear: {
                  originalBalance: number(split.previous_year_original),
                  collected: number(split.previous_year_collected),
                  pending: number(split.previous_year_pending),
                  note: "Carry-forward from 2025-26, riding on this year's ledger. Identified by is_carry_forward, not by session label.",
                },
                lateFeePending: number(split.late_fee_pending),
              }
            : null,
          dashboardHeadline: summaryRpc
            ? {
                totalStudents: number(summaryRpc.totalStudents ?? 0),
                studentsWithPending: number(summaryRpc.students_with_pending ?? 0),
                note: "Straight from the same RPC the office Dashboard reads, so these match the screen exactly.",
              }
            : null,
          reconciliation: reconciliation([
            {
              block: "headcount",
              scope: "on_roll",
              count: onRoll.rows.length,
            },
            {
              block: "money",
              scope: "collectable",
              count: collectable.rows.length,
              differenceExplained: `${collectable.rows.length - onRoll.rows.length} student(s) are counted in money but not in headcount: they have left and still owe, or paid and then left.`,
            },
          ]),
          ...truncationNote(collectable.truncated, "20000 rows"),
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_dashboard_analytics",
    title: "Get Dashboard Analytics",
    description:
      "Use this when the user wants the same five analytics boards as the live Dashboard: monthly collection trend, debt age buckets, class and route recovery, exposure concentration, and the separate late-fee ledger. Figures come from the Dashboard's own database function, so they match the screen.",
    requires: ["dashboard:view", "finance:view"],
    money: true,
    inputSchema: { sessionLabel: sessionSchema(env) },
    handler: async ({ sessionLabel }) => {
      const analytics = await loadDashboardAnalytics(env, sessionLabel);

      return toolResult(
        `${sessionLabel}: ${money(analytics.concentration.totalPending)} fees pending across ${analytics.concentration.studentsWithDues} families, and ${money(analytics.lateFee.pending)} of late fee pending. ${analytics.classRecovery.length} classes reporting.`,
        {
          ...analytics,
          scope: {
            name: "collectable",
            rule: "record_status = 'active' OR the student has paid something",
            why: "These boards are money, so they include students who left owing. Headcount elsewhere counts only students on the roll.",
          },
          notes: {
            debtAge:
              "Buckets count installment rows by how long they have been overdue, and exclude carry-forward. The bucket totals therefore do not add up to total fees pending.",
            lateFee:
              "charged is the gross late fee ever raised; waived is what was forgiven; pending is what is still owed. charged minus waived equals pending plus late fee already paid.",
            monthlyCollection:
              "Cash actually received. Discount-mode write-offs and reversed receipts are excluded.",
          },
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_class_due_summary",
    title: "Get Class Or Route Due Summary",
    description:
      "Use this for class-wise or route-wise totals: expected, collected, pending, late fee and how many families are at risk in each. Set groupBy to 'route' for transport routes or 'enrollmentStatus' to see what leavers still owe.",
    requires: ["dashboard:view", "reports:view", "finance:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      groupBy: z
        .enum(["class", "route", "enrollmentStatus"])
        .default("class")
        .describe("Dimension to group by."),
      scope: scopeSchema("collectable"),
    },
    handler: async ({ sessionLabel, groupBy, scope }) => {
      const { rows, truncated } = await getFinancialRows(env, { sessionLabel, scope });

      const selectors = {
        class: [(row) => row.class_id, (row) => row.class_label || row.class_name],
        route: [
          (row) => row.transport_route_id || "no_transport",
          (row) => routeLabel(row),
        ],
        enrollmentStatus: [(row) => row.record_status, (row) => row.record_status],
      }[groupBy];

      const groups = groupFinancialRows(rows, selectors[0], selectors[1]);
      const totals = summarizeFinancialRows(rows);

      return toolResult(
        `${sessionLabel}: ${groups.length} ${groupBy} group(s). Fees pending ${money(totals.totalFeesPending)}, late fee pending ${money(totals.totalLateFeePending)}.`,
        withScope(
          {
            sessionLabel,
            groupBy,
            groups,
            totals,
            note:
              groupBy === "route"
                ? "A student charged a custom transport amount with no route assigned is grouped under 'No Transport' but still carries a transport fee — check the label."
                : undefined,
            ...truncationNote(truncated, "20000 rows"),
          },
          scope,
          rows,
        ),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_installments",
    title: "Get Installments",
    description:
      "Use this for installment-level questions: who still owes installment 2, what falls due on a given date, how much late fee will accrue next, or the full schedule for one student. Carry-forward rows from last year are marked and never accrue a late fee.",
    requires: ["fees:view", "payments:view", "reports:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      studentQuery: z
        .string()
        .max(80)
        .optional()
        .describe("Restrict to one student by SR number, name or phone."),
      installmentNo: z.number().int().min(0).max(12).optional().describe("Restrict to one installment number."),
      balanceStatus: z
        .enum(["pending", "partial", "overdue", "paid", "waived"])
        .optional()
        .describe(
          "Filter on base-charge state. 'overdue' outranks 'partial': a partly paid past-due installment reads overdue.",
        ),
      lateFeeStatus: z.enum(["none", "pending", "waived", "paid"]).optional(),
      dueOnOrBefore: z.string().optional().describe("ISO date, e.g. 2026-10-20."),
      dueOnOrAfter: z.string().optional().describe("ISO date."),
      carryForward: z
        .enum(["any", "only", "exclude"])
        .default("any")
        .describe("only = last year's carry-forward rows; exclude = this year's four installments."),
      limit: limitSchema.default(50),
      cursor: cursorSchema,
      fields: fieldsSchema,
    },
    handler: async (args) => {
      const {
        sessionLabel,
        studentQuery,
        installmentNo,
        balanceStatus,
        lateFeeStatus,
        dueOnOrBefore,
        dueOnOrAfter,
        carryForward,
        limit,
        cursor,
        fields,
      } = args;

      const params = {
        select: INSTALLMENT_FIELDS,
        session_label: `eq.${sessionLabel}`,
        order: "due_date.asc,installment_no.asc,student_name.asc",
      };

      if (installmentNo !== undefined) params.installment_no = `eq.${installmentNo}`;
      if (balanceStatus) params.balance_status = `eq.${balanceStatus}`;
      if (lateFeeStatus) params.late_fee_status = `eq.${lateFeeStatus}`;
      if (carryForward === "only") params.is_carry_forward = "is.true";
      if (carryForward === "exclude") params.is_carry_forward = "is.false";

      const dueBounds = [];
      if (dueOnOrAfter) dueBounds.push(`due_date.gte.${dueOnOrAfter}`);
      if (dueOnOrBefore) dueBounds.push(`due_date.lte.${dueOnOrBefore}`);
      if (dueBounds.length > 0) params.and = `(${dueBounds.join(",")})`;

      if (studentQuery) {
        const normalized = studentQuery.trim().toLowerCase().replace(/[*,]/g, " ");
        params.or = `(student_name.ilike.*${normalized}*,admission_no.ilike.*${normalized}*)`;
      }

      const { rows, truncated } = await selectAll(env, "v_workbook_installment_balances", params);
      const mapped = rows.map(mapInstallmentRow);
      const offset = decodeCursor(cursor);

      const totals = mapped.reduce(
        (acc, row) => ({
          installmentCount: acc.installmentCount + 1,
          charged: acc.charged + row.totalCharge,
          paid: acc.paid + row.appliedAmount,
          feesPending: acc.feesPending + row.feesPendingAmount,
          lateFeePending: acc.lateFeePending + row.lateFeePendingAmount,
          students: acc.students.add(row.studentId),
        }),
        { installmentCount: 0, charged: 0, paid: 0, feesPending: 0, lateFeePending: 0, students: new Set() },
      );
      const { students, ...totalsOut } = totals;
      totalsOut.studentCount = students.size;

      const page = mapped.slice(offset, offset + limit);

      return toolResult(
        `${totalsOut.installmentCount} installment row(s) across ${totalsOut.studentCount} student(s) in ${sessionLabel}. Fees pending ${money(totalsOut.feesPending)}, late fee pending ${money(totalsOut.lateFeePending)}.`,
        {
          sessionLabel,
          filters: {
            studentQuery: studentQuery || null,
            installmentNo: installmentNo ?? null,
            balanceStatus: balanceStatus || null,
            lateFeeStatus: lateFeeStatus || null,
            dueOnOrAfter: dueOnOrAfter || null,
            dueOnOrBefore: dueOnOrBefore || null,
            carryForward,
          },
          totals: totalsOut,
          installments: projectAll(page, fields),
          pageInfo: pageInfo({
            offset,
            limit,
            returned: page.length,
            totalCount: mapped.length,
          }),
          note: "This view carries every student regardless of enrollment status. A student who left without paying has no rows here at all — withdrawing cancels their unpaid installments.",
          ...truncationNote(truncated, "20000 rows"),
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_fee_structure",
    title: "Get Fee Structure And Policy",
    description:
      "Use this to explain WHY a student is charged what they are charged: the installment schedule and due dates, the late-fee rule, new versus returning academic fee, per-class fee defaults, transport routes and their amounts, and the conventional discount policies (RTE, Staff Child, Third Child).",
    requires: ["fees:view", "settings:view"],
    inputSchema: { sessionLabel: sessionSchema(env) },
    handler: async ({ sessionLabel }) => {
      const [policy, classes, routes, discountPolicies] = await Promise.all([
        selectAll(env, "fee_policy_configs", {
          select:
            "academic_session_label,calculation_model,installment_schedule,late_fee_flat_amount,new_student_academic_fee_amount,old_student_academic_fee_amount,accepted_payment_modes,receipt_prefix,updated_at",
          academic_session_label: `eq.${sessionLabel}`,
          order: "updated_at.desc",
          limit: 1,
        }),
        selectAll(env, "classes", {
          select: "id,class_name,section,stream_name,sort_order,status,session_label",
          session_label: `eq.${sessionLabel}`,
          order: "sort_order.asc",
        }),
        selectAll(env, "transport_routes", {
          select: "id,route_name,route_code,default_installment_amount,is_active",
          order: "route_name.asc",
        }),
        selectAll(env, "conventional_discount_policies", {
          select:
            "code,display_name,calculation_type,fixed_tuition_amount,percentage,is_active,academic_session_label",
          academic_session_label: `eq.${sessionLabel}`,
        }).catch(() => ({ rows: [] })),
      ]);

      const config = policy.rows[0] || null;

      return toolResult(
        config
          ? `${sessionLabel}: ${(config.installment_schedule || []).length} installments, late fee ${money(config.late_fee_flat_amount)} flat, academic fee ${money(config.new_student_academic_fee_amount)} new / ${money(config.old_student_academic_fee_amount)} returning.`
          : `No fee policy found for ${sessionLabel}.`,
        {
          sessionLabel,
          policy: config
            ? {
                calculationModel: config.calculation_model,
                installmentSchedule: config.installment_schedule,
                lateFeeFlatAmount: number(config.late_fee_flat_amount),
                lateFeeRule:
                  "Charged the day an installment passes its due date with fees still unsettled, and kept until paid or explicitly waived. Never part of fees pending, and never accrues on a carry-forward row.",
                newStudentAcademicFee: number(config.new_student_academic_fee_amount),
                oldStudentAcademicFee: number(config.old_student_academic_fee_amount),
                acceptedPaymentModes: config.accepted_payment_modes,
                receiptPrefix: config.receipt_prefix,
              }
            : null,
          classes: classes.rows.map((row) => ({
            classId: row.id,
            className: row.class_name,
            section: row.section,
            stream: row.stream_name,
            status: row.status,
            sortOrder: row.sort_order,
          })),
          transportRoutes: routes.rows.map((row) => ({
            routeId: row.id,
            routeName: row.route_name,
            routeCode: row.route_code,
            defaultInstallmentAmount: number(row.default_installment_amount),
            isActive: row.is_active,
          })),
          conventionalDiscountPolicies: discountPolicies.rows.map((row) => ({
            code: row.code,
            displayName: row.display_name,
            calculationType: row.calculation_type,
            fixedTuitionAmount: number(row.fixed_tuition_amount),
            percentage: row.percentage,
            isActive: row.is_active,
          })),
          discountRules: [
            "Conventional discounts affect tuition only.",
            "At most two active policies per student per year; the lowest resulting tuition wins.",
            "A manual per-student override is separate from these policies.",
          ],
        },
      );
    },
  });
}

export { loadDashboardAnalytics };
