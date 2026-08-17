/**
 * The whole-session context bundle.
 *
 * This tool was the single worst offender for self-contradiction. It carried a
 * `summary` and `classSummaries` built from the financial view with no student
 * filter at all, next to a `dashboardAnalytics` block built by a database
 * function using the collectable rule — and said nothing about the difference.
 * Live, on 2026-27, that was a ₹6.13 lakh gap in one payload, and class totals
 * that differed row by row (Class 6: ₹9,90,892 against ₹9,21,392; SKG: 36
 * students against 32). Whichever block a model read first became its answer.
 *
 * Now every block is built under one declared scope, the headcount block is
 * separate and explicitly on-roll, and a reconciliation section states what the
 * remaining differences are and why they are arithmetic rather than error.
 */

import * as z from "zod/v4";

import { describeScope, describeScopeCount, reconciliation } from "../scope.mjs";
import { createDegradationLog } from "../supabase.mjs";
import { countFinancialRows, getFinancialRows } from "../reads.mjs";
import {
  groupFinancialRows,
  mapFinancialRow,
  routeLabel,
  summarizeFinancialRows,
} from "../shape/student.mjs";
import { loadDashboardAnalytics } from "./money.mjs";
import { todayIst } from "../freshness.mjs";
import { money, number } from "../format.mjs";
import {
  detailObject,
  detailRow,
  isoDate,
  reconciliationBlock,
  safetyBlock,
  scopeBlock,
} from "../schema.mjs";
import {
  defineTool,
  limitSchema,
  scopeSchema,
  sessionSchema,
  toolResult,
  truncationNote,
  withScope,
} from "../toolkit.mjs";

/** Sheets in the app's downloadable AI workbook, for when a full file is wanted. */
const AI_WORKBOOK_SHEETS = [
  "_README",
  "Students",
  "Installments",
  "Payments",
  "Payment Allocations",
  "Adjustments",
  "Refunds",
  "Classes",
  "Routes",
  "Fee Overrides",
  "EMI Plans",
  "EMI Schedule",
  "Late Fee Waivers",
  "Class Fee Settings",
  "Siblings",
  "Student Segments",
  "Discounts",
  "Defaulters",
  "Recovery Follow-Up",
  "Previous Year Dues",
  "Left Student Recovery",
  "Sessions",
];

