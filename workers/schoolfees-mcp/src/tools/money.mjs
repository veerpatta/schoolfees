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

import { createDegradationLog, rpc, selectAll } from "../supabase.mjs";
import { describeScope, describeScopeCount, reconciliation } from "../scope.mjs";
import {
  countFinancialRows,
  getDashboardHeadline,
  getFinancialRows,
  getScopedStudentIds,
} from "../reads.mjs";
import {
  groupFinancialRows,
  routeLabel,
  summarizeFinancialRows,
} from "../shape/student.mjs";
import { INSTALLMENT_FIELDS, mapInstallmentRow } from "../shape/installment.mjs";
import { decodeCursor, money, number, pageInfo, projectAll } from "../format.mjs";
import {
  count,
  degradedBlock,
  detailObject,
  detailRow,
  pageInfoBlock,
  reconciliationBlock,
  rupees,
  scopeBlock,
  truncationFields,
} from "../schema.mjs";
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

/**
 * The five dashboard boards, from the RPC the screen reads.
 *
 * The board objects used to fall back to hand-written zeros — `lateFee` became
 * `{charged: 0, waived: 0, pending: 0}` and `concentration` became all zeros
 * whenever the RPC returned a shape this function did not recognise. Nothing
 * was logged, so "the late-fee ledger is empty" and "the late-fee board could
 * not be read" were the same answer. A missing board is now `null` and the
 * reason is in `degraded`; only the list boards keep an empty-array default,
 * where empty and absent genuinely mean the same thing to a reader.
 */
