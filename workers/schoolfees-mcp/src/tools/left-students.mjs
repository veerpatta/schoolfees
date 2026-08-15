/**
 * Students who are no longer on the roll but still owe, and last year's dues.
 *
 * Neither of these had any MCP surface at all before. The office app has a whole
 * module for them (`lib/recovery`), because the money is real: a family that
 * paid part of the year and then withdrew keeps its remaining installments, and
 * somebody has to collect them.
 *
 * The complement holds too, and is why this list is short: withdrawing a student
 * cancels every clean unpaid installment, so a leaver who never paid anything
 * carries nothing and correctly appears nowhere.
 */

import * as z from "zod/v4";

import { selectAll } from "../supabase.mjs";
import { getFinancialRows } from "../reads.mjs";
import { mapFinancialRow } from "../shape/student.mjs";
import { getInstallmentsForStudents } from "../shape/installment.mjs";
import { money, number } from "../format.mjs";
import {
  defineTool,
  limitSchema,
  sessionSchema,
  toolResult,
  truncationNote,
  withScope,
} from "../toolkit.mjs";

/** Named rather than `select: "*"`, so a view change cannot quietly widen the payload. */
const CARRY_FORWARD_FIELDS = [
  "student_id",
  "admission_no",
  "student_name",
  "father_name",
  "father_phone",
  "class_label",
  "source_session_label",
  "target_session_label",
  "fee_head",
  "installment_label",
  "due_date",
  "original_amount",
  "collected_amount",
  "remaining_amount",
  "balance_status",
  "status",
].join(",");