export function registerAiContextTools(server, ctx) {
  const { env } = ctx;

  defineTool(server, ctx, {
    name: "get_ai_analysis_context",
    studentRows: true,
    title: "Get AI Analysis Context",
    description:
      "Use this when the user wants a broad analysis of the whole session rather than one figure: totals, class and route rollups, the dashboard boards, the biggest debtors and recent collection, all in one call with the vocabulary needed to read them. For a single number prefer get_session_money_summary; for a list prefer query_students.",
    requires: ["dashboard:view", "reports:view", "finance:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      scope: scopeSchema(
        "collectable",
        "Every money block in this payload is built under this one scope, so the blocks agree with each other.",
      ),
      includeStudentRows: z
        .boolean()
        .default(false)
        .describe("Include a sample of per-student rows. Off by default — these payloads get large."),
      studentLimit: limitSchema.default(50),
      topOutstandingLimit: limitSchema.default(25),
    },
    outputSchema: {
      sessionLabel: z.string(),
      asOfDateIst: isoDate,
      scope: scopeBlock,
      safety: safetyBlock,
      sourceOfTruth: detailObject,
      howToReadThis: detailObject,
      // Headcount and money are built under different scopes on purpose;
      // `reconciliation` explains the difference rather than hiding it.
      headcount: detailObject,
      summary: detailObject,
      classSummaries: z.union([z.array(detailRow), detailObject]),
      routeSummaries: z.union([z.array(detailRow), detailObject]),
      enrollmentSummaries: z.union([z.array(detailRow), detailObject]),
      dashboardAnalytics: detailObject.nullable(),
      topOutstanding: z.array(detailRow),
      studentRows: z.array(detailRow),
      reconciliation: reconciliationBlock,
      fullDataExport: detailObject,
      truncation: detailObject,
    },
    handler: async ({ sessionLabel, scope, includeStudentRows, studentLimit, topOutstandingLimit }) => {
      // The reconciliation block below asserts the analytics scope as though the
      // block were present, so a swallowed failure produced a payload that
      // explained a dashboard that wasn't there.
      const degraded = createDegradationLog();
      const [scoped, onRoll, analytics] = await Promise.all([
        getFinancialRows(env, { sessionLabel, scope }),
        // A COUNT, not a read: only `.length` was ever used.
        countFinancialRows(env, { sessionLabel, scope: "on_roll" }),
        degraded.tolerate("get_dashboard_analytics", () => loadDashboardAnalytics(env, sessionLabel), null),
      ]);

      const summary = summarizeFinancialRows(scoped.rows);

      const topOutstanding = [...scoped.rows]
        .filter((row) => number(row.outstanding_amount) > 0)
        .sort((left, right) => {
          const overdue =
            number(right.overdue_installment_count) - number(left.overdue_installment_count);
          if (overdue !== 0) return overdue;
          return number(right.outstanding_amount) - number(left.outstanding_amount);
        })
        .slice(0, topOutstandingLimit)
        .map((row, index) => ({ rank: index + 1, ...mapFinancialRow(row) }));

      const classSummaries = groupFinancialRows(
        scoped.rows,
        (row) => row.class_id,
        (row) => row.class_label || row.class_name,
      );

      // The dashboard function uses the collectable rule internally. Under any
      // other scope the two will differ, so say so rather than presenting both
      // as if they were the same measurement.
      const scopesAgree = scope === "collectable";

      return toolResult(
        `${sessionLabel}: ${onRoll} students on the roll; ${summary.studentCount} in financial scope owing ${money(summary.totalFeesPending)} in fees and ${money(summary.totalLateFeePending)} in late fees.`,
        {
          sessionLabel,
          asOfDateIst: todayIst(),
          // Every money block below carries its own scope, but a client looking
          // for the population this call was made under should find it where
          // every other tool puts it. `headcount` is the deliberate exception
          // and says so in its own block.
          scope: describeScope(scope, scoped.rows),
          safety: {
            readOnly: true,
            recordsChanged: false,
            messagesSent: false,
            paymentsPosted: false,
            dataSource: "live Schoolfees read models",
          },
          sourceOfTruth: {
            studentMaster: "Students",
            feePolicy: "Fee Setup",
            paymentPosting: "Payment Desk only",
            financeHistory: "append-only receipts, payments, adjustments and refunds",
          },
          howToReadThis: {
            note: "The money vocabulary and domain rules are MCP resources, not payload. Read schoolfees://glossary/money and schoolfees://rules/answering once and they apply to every response — they used to be inlined here on every call.",
            resources: ["schoolfees://glossary/money", "schoolfees://rules/answering"],
            orIfYourClientCannotReadResources: "call describe_capabilities",
          },
          headcount: {
            studentsOnRoll: onRoll,
            note: "Roster count. Never quote this as the denominator for a money figure.",
            scope: describeScopeCount("on_roll", onRoll),
          },
          summary: withScope(summary, scope, scoped.rows),
          classSummaries: withScope({ groups: classSummaries }, scope, scoped.rows),
          routeSummaries: withScope(
            {
              groups: groupFinancialRows(
                scoped.rows,
                (row) => row.transport_route_id || "no_transport",
                (row) => routeLabel(row),
              ),
            },
            scope,
            scoped.rows,
          ),
          enrollmentSummaries: withScope(
            {
              groups: groupFinancialRows(
                scoped.rows,
                (row) => row.record_status,
                (row) => row.record_status,
              ),
            },
            scope,
            scoped.rows,
          ),
          dashboardAnalytics: analytics,
          topOutstanding,
          studentRows: includeStudentRows
            ? scoped.rows.slice(0, studentLimit).map(mapFinancialRow)
            : [],
          reconciliation: reconciliation([
            {
              block: "headcount.studentsOnRoll",
              scope: "on_roll",
              count: onRoll,
            },
            {
              block: "summary / classSummaries / routeSummaries / topOutstanding",
              scope,
              count: summary.studentCount,
              differenceExplained: `${summary.studentCount - onRoll} student(s) appear in the money blocks but not in headcount — they have left and still owe.`,
            },
            {
              block: "dashboardAnalytics",
              scope: "collectable",
              agreesWithMoneyBlocks: scopesAgree,
              differenceExplained: scopesAgree
                ? "Built under the same rule as the money blocks above, so class and route totals agree with them."
                : `You asked for scope "${scope}", but the dashboard boards are always built under "collectable". Expect these two sets of class and route totals to differ. Re-run with scope "collectable" if you need them to line up.`,
            },
          ]),
          fullDataExport: {
            webAppPath: `/protected/exports/ai-context-bundle?session=${encodeURIComponent(sessionLabel)}`,
            sheets: AI_WORKBOOK_SHEETS,
            note: "Download this from the office app when every row is needed for offline analysis.",
          },
          truncation: {
            studentRowsReturned: includeStudentRows ? Math.min(studentLimit, scoped.rows.length) : 0,
            studentRowsAvailable: scoped.rows.length,
            ...truncationNote(scoped.truncated, "20000 rows"),
          },
        },
      );
    },
  });
}

export { AI_WORKBOOK_SHEETS };