async function loadDashboardAnalytics(env, sessionLabel) {
  const payload = await rpc(env, "get_dashboard_analytics", { p_session_label: sessionLabel });
  if (!payload || typeof payload !== "object") {
    throw new Error(
      `get_dashboard_analytics returned no payload for ${sessionLabel}. Refusing to render empty boards as a real position.`,
    );
  }

  return {
    sessionLabel,
    debtAge: payload.debtAge || [],
    lateFee: payload.lateFee ?? null,
    monthlyCollection: payload.monthlyCollection || [],
    classRecovery: payload.classRecovery || [],
    routeRecovery: payload.routeRecovery || [],
    concentration: payload.concentration ?? null,
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
    outputSchema: {
      sessionLabel: z.string(),
      headcount: z.looseObject({
        studentsOnRoll: count,
        note: z.string(),
        scope: scopeBlock,
      }),
      // Fees and late fees are separate columns here on purpose and are never
      // summed except as the explicitly named totalCollectable.
      money: z.looseObject({
        studentCount: count,
        onRollCount: count,
        notOnRollCount: count,
        pendingStudentCount: count,
        totalExpectedFees: rupees,
        totalPaid: rupees,
        totalFeesPending: rupees,
        totalLateFeePending: rupees,
        totalCollectable: rupees,
        scope: scopeBlock,
      }),
      yearSplit: detailObject.nullable(),
      /** null means the Dashboard RPC could not be read — see degraded. Never 0. */
      dashboardHeadline: z
        .looseObject({
          totalStudents: count,
          studentsWithPending: count,
          note: z.string(),
        })
        .nullable(),
      reconciliation: reconciliationBlock,
      degraded: degradedBlock,
      ...truncationFields,
    },
    handler: async ({ sessionLabel }) => {
      // A failed RPC used to become `null`, which rendered as "yearSplit
      // unavailable" with no reason given — indistinguishable from a session
      // that genuinely has no previous-year dues.
      const degraded = createDegradationLog();
      const [headline, feeSplit, collectable, onRoll] = await Promise.all([
        degraded.tolerate("get_dashboard_summary", () => getDashboardHeadline(env, sessionLabel), null),
        degraded.tolerate(
          "get_dashboard_fee_split",
          () => rpc(env, "get_dashboard_fee_split", { p_session_label: sessionLabel }),
          null,
        ),
        getFinancialRows(env, { sessionLabel, scope: "collectable" }),
        // A COUNT, not a read. Its only use is the headcount number.
        countFinancialRows(env, { sessionLabel, scope: "on_roll" }),
      ]);

      const moneyTotals = summarizeFinancialRows(collectable.rows);
      const split = Array.isArray(feeSplit) ? feeSplit[0] : feeSplit;

      return toolResult(
        `${sessionLabel}: ${onRoll} students on the roll. Fees pending ${money(moneyTotals.totalFeesPending)} across ${moneyTotals.pendingStudentCount} families, plus ${money(moneyTotals.totalLateFeePending)} of late fee. Collected ${money(moneyTotals.totalPaid)} of ${money(moneyTotals.totalExpectedFees)} expected.`,
        {
          sessionLabel,
          headcount: {
            studentsOnRoll: onRoll,
            note: "Children currently enrolled. A student who has left is not on the roll, however much they owe.",
            scope: describeScopeCount("on_roll", onRoll),
          },
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
          // `null`, never a zero. If this read fails the reason is in
          // `degraded` below; a 0 here would be indistinguishable from a school
          // with no students.
          dashboardHeadline: headline
            ? {
                totalStudents: headline.totalStudents,
                studentsWithPending: headline.studentsWithPending,
                note: "Straight from the same RPC the office Dashboard reads, so these match the screen exactly.",
              }
            : null,
          reconciliation: reconciliation([
            {
              block: "headcount",
              scope: "on_roll",
              count: onRoll,
            },
            {
              block: "money",
              scope: "collectable",
              count: collectable.rows.length,
              differenceExplained: `${collectable.rows.length - onRoll} student(s) are counted in money but not in headcount: they have left and still owe, or paid and then left.`,
            },
          ]),
          degraded: degraded.entries,
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
    outputSchema: {
      sessionLabel: z.string(),
      debtAge: z.array(detailRow),
      /** null means the board could not be read — see degraded. Never zeros. */
      lateFee: detailObject.nullable(),
      monthlyCollection: z.array(detailRow),
      classRecovery: z.array(detailRow),
      routeRecovery: z.array(detailRow),
      concentration: detailObject.nullable(),
      degraded: degradedBlock,
      scope: scopeBlock,
      notes: detailObject,
    },
    handler: async ({ sessionLabel }) => {
      const analytics = await loadDashboardAnalytics(env, sessionLabel);
      const missing = ["lateFee", "concentration"].filter((board) => analytics[board] === null);

      const headline = missing.length
        ? `${sessionLabel}: ${missing.join(" and ")} could not be read — see degraded. ${analytics.classRecovery.length} classes reporting.`
        : `${sessionLabel}: ${money(analytics.concentration.totalPending)} fees pending across ${analytics.concentration.studentsWithDues} families, and ${money(analytics.lateFee.pending)} of late fee pending. ${analytics.classRecovery.length} classes reporting.`;

      return toolResult(headline, {
        ...analytics,
        degraded: missing.map((board) => ({
          source: `get_dashboard_analytics.${board}`,
          reason: "The RPC returned no such board. Reported as null rather than as zeros.",
        })),
        // Derived, not hand-written. This block used to spell the rule as prose
        // — "OR the student has paid something" — where every other tool emits
        // "OR total_paid > 0", so a client comparing two scope rules saw a
        // difference that was not one.
        scope: describeScope("collectable"),
        notes: {
          debtAge:
            "Buckets count installment rows by how long they have been overdue, and exclude carry-forward. The bucket totals therefore do not add up to total fees pending.",
          lateFee:
            "charged is the gross late fee ever raised; waived is what was forgiven; pending is what is still owed. charged minus waived equals pending plus late fee already paid.",
          monthlyCollection:
            "Cash actually received. Discount-mode write-offs and reversed receipts are excluded.",
        },
      });
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
    outputSchema: {
      sessionLabel: z.string(),
      groupBy: z.string(),
      groups: z.array(
        z.looseObject({
          key: z.string().nullable(),
          label: z.string().nullable(),
          studentCount: count,
          onRollCount: count,
        }),
      ),
      totals: z.looseObject({
        studentCount: count,
        onRollCount: count,
        notOnRollCount: count,
        totalFeesPending: rupees,
        totalLateFeePending: rupees,
      }),
      scope: scopeBlock,
      ...truncationFields,
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
      scope: scopeSchema(
        "collectable",
        "The installment view itself carries no enrollment status, so this is applied by joining the student roll.",
      ),
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
    outputSchema: {
      sessionLabel: z.string(),
      filters: detailObject,
      totals: z.looseObject({
        installmentCount: count,
        studentCount: count,
        charged: rupees,
        paid: rupees,
        feesPending: rupees,
        lateFeePending: rupees,
      }),
      installments: z.array(detailRow),
      pageInfo: pageInfoBlock,
      scope: scopeBlock,
      note: z.string(),
      ...truncationFields,
    },
    handler: async (args) => {
      const {
        sessionLabel,
        studentQuery,
        installmentNo,
        balanceStatus,
        lateFeeStatus,
        scope,
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

      const [{ rows, truncated }, roll] = await Promise.all([
        selectAll(env, "v_workbook_installment_balances", params),
        getScopedStudentIds(env, { sessionLabel, scope }),
      ]);
      // The view has no record_status column, so the scope is applied here
      // rather than in the query.
      const mapped = rows.map(mapInstallmentRow).filter((row) => roll.ids.has(row.studentId));
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
          // Counted over distinct students, so `counted` here equals
          // totals.studentCount rather than the installment-row count.
          scope: describeScope(
            scope,
            [...students].map((id) => ({ record_status: roll.statusById.get(id) })),
          ),
          note: "A student who left without paying has no rows here at all — withdrawing cancels their unpaid installments.",
          ...truncationNote(truncated || roll.truncated, "20000 rows"),
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
    // It publishes the late fee, both academic-fee tiers and every route amount.
    // It was the one tool returning money with nothing saying how current it is.
    money: true,
    inputSchema: { sessionLabel: sessionSchema(env) },
    outputSchema: {
      sessionLabel: z.string(),
      policy: detailObject.nullable(),
      classes: z.array(detailRow),
      transportRoutes: z.array(detailRow),
      conventionalDiscountPolicies: z.array(detailRow),
      discountRules: z.array(z.union([z.string(), detailRow])),
      degraded: degradedBlock,
    },
    handler: async ({ sessionLabel }) => {
      const degraded = createDegradationLog();
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
        // Losing these silently is the worst case here: an RTE or Staff Child
        // student would look like they are simply charged less, with no policy
        // named to explain it.
        degraded.tolerate(
          "conventional_discount_policies",
          () =>
            selectAll(env, "conventional_discount_policies", {
              select:
                "code,display_name,calculation_type,fixed_tuition_amount,percentage,is_active,academic_session_label",
              academic_session_label: `eq.${sessionLabel}`,
            }),
          { rows: [] },
        ),
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
          degraded: degraded.entries,
        },
      );
    },
  });
}

export { loadDashboardAnalytics };
