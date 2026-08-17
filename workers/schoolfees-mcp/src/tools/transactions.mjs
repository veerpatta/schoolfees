/**
 * Receipts and collection reporting.
 *
 * The two rules that decide whether a figure is honest, applied here and
 * nowhere else in the old server: a discount-mode receipt is a write-off rather
 * than cash, and a reversed receipt stays visible but never counts as collected.
 */

import * as z from "zod/v4";

import { selectAll } from "../supabase.mjs";
import { getFinancialRows } from "../reads.mjs";
import { describeScope, scopeParams } from "../scope.mjs";
import { getStudentInstallments } from "../shape/installment.mjs";
import {
  finalizeReceiptSummary,
  getAllocationsByReceipt,
  getReversalTotals,
  getStudentIdentities,
  mapAdjustment,
  mapAllocation,
  mapReceiptRow,
  mapRefund,
  RECEIPT_FIELDS,
  summarizeReceipts,
  verifyUrl,
} from "../shape/receipt.mjs";
import { chunk } from "../supabase.mjs";
import { dateDaysAgo, decodeCursor, money, pageInfo, projectAll } from "../format.mjs";
import {
  count,
  detailObject,
  detailRow,
  isoDate,
  pageInfoBlock,
  rupees,
  scopeBlock,
  truncationFields,
} from "../schema.mjs";

/**
 * Cash, write-offs and reversals are three separate figures and are never
 * merged. `studentCount` counts distinct payers in the window — not a roll.
 */
const receiptSummary = z.looseObject({
  receiptCount: count,
  studentCount: count,
  cashCollected: rupees,
  writeOffAmount: rupees,
  reversedAmount: rupees,
});
import {
  cursorSchema,
  defineTool,
  fieldsSchema,
  limitSchema,
  scopeSchema,
  sessionSchema,
  toolResult,
  truncationNote,
} from "../toolkit.mjs";

/**
 * Receipts belonging to a session, resolved through the students in it.
 * `receipts` has no session column — a student's session comes from their class.
 */
async function loadSessionReceipts(env, { sessionLabel, scope, fromDate, toDate, paymentMode, receivedBy, receiptNumber, studentIds }) {
  const ids =
    studentIds ??
    (await getFinancialRows(env, { sessionLabel, scope })).rows
      .map((row) => row.student_id)
      .filter(Boolean);

  if (ids.length === 0) return { rows: [], truncated: false };

  const collected = [];
  let truncated = false;

  for (const idChunk of chunk(ids, 100)) {
    const params = {
      select: RECEIPT_FIELDS,
      student_id: `in.(${idChunk.join(",")})`,
      order: "payment_date.desc,created_at.desc",
    };
    const bounds = [];
    if (fromDate) bounds.push(`payment_date.gte.${fromDate}`);
    if (toDate) bounds.push(`payment_date.lte.${toDate}`);
    if (bounds.length > 0) params.and = `(${bounds.join(",")})`;
    if (paymentMode) params.payment_mode = `eq.${paymentMode}`;
    if (receivedBy) params.received_by = `ilike.*${receivedBy}*`;
    if (receiptNumber) params.receipt_number = `ilike.*${receiptNumber}*`;

    const page = await selectAll(env, "receipts", params);
    collected.push(...page.rows);
    truncated = truncated || page.truncated;
  }

  collected.sort((left, right) => {
    const byDate = String(right.payment_date || "").localeCompare(String(left.payment_date || ""));
    return byDate !== 0
      ? byDate
      : String(right.created_at || "").localeCompare(String(left.created_at || ""));
  });

  return { rows: collected, truncated };
}

async function decorateReceipts(env, rows) {
  const receiptIds = rows.map((row) => row.id);
  const [reversals, identities] = await Promise.all([
    getReversalTotals(env, receiptIds),
    getStudentIdentities(env, rows.map((row) => row.student_id)),
  ]);

  return rows.map((row) =>
    mapReceiptRow(row, {
      reversedAmount: reversals.get(row.id) || 0,
      student: identities.get(row.student_id) || null,
    }),
  );
}