export function registerLeftStudentTools(server, ctx) {
  const { env } = ctx;

  defineTool(server, ctx, {
    name: "get_left_student_recovery",
    studentRows: true,
    title: "Get Left-Student Recovery Queue",
    description:
      "Use this for students who have LEFT, graduated or gone inactive and still owe money. These families are not on the defaulter list — that one covers currently enrolled students — but the debt is real and collectable.",
    requires: ["defaulters:view", "finance:view", "reports:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      statuses: z
        .array(z.enum(["left", "graduated", "inactive"]))
        .default(["left", "graduated", "inactive"])
        .describe("Which non-active statuses to include."),
      includeDues: z
        .boolean()
        .default(true)
        .describe("Include the installment-level breakdown for each student."),
      limit: limitSchema.default(50),
    },
    handler: async ({ sessionLabel, statuses, includeDues, limit }) => {
      const { rows } = await getFinancialRows(env, { sessionLabel, scope: "left_owing" });
      const wanted = new Set(statuses);
      const matching = rows.filter((row) => wanted.has(row.record_status)).slice(0, limit);

      // One bulk read for the whole page, not one request per student in series.
      const duesByStudent = includeDues
        ? await getInstallmentsForStudents(env, matching.map((row) => row.student_id), sessionLabel)
        : null;

      const students = matching.map((row) => {
        const mapped = mapFinancialRow(row);
        return {
          ...mapped,
          ...(duesByStudent ? { dues: duesByStudent.get(row.student_id) || [] } : {}),
        };
      });

      const totals = students.reduce(
        (acc, student) => ({
          feesPending: acc.feesPending + student.feesPendingAmount,
          lateFeePending: acc.lateFeePending + student.lateFeePendingAmount,
          alreadyPaid: acc.alreadyPaid + student.totalPaid,
        }),
        { feesPending: 0, lateFeePending: 0, alreadyPaid: 0 },
      );

      const statusCounts = students.reduce((acc, student) => {
        const key = student.enrollment.status;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      return toolResult(
        students.length === 0
          ? `No students who have left ${sessionLabel} are still carrying dues. A leaver who never paid has their unpaid installments cancelled, so this list is expected to be short.`
          : `${students.length} student(s) no longer on the roll still owe ${money(totals.feesPending)} in fees${totals.lateFeePending > 0 ? ` plus ${money(totals.lateFeePending)} late fee` : ""}. They had already paid ${money(totals.alreadyPaid)} before leaving.`,
        withScope(
          {
            sessionLabel,
            statusCounts,
            totals: { ...totals, totalCollectable: totals.feesPending + totals.lateFeePending },
            students,
            note: "These students are NOT on the roll and must not be counted in headcount. Their dues are counted in every money figure, because a student who left owing money still owes it.",
          },
          "left_owing",
          matching,
        ),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_prev_year_dues",
    title: "Get Previous-Year Dues (Carry-Forward)",
    description:
      "Use this for last year's unpaid tuition, which is carried onto this year's ledger as carry-forward installments. Answers 'how much old balance is outstanding' and 'who still owes from 2025-26'. Carry-forward rows never accrue a late fee.",
    requires: ["fees:view", "finance:view", "reports:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      onlyOutstanding: z
        .boolean()
        .default(true)
        .describe("Only students who still owe on the carry-forward balance."),
      limit: limitSchema.default(100),
    },
    handler: async ({ sessionLabel, onlyOutstanding, limit }) => {
      // Filtered in the database, not in JS. This used to read every
      // carry-forward row that has ever existed, capped at 5,000, swallow any
      // failure into an empty list, and then discard the truncation flag — three
      // separate ways to report "no old dues" when the truth was unknown.
      const params = {
        select: CARRY_FORWARD_FIELDS,
        or: `(target_session_label.is.null,target_session_label.eq.${sessionLabel})`,
        order: "remaining_amount.desc",
      };
      if (onlyOutstanding) params.remaining_amount = "gt.0";

      const { rows, truncated } = await selectAll(env, "v_student_carry_forward_balances", params);

      const mapped = rows
        // Column names verified against v_student_carry_forward_balances. This
        // view carries the balance, not the student's enrollment status — use
        // search_students or get_student if you need to know whether the child
        // is still on the roll.
        .map((row) => ({
          studentId: row.student_id,
          admissionNo: row.admission_no ?? null,
          studentName: row.student_name ?? null,
          fatherName: row.father_name ?? null,
          fatherPhone: row.father_phone ?? null,
          classLabel: row.class_label ?? null,
          sourceSessionLabel: row.source_session_label,
          targetSessionLabel: row.target_session_label,
          feeHead: row.fee_head ?? null,
          installmentLabel: row.installment_label ?? null,
          dueDate: row.due_date ?? null,
          originalAmount: number(row.original_amount),
          collectedAmount: number(row.collected_amount),
          remainingAmount: number(row.remaining_amount),
          balanceStatus: row.balance_status ?? null,
          status: row.status,
        }));

      // Totals cover every matching row. They used to be summed after the page
      // slice, so "Rs X still owed" silently meant "owed by the rows that fit in
      // this page" — right at the default limit, wrong the moment it was raised.
      const totals = mapped.reduce(
        (acc, row) => ({
          original: acc.original + row.originalAmount,
          collected: acc.collected + row.collectedAmount,
          remaining: acc.remaining + row.remainingAmount,
        }),
        { original: 0, collected: 0, remaining: 0 },
      );

      const page = mapped.slice(0, limit);

      return toolResult(
        `${mapped.length} carry-forward balance(s) into ${sessionLabel}: ${money(totals.remaining)} still owed from ${money(totals.original)} originally carried, ${money(totals.collected)} recovered so far.`,
        {
          sessionLabel,
          totals,
          balanceCount: mapped.length,
          balances: page,
          balancesReturned: page.length,
          note: "Previous-year dues live on this year's students as carry-forward installments. Split current from previous year on is_carry_forward, never on session_label — 2025-26 does not exist as a session of its own. Totals cover every matching balance; `balances` is the first `limit` of them.",
          ...truncationNote(truncated, "20000 rows"),
        },
      );
    },
  });
}