export function registerTransactionTools(server, ctx) {
  const { env } = ctx;

  defineTool(server, ctx, {
    name: "get_recent_payments",
    title: "Get Recent Payments",
    description:
      "Use this when the user asks who paid recently, what came in today, or for the last few days of collection. Cash received, discount write-offs and reversed receipts are reported as three separate figures and never merged.",
    requires: ["payments:view", "receipts:view", "finance:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      days: z.number().int().min(0).max(365).default(7).describe("How many days back from today."),
      scope: scopeSchema(
        "collectable",
        "Payments by students who have since left are real money and are included by default.",
      ),
      limit: limitSchema.default(25),
      cursor: cursorSchema,
      fields: fieldsSchema,
    },
    outputSchema: {
      sessionLabel: z.string(),
      fromDate: isoDate,
      days: z.number().int(),
      summary: receiptSummary,
      payments: z.array(detailRow),
      pageInfo: pageInfoBlock,
      scope: scopeBlock,
      ...truncationFields,
    },
    handler: async ({ sessionLabel, days, scope, limit, cursor, fields }) => {
      const fromDate = dateDaysAgo(days);
      const { rows, truncated } = await loadSessionReceipts(env, {
        sessionLabel,
        scope,
        fromDate,
      });
      const receipts = await decorateReceipts(env, rows);
      const summary = finalizeReceiptSummary(summarizeReceipts(receipts));
      const offset = decodeCursor(cursor);
      const page = receipts.slice(offset, offset + limit);

      return toolResult(
        `${summary.receiptCount} receipt(s) since ${fromDate}: ${money(summary.cashCollected)} collected${summary.writeOffAmount > 0 ? `, plus ${money(summary.writeOffAmount)} written off as discount` : ""}${summary.reversedAmount > 0 ? `, and ${money(summary.reversedAmount)} reversed` : ""}.`,
        {
          sessionLabel,
          fromDate,
          days,
          summary,
          payments: projectAll(page, fields),
          pageInfo: pageInfo({
            offset,
            limit,
            returned: page.length,
            totalCount: receipts.length,
          }),
          // This tool takes a `scope` and used to vary its whole population by
          // it without the response ever saying so. `summary.studentCount` is a
          // count of distinct payers in the window, not a roll — the block
          // stops that being guessed at.
          scope: describeScope(scope),
          ...truncationNote(truncated, "20000 rows"),
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "search_receipts",
    title: "Search Receipts",
    description:
      "Use this to find receipts by number, student, date range, payment mode, or the staff member who took the payment. Reversed receipts are returned and clearly marked rather than hidden.",
    requires: ["receipts:view", "payments:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      receiptNumber: z.string().max(40).optional().describe("Full or partial receipt number, e.g. SVP20260808-0004."),
      studentQuery: z.string().max(80).optional().describe("SR number, student name or phone."),
      fromDate: z.string().optional().describe("ISO date, inclusive."),
      toDate: z.string().optional().describe("ISO date, inclusive."),
      paymentMode: z
        .enum(["cash", "upi", "bank_transfer", "cheque", "discount"])
        .optional()
        .describe("'discount' returns write-offs, which are not cash."),
      receivedBy: z.string().max(80).optional().describe("Staff member who took the payment."),
      scope: scopeSchema("collectable"),
      limit: limitSchema.default(25),
      cursor: cursorSchema,
      fields: fieldsSchema,
    },
    outputSchema: {
      sessionLabel: z.string(),
      filters: detailObject,
      summary: receiptSummary,
      receipts: z.array(detailRow),
      pageInfo: pageInfoBlock,
      scope: scopeBlock,
      ...truncationFields,
    },
    handler: async (args) => {
      const {
        sessionLabel,
        receiptNumber,
        studentQuery,
        fromDate,
        toDate,
        paymentMode,
        receivedBy,
        scope,
        limit,
        cursor,
        fields,
      } = args;

      let studentIds;
      if (studentQuery) {
        const normalized = studentQuery.trim().toLowerCase().replace(/[*,]/g, " ");
        // The scope has to be applied here too. Naming a student used to route
        // around the scope branch below entirely, so the same `scope` value
        // produced a different population depending on whether an unrelated
        // parameter happened to be set — and the payload never said which.
        const { rows: matches } = await selectAll(env, "v_student_directory", {
          select: "student_id",
          session_label: `eq.${sessionLabel}`,
          search_text: `ilike.*${normalized}*`,
          ...scopeParams(scope),
        });
        studentIds = matches.map((row) => row.student_id);
        if (studentIds.length === 0) {
          return toolResult(`No student matched "${studentQuery}" in ${sessionLabel}.`, {
            sessionLabel,
            receipts: [],
            summary: null,
            scope: describeScope(scope),
          });
        }
      }

      const { rows, truncated } = await loadSessionReceipts(env, {
        sessionLabel,
        scope,
        fromDate,
        toDate,
        paymentMode,
        receivedBy,
        receiptNumber,
        studentIds,
      });

      const receipts = await decorateReceipts(env, rows);
      const summary = finalizeReceiptSummary(summarizeReceipts(receipts));
      const offset = decodeCursor(cursor);
      const page = receipts.slice(offset, offset + limit);

      return toolResult(
        `${summary.receiptCount} receipt(s) matched in ${sessionLabel}: ${money(summary.cashCollected)} collected across ${summary.studentCount} student(s).`,
        {
          sessionLabel,
          filters: {
            receiptNumber: receiptNumber || null,
            studentQuery: studentQuery || null,
            fromDate: fromDate || null,
            toDate: toDate || null,
            paymentMode: paymentMode || null,
            receivedBy: receivedBy || null,
          },
          summary,
          receipts: projectAll(page, fields),
          pageInfo: pageInfo({ offset, limit, returned: page.length, totalCount: receipts.length }),
          scope: describeScope(scope),
          ...truncationNote(truncated, "20000 rows"),
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_receipt",
    title: "Get Receipt Detail",
    description:
      "Use this for one receipt in full: which installments the money was allocated to, the balance shown to the parent at the time, any corrections or refunds against it, whether it was reversed, and the public verification link.",
    requires: ["receipts:view", "payments:view"],
    money: true,
    inputSchema: {
      receiptNumber: z.string().min(3).max(40).describe("The receipt number, e.g. SVP20260808-0004."),
      sessionLabel: sessionSchema(env),
    },
    outputSchema: {
      receiptNumber: z.string(),
      /** null when no receipt matched. A reversed receipt is still returned, marked. */
      receipt: detailObject.nullable(),
      note: z.string().optional(),
    },
    handler: async ({ receiptNumber, sessionLabel }) => {
      const { rows } = await selectAll(env, "receipts", {
        select: RECEIPT_FIELDS,
        receipt_number: `eq.${receiptNumber}`,
        limit: 1,
      });

      const row = rows[0];
      if (!row) {
        return toolResult(`No receipt found with number ${receiptNumber}.`, {
          receiptNumber,
          receipt: null,
        });
      }

      const [decorated] = await decorateReceipts(env, [row]);
      const [allocations, installments, adjustmentRows, refundRows] = await Promise.all([
        getAllocationsByReceipt(env, [row.id]),
        getStudentInstallments(env, row.student_id, sessionLabel),
        selectAll(env, "payment_adjustments", {
          select: "id,payment_id,installment_id,adjustment_type,amount_delta,reason,notes,created_at",
          student_id: `eq.${row.student_id}`,
          order: "created_at.asc",
        }),
        selectAll(env, "refund_requests", {
          select:
            "id,receipt_id,refund_date,requested_amount,refund_method,refund_reference,reason,notes,status,created_at,approved_at,processed_at",
          receipt_id: `eq.${row.id}`,
        }),
      ]);

      const installmentById = new Map(installments.map((item) => [item.installmentId, item]));
      const payments = allocations.get(row.id) || [];
      const paymentIds = new Set(payments.map((payment) => payment.id));
      const adjustmentsByPayment = new Map();
      for (const adjustment of adjustmentRows.rows) {
        if (!paymentIds.has(adjustment.payment_id)) continue;
        const bucket = adjustmentsByPayment.get(adjustment.payment_id) || [];
        bucket.push(mapAdjustment(adjustment));
        adjustmentsByPayment.set(adjustment.payment_id, bucket);
      }

      return toolResult(
        `Receipt ${receiptNumber}: ${money(decorated.receiptTotalAmount)} on ${decorated.paymentDate} by ${decorated.paymentMode}${decorated.isFullyReversed ? " — REVERSED, not counted as collection" : ""}.`,
        {
          // Echoed on both paths, so a caller correlating a batch of lookups
          // does not have to reach into `receipt` on one and not the other.
          receiptNumber,
          receipt: {
            ...decorated,
            verifyUrl: verifyUrl(env, receiptNumber),
            allocations: payments.map((payment) => ({
              ...mapAllocation(payment, installmentById.get(payment.installment_id)),
              adjustments: adjustmentsByPayment.get(payment.id) || [],
            })),
            refunds: refundRows.rows.map(mapRefund),
          },
          note: "pendingBeforePosting and pendingAfterPosting are frozen at posting time, so a reprint always shows the balance the parent was actually told.",
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_collection_report",
    title: "Get Collection Report",
    description:
      "Use this for collection totals over a period, broken down by day, month, payment mode, or the staff member who took the money. Keeps cash, discount write-offs and reversals separate so 'collected' means what actually came in.",
    requires: ["finance:view", "reports:view", "payments:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      fromDate: z.string().optional().describe("ISO date, inclusive. Defaults to 30 days ago."),
      toDate: z.string().optional().describe("ISO date, inclusive."),
      groupBy: z.enum(["day", "month", "paymentMode", "receivedBy"]).default("day"),
      scope: scopeSchema("collectable"),
    },
    outputSchema: {
      sessionLabel: z.string(),
      fromDate: isoDate,
      toDate: isoDate.nullable(),
      groupBy: z.string(),
      summary: receiptSummary,
      groups: z.array(
        z.looseObject({
          key: z.string(),
          receiptCount: count,
          studentCount: count,
          cashCollected: rupees,
          writeOffAmount: rupees,
          reversedAmount: rupees,
        }),
      ),
      note: z.string(),
      scope: scopeBlock,
      ...truncationFields,
    },
    handler: async ({ sessionLabel, fromDate, toDate, groupBy, scope }) => {
      const from = fromDate || dateDaysAgo(30);
      const { rows, truncated } = await loadSessionReceipts(env, {
        sessionLabel,
        scope,
        fromDate: from,
        toDate,
      });
      const receipts = await decorateReceipts(env, rows);

      const keyOf = {
        day: (receipt) => receipt.paymentDate || "unknown",
        month: (receipt) => (receipt.paymentDate || "unknown").slice(0, 7),
        paymentMode: (receipt) => receipt.paymentMode || "unknown",
        receivedBy: (receipt) => receipt.receivedBy || "unknown",
      }[groupBy];

      const groups = new Map();
      for (const receipt of receipts) {
        const key = keyOf(receipt);
        const current = groups.get(key) || {
          key,
          receiptCount: 0,
          cashCollected: 0,
          writeOffAmount: 0,
          reversedAmount: 0,
          students: new Set(),
        };
        current.receiptCount += 1;
        current.cashCollected += receipt.cashCollectedAmount;
        current.writeOffAmount += receipt.writeOffAmount;
        current.reversedAmount += receipt.reversedAmount;
        current.students.add(receipt.studentId);
        groups.set(key, current);
      }

      const rowsOut = [...groups.values()]
        .map(({ students, ...rest }) => ({ ...rest, studentCount: students.size }))
        .sort((a, b) => String(b.key).localeCompare(String(a.key)));

      const summary = finalizeReceiptSummary(summarizeReceipts(receipts));

      return toolResult(
        `${sessionLabel}, ${from} to ${toDate || "today"}: ${money(summary.cashCollected)} collected across ${summary.receiptCount} receipt(s) from ${summary.studentCount} student(s).`,
        {
          sessionLabel,
          fromDate: from,
          toDate: toDate || null,
          groupBy,
          summary,
          groups: rowsOut,
          note: "cashCollected is money actually received: discount-mode write-offs and reversed amounts are reported separately and never added to it. studentCount counts distinct payers in the window, not students on the roll.",
          // Same omission as get_recent_payments: a `scope` input that changed
          // the population with nothing in the response admitting it.
          scope: describeScope(scope),
          ...truncationNote(truncated, "20000 rows"),
        },
      );
    },
  });
}
