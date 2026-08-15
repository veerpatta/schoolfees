/**
 * Everything about a child.
 *
 * `search_students` finds them, `get_student` answers almost anything about one,
 * and `query_students` is the escape hatch: rather than a new tool per question,
 * it exposes the same 27 filter chips the office app's Students screen uses,
 * over the same view, with grouping and aggregation. That is what makes an
 * unanticipated question answerable without a redeploy.
 */

import * as z from "zod/v4";

import { chunk, selectAll } from "../supabase.mjs";
import { scopeParams } from "../scope.mjs";
import { mapDirectoryRow, mapFinancialRow, FINANCIAL_FIELDS } from "../shape/student.mjs";
import {
  getStudentInstallments,
  splitCurrentAndCarryForward,
  previewAllocation,
} from "../shape/installment.mjs";
import { getActivePlan, getPlanHistory } from "../shape/plan.mjs";
import { getContactLog } from "../shape/contact.mjs";
import {
  getAllocationsByReceipt,
  getReversalTotals,
  mapAdjustment,
  mapAllocation,
  mapReceiptRow,
  mapRefund,
  RECEIPT_FIELDS,
  verifyUrl,
} from "../shape/receipt.mjs";
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

/**
 * The office app's filter chips, each a boolean column on v_student_directory.
 * Mirrors lib/segments/student-segments.ts.
 */
export const SEGMENTS = {
  // money
  oldBalanceDue: "seg_old_balance_due",
  overdue: "seg_overdue",
  lateFeePending: "seg_late_fee_pending",
  neverPaid: "seg_never_paid",
  partlyPaid: "seg_partly_paid",
  yearClear: "seg_year_clear",
  hasDues: "seg_has_dues",
  onEmi: "seg_on_emi",
  emiDue: "seg_emi_due",
  emiMissed: "seg_emi_missed",
  // enrolment
  active: "seg_active",
  left: "seg_left",
  leftOwing: "seg_left_owing",
  graduated: "seg_graduated",
  newThisYear: "seg_new_this_year",
  // data quality
  missingPhone: "seg_missing_phone",
  duesNotPrepared: "seg_dues_not_prepared",
  missingDob: "seg_missing_dob",
  duplicateSr: "seg_duplicate_sr",
  pendingSr: "seg_pending_sr",
  // fee profile
  onTransport: "seg_on_transport",
  hasDiscount: "seg_has_discount",
  discountRte: "seg_discount_rte",
  discountStaffChild: "seg_discount_staff_child",
  discountThirdChild: "seg_discount_third_child",
  feeException: "seg_fee_exception",
  lateFeeWaived: "seg_late_fee_waived",
};

const SEGMENT_IDS = Object.keys(SEGMENTS);

export const DIRECTORY_FIELDS = [
  "student_id",
  "admission_no",
  "full_name",
  "date_of_birth",
  "father_name",
  "mother_name",
  "primary_phone",
  "secondary_phone",
  "record_status",
  "class_id",
  "class_label",
  "session_label",
  "transport_route_id",
  "transport_route_name",
  "transport_route_code",
  "transport_fee",
  "status_label",
  "student_status_label",
  "outstanding_amount",
  "base_outstanding_amount",
  "late_fee_outstanding_amount",
  "old_balance_amount",
  "overdue_base_amount",
  "pending_late_fee_amount",
  "total_paid",
  "base_charge_total",
  "discount_amount",
  "conventional_discount_labels",
  "last_payment_date",
  "repayment_plan_id",
  "repayment_scope",
  "repayment_payment_status",
  "repayment_monthly_amount",
  "repayment_remaining_balance",
  "repayment_catch_up_amount",
  "repayment_missed_count",
  "repayment_next_due_date",
  "repayment_end_date",
  "repayment_plan_review_needed",
  ...Object.values(SEGMENTS),
].join(", ");

/**
 * The student record itself, beyond the money.
 *
 * Column names verified against the live schema: the address is one free-text
 * field plus village_city / tehsil / district / state / pincode, and there is no
 * `aadhaar_number`. PostgREST returns 400 for a column that does not exist, so
 * these cannot be guessed — `npm run verify:mcp-health` checks this list against
 * the real database, because the unit tests mock it and cannot.
 */
export const STUDENT_MASTER_FIELDS = [
  "id",
  "admission_no",
  "full_name",
  "date_of_birth",
  "gender",
  "category",
  "religion",
  "blood_group",
  "father_name",
  "mother_name",
  "primary_phone",
  "secondary_phone",
  "email",
  "guardian_name",
  "guardian_relation",
  "guardian_phone",
  "emergency_contact_name",
  "emergency_contact_phone",
  "address",
  "village_city",
  "tehsil",
  "district",
  "state",
  "pincode",
  "status",
  "joined_on",
  "left_on",
  "tc_number",
  "roll_no",
  "house",
  "previous_school",
  "notes",
  "photo_path",
  "created_at",
  "updated_at",
].join(", ");

/** Numeric columns a caller may put a range filter on. */
const FILTERABLE_AMOUNTS = {
  feesPending: "outstanding_amount",
  lateFeePending: "late_fee_outstanding_amount",
  totalPaid: "total_paid",
  feesExpected: "base_charge_total",
  oldBalance: "old_balance_amount",
  overdueBase: "overdue_base_amount",
  discount: "discount_amount",
};

async function findStudentRow(env, { query, sessionLabel, scope }) {
  const rows = await searchDirectory(env, { query, sessionLabel, scope, limit: 1 });
  return rows.rows[0] || null;
}

async function searchDirectory(env, { query, sessionLabel, scope, classId, routeId, segments, limit = 20, offset = 0, order }) {
  const params = {
    select: DIRECTORY_FIELDS,
    session_label: `eq.${sessionLabel}`,
    order: order || "class_sort_order.asc,full_name.asc",
    limit,
    offset,
    ...scopeParams(scope),
  };

  const normalized = (query || "").trim().toLowerCase();
  if (normalized) {
    // search_text is a lowercased concat of name, admission no, class, both
    // phones and both parents — the fields someone would actually type.
    params.search_text = `ilike.*${normalized.replace(/[*,]/g, " ")}*`;
  }
  if (classId) params.class_id = `eq.${classId}`;
  if (routeId) params.transport_route_id = `eq.${routeId}`;
  for (const segment of segments || []) {
    const column = SEGMENTS[segment];
    if (column) params[column] = "is.true";
  }

  const { rows, truncated } = await selectAll(env, "v_student_directory", params);
  return { rows, truncated };
}

export function registerStudentTools(server, ctx) {
  const { env } = ctx;

  defineTool(server, ctx, {
    name: "search_students",
    studentRows: true,
    title: "Search Students",
    description:
      "Use this to find a student by name, admission (SR) number, class, parent name or phone number. Returns identity, enrollment status and a money summary for each match. Search runs in the database, so a partial name or a phone fragment is enough.",
    requires: ["students:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z
        .string()
        .min(1)
        .max(80)
        .describe("Name, admission number, class label, parent name, or phone number."),
      scope: scopeSchema(
        "collectable",
        "Use on_roll to search only currently enrolled students; collectable also finds students who left owing money.",
      ),
      classId: z.string().uuid().optional().describe("Restrict to one class."),
      limit: limitSchema.default(10),
      cursor: cursorSchema,
      fields: fieldsSchema,
    },
    handler: async ({ sessionLabel, query, scope, classId, limit, cursor, fields }) => {
      const offset = decodeCursor(cursor);
      const { rows } = await searchDirectory(env, {
        query,
        sessionLabel,
        scope,
        classId,
        limit,
        offset,
      });

      const students = projectAll(rows.map(mapDirectoryRow), fields);
      const leavers = rows.filter((row) => row.record_status !== "active").length;

      return toolResult(
        students.length === 0
          ? `No student matched "${query}" in ${sessionLabel} under the ${scope} scope. Try a shorter fragment, or scope "everyone" if the student may have left without paying.`
          : `${students.length} student(s) matched "${query}" in ${sessionLabel}${leavers > 0 ? `, including ${leavers} no longer on the roll` : ""}.`,
        withScope(
          {
            sessionLabel,
            query,
            students,
            pageInfo: pageInfo({ offset, limit, returned: students.length, totalCount: null }),
          },
          scope,
          rows,
        ),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_student",
    studentRows: true,
    title: "Get Student (Full Record)",
    description:
      "Use this for everything about ONE student: personal and parent details, enrollment status, resolved fee structure and why each charge is what it is, every installment, receipts and how each was allocated, corrections, refunds, EMI plan and its history, siblings, discounts, last year's carry-forward, and follow-up call history. Choose sections with `include` to keep the response small.",
    requires: ["students:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z
        .string()
        .min(1)
        .max(80)
        .describe("Admission (SR) number, name, or phone. The best single match is returned."),
      include: z
        .array(
          z.enum([
            "installments",
            "receipts",
            "plan",
            "family",
            "contacts",
            "allocationPreview",
          ]),
        )
        .default(["installments", "plan"])
        .describe(
          "Sections to load. installments = the fee schedule and what is owed on each. receipts = payment history with allocations, corrections and refunds. plan = EMI plan and its full rescheduling history. family = siblings and the family group. contacts = follow-up call log. allocationPreview = exactly what the Payment Desk would allocate a payment to next.",
        ),
      receiptLimit: limitSchema.default(25),
    },
    handler: async ({ sessionLabel, query, include, receiptLimit }) => {
      const directoryRow = await findStudentRow(env, {
        query,
        sessionLabel,
        scope: "everyone",
      });

      if (!directoryRow) {
        return toolResult(
          `No student found for "${query}" in ${sessionLabel}.`,
          { sessionLabel, query, student: null },
        );
      }

      const studentId = directoryRow.student_id;

      const [{ rows: financialRows }, { rows: masterRows }] = await Promise.all([
        selectAll(env, "v_workbook_student_financials", {
          select: FINANCIAL_FIELDS,
          student_id: `eq.${studentId}`,
          session_label: `eq.${sessionLabel}`,
          limit: 1,
        }),
        selectAll(env, "students", {
          select: STUDENT_MASTER_FIELDS,
          id: `eq.${studentId}`,
          limit: 1,
        }),
      ]);

      const financial = financialRows[0] ? mapFinancialRow(financialRows[0]) : null;
      const master = masterRows[0] || {};
      const student = {
        ...(financial || mapDirectoryRow(directoryRow)),
        record: {
          gender: master.gender || null,
          category: master.category || null,
          bloodGroup: master.blood_group || null,
          email: master.email || null,
          guardianName: master.guardian_name || null,
          guardianRelation: master.guardian_relation || null,
          guardianPhone: master.guardian_phone || null,
          emergencyContactName: master.emergency_contact_name || null,
          emergencyContactPhone: master.emergency_contact_phone || null,
          religion: master.religion || null,
          rollNo: master.roll_no || null,
          house: master.house || null,
          previousSchool: master.previous_school || null,
          address:
            [master.address, master.village_city, master.tehsil, master.district, master.state, master.pincode]
              .filter(Boolean)
              .join(", ") || null,
          joinedOn: master.joined_on || null,
          leftOn: master.left_on || null,
          tcNumber: master.tc_number || null,
          notes: master.notes || null,
          hasPhoto: Boolean(master.photo_path),
        },
        segments: mapDirectoryRow(directoryRow).segments,
      };

      const sections = new Set(include);
      const payload = { sessionLabel, query, student };

      if (sections.has("installments")) {
        const installments = await getStudentInstallments(env, studentId, sessionLabel);
        payload.installments = installments;
        payload.yearSplit = splitCurrentAndCarryForward(installments);
      }

      if (sections.has("plan")) {
        const [active, history] = await Promise.all([
          getActivePlan(env, { studentId, sessionLabel }),
          getPlanHistory(env, { studentId, sessionLabel }),
        ]);
        payload.repaymentPlan = active;
        // Superseded and cancelled plans are included on purpose: rescheduling
        // writes a replacement, and the schedule a parent was originally shown
        // must stay visible.
        payload.repaymentPlanHistory = history;
      }

      if (sections.has("receipts")) {
        payload.receiptHistory = await loadReceiptHistory(env, {
          studentId,
          sessionLabel,
          receiptLimit,
        });
      }

      if (sections.has("family")) {
        payload.family = await loadFamily(env, studentId, sessionLabel);
      }

      if (sections.has("contacts")) {
        payload.contactLog = await getContactLog(env, studentId, sessionLabel);
      }

      if (sections.has("allocationPreview")) {
        payload.allocationPreview = {
          note: "What the Payment Desk would settle first if a payment were taken now. Read-only — nothing is posted.",
          rows: await previewAllocation(env, studentId),
        };
      }

      const enrollment = student.enrollment;
      return toolResult(
        `${student.studentName} (${student.admissionNo}, ${student.classLabel}) — ${enrollment.onRoll ? "on roll" : `${enrollment.label.toLowerCase()}, not on the roll`}. Fees pending ${money(student.feesPendingAmount)}, late fee pending ${money(student.lateFeePendingAmount)}.`,
        payload,
      );
    },
  });

  defineTool(server, ctx, {
    name: "query_students",
    studentRows: true,
    title: "Query Students (Filter, Group, Total)",
    description:
      "The general-purpose student query. Use it for any list or count the other tools do not cover: 'every student on transport with dues over 20,000', 'RTE students in Class 8', 'who has an EMI plan and has missed it', 'students with no phone number'. Filter by the same chips the office app uses, add amount ranges, group and total. Returns rows, group rollups and a whole-set summary.",
    requires: ["students:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      scope: scopeSchema("collectable"),
      segments: z
        .array(z.enum(SEGMENT_IDS))
        .default([])
        .describe(
          `Filter chips, all must match. Money: oldBalanceDue, overdue, lateFeePending, neverPaid, partlyPaid, yearClear, hasDues, onEmi, emiDue, emiMissed. Enrolment: active, left, leftOwing, graduated, newThisYear. Data quality: missingPhone, duesNotPrepared, missingDob, duplicateSr, pendingSr. Fee profile: onTransport, hasDiscount, discountRte, discountStaffChild, discountThirdChild, feeException, lateFeeWaived.`,
        ),
      query: z.string().max(80).optional().describe("Optional free-text match on name, SR, class, parent or phone."),
      classId: z.string().uuid().optional(),
      routeId: z.string().uuid().optional(),
      minAmount: z
        .number()
        .int()
        .optional()
        .describe("Lower bound (inclusive) on the column named by amountField."),
      maxAmount: z.number().int().optional().describe("Upper bound (inclusive) on amountField."),
      amountField: z
        .enum(Object.keys(FILTERABLE_AMOUNTS))
        .default("feesPending")
        .describe("Which amount minAmount/maxAmount apply to."),
      groupBy: z
        .enum(["none", "class", "route", "enrollmentStatus", "moneySegment"])
        .default("none")
        .describe("Add rollup totals grouped by this dimension."),
      sort: z
        .enum(["name", "class", "feesPendingDesc", "totalPaidDesc", "lastPaymentDesc"])
        .default("class"),
      limit: limitSchema.default(25),
      cursor: cursorSchema,
      fields: fieldsSchema,
      includeRows: z
        .boolean()
        .default(true)
        .describe("Set false for a count-and-total-only answer with no student rows."),
    },
    handler: async (args) => {
      const {
        sessionLabel,
        scope,
        segments,
        query,
        classId,
        routeId,
        minAmount,
        maxAmount,
        amountField,
        groupBy,
        sort,
        limit,
        cursor,
        fields,
        includeRows,
      } = args;

      const offset = decodeCursor(cursor);
      const orderBy = {
        name: "full_name.asc",
        class: "class_sort_order.asc,full_name.asc",
        feesPendingDesc: "outstanding_amount.desc",
        totalPaidDesc: "total_paid.desc",
        lastPaymentDesc: "last_payment_date.desc.nullslast",
      }[sort];

      // Read the whole filtered set: totals must cover everything that matches,
      // not just the page being returned.
      const params = {
        select: DIRECTORY_FIELDS,
        session_label: `eq.${sessionLabel}`,
        order: orderBy,
        ...scopeParams(scope),
      };
      const normalized = (query || "").trim().toLowerCase();
      if (normalized) params.search_text = `ilike.*${normalized.replace(/[*,]/g, " ")}*`;
      if (classId) params.class_id = `eq.${classId}`;
      if (routeId) params.transport_route_id = `eq.${routeId}`;
      for (const segment of segments) {
        const column = SEGMENTS[segment];
        if (column) params[column] = "is.true";
      }
      // A column key can only carry one operator, so a two-sided range goes
      // through `and=(...)`. Using it for the one-sided case too keeps the
      // bounds in a single place rather than two code paths that can disagree.
      const amountColumn = FILTERABLE_AMOUNTS[amountField];
      const bounds = [];
      if (typeof minAmount === "number") bounds.push(`${amountColumn}.gte.${minAmount}`);
      if (typeof maxAmount === "number") bounds.push(`${amountColumn}.lte.${maxAmount}`);
      if (bounds.length > 0) params.and = `(${bounds.join(",")})`;

      const { rows, truncated } = await selectAll(env, "v_student_directory", params);

      const summary = rows.reduce(
        (acc, row) => {
          acc.studentCount += 1;
          if (row.record_status === "active") acc.onRollCount += 1;
          acc.feesExpected += number(row.base_charge_total);
          acc.totalPaid += number(row.total_paid);
          acc.feesPending += number(row.outstanding_amount);
          acc.lateFeePending += number(row.late_fee_outstanding_amount);
          acc.oldBalancePending += number(row.old_balance_amount);
          acc.discount += number(row.discount_amount);
          return acc;
        },
        {
          studentCount: 0,
          onRollCount: 0,
          feesExpected: 0,
          totalPaid: 0,
          feesPending: 0,
          lateFeePending: 0,
          oldBalancePending: 0,
          discount: 0,
        },
      );
      summary.totalCollectable = summary.feesPending + summary.lateFeePending;

      const page = rows.slice(offset, offset + limit).map(mapDirectoryRow);

      return toolResult(
        `${summary.studentCount} student(s) matched in ${sessionLabel}${segments.length ? ` [${segments.join(", ")}]` : ""}. Fees pending ${money(summary.feesPending)}, late fee pending ${money(summary.lateFeePending)}.`,
        withScope(
          {
            sessionLabel,
            filters: {
              segments,
              query: query || null,
              classId: classId || null,
              routeId: routeId || null,
              amountField,
              minAmount: minAmount ?? null,
              maxAmount: maxAmount ?? null,
            },
            summary,
            groups: groupBy === "none" ? null : groupDirectoryRows(rows, groupBy),
            students: includeRows ? projectAll(page, fields) : [],
            pageInfo: pageInfo({
              offset,
              limit,
              returned: includeRows ? page.length : 0,
              totalCount: rows.length,
            }),
            ...truncationNote(truncated, "20000 rows"),
          },
          scope,
          rows,
        ),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_student_financial_history",
    studentRows: true,
    title: "Get Student Financial History",
    description:
      "Use this for a student's exact payment record: every receipt, what each was allocated to, the balance shown to the parent at the time, corrections, refunds, and their EMI plan history including plans that were superseded. Read-only — it changes nothing.",
    requires: ["payments:view", "receipts:view", "ledger:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z.string().min(1).max(80).describe("Student name, admission number, class, or parent phone."),
      scope: scopeSchema(
        "everyone",
        "Defaults to everyone: a payment history question is about what happened, so a student who has since left must still be findable.",
      ),
      limit: limitSchema.default(3).describe("How many matching students to return."),
      receiptLimit: limitSchema.default(25),
    },
    handler: async ({ sessionLabel, query, scope, limit, receiptLimit }) => {
      const { rows } = await searchDirectory(env, {
        query,
        sessionLabel,
        scope,
        limit,
      });

      const students = [];
      for (const row of rows) {
        const [{ rows: financialRows }, history, plan, planHistory] = await Promise.all([
          selectAll(env, "v_workbook_student_financials", {
            select: FINANCIAL_FIELDS,
            student_id: `eq.${row.student_id}`,
            session_label: `eq.${sessionLabel}`,
            limit: 1,
          }),
          loadReceiptHistory(env, {
            studentId: row.student_id,
            sessionLabel,
            receiptLimit,
          }),
          getActivePlan(env, { studentId: row.student_id, sessionLabel }),
          getPlanHistory(env, { studentId: row.student_id, sessionLabel }),
        ]);

        students.push({
          ...(financialRows[0] ? mapFinancialRow(financialRows[0]) : mapDirectoryRow(row)),
          ...history,
          repaymentPlan: plan,
          repaymentPlanHistory: planHistory,
        });
      }

      return toolResult(
        students.length === 0
          ? `No student matched "${query}" in ${sessionLabel}.`
          : `Payment history loaded for ${students.length} student(s). Nothing was changed.`,
        withScope(
          {
            sessionLabel,
            query,
            safety: {
              readOnly: true,
              paymentsPosted: false,
              recordsChanged: false,
              note: "Receipt totals are exact. A discount-mode receipt is a write-off and reports zero cash collected. Corrections and refunds are separate append-only records, and a reversed receipt stays on file marked as reversed.",
            },
            students,
          },
          scope,
          rows,
        ),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_family",
    title: "Get Family And Siblings",
    description:
      "Use this when the user asks about siblings, a family's combined dues, or why a third-child discount applies. Returns the family group and every sibling's position for the session.",
    requires: ["students:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z.string().min(1).max(80).describe("Any student in the family: SR number, name, or phone."),
    },
    handler: async ({ sessionLabel, query }) => {
      const row = await findStudentRow(env, { query, sessionLabel, scope: "everyone" });
      if (!row) {
        return toolResult(`No student found for "${query}" in ${sessionLabel}.`, {
          sessionLabel,
          query,
          family: null,
        });
      }

      const family = await loadFamily(env, row.student_id, sessionLabel);
      return toolResult(
        family
          ? `${family.familyLabel || "Family"}: ${family.members.length} sibling(s), combined fees pending ${money(family.combined.feesPending)}.`
          : `${row.full_name} is not linked to a family group in ${sessionLabel}.`,
        { sessionLabel, query, family },
      );
    },
  });
}

function groupDirectoryRows(rows, groupBy) {
  const keyOf = {
    class: (row) => [row.class_id, row.class_label],
    route: (row) => [row.transport_route_id || "no_transport", row.transport_route_name || "No Transport"],
    enrollmentStatus: (row) => [row.record_status, row.record_status],
    moneySegment: (row) => {
      const paid = number(row.total_paid);
      const pending = number(row.outstanding_amount);
      const charged = number(row.base_charge_total);
      if (paid === 0 && charged > 0) return ["never_paid", "Never paid"];
      if (paid > 0 && pending > 0) return ["partly_paid", "Partly paid"];
      if (pending <= 0 && paid > 0 && charged > 0) return ["year_clear", "Year clear"];
      return ["unclassified", "Unclassified"];
    },
  }[groupBy];

  const groups = new Map();
  for (const row of rows) {
    const [key, label] = keyOf(row);
    const current = groups.get(key) || {
      key,
      label,
      studentCount: 0,
      onRollCount: 0,
      feesExpected: 0,
      totalPaid: 0,
      feesPending: 0,
      lateFeePending: 0,
    };
    current.studentCount += 1;
    if (row.record_status === "active") current.onRollCount += 1;
    current.feesExpected += number(row.base_charge_total);
    current.totalPaid += number(row.total_paid);
    current.feesPending += number(row.outstanding_amount);
    current.lateFeePending += number(row.late_fee_outstanding_amount);
    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) => b.feesPending - a.feesPending);
}

async function loadFamily(env, studentId, sessionLabel) {
  const { rows: membership } = await selectAll(env, "student_family_members", {
    select: "family_group_id,student_id,sibling_order,academic_session_label",
    student_id: `eq.${studentId}`,
    academic_session_label: `eq.${sessionLabel}`,
    limit: 1,
  });

  const familyGroupId = membership[0]?.family_group_id;
  if (!familyGroupId) return null;

  const [{ rows: groupRows }, { rows: memberRows }] = await Promise.all([
    selectAll(env, "student_family_groups", {
      select: "id,family_label,guardian_name,guardian_phone,notes,academic_session_label",
      id: `eq.${familyGroupId}`,
      limit: 1,
    }),
    selectAll(env, "student_family_members", {
      select: "student_id,sibling_order,is_policy_candidate",
      family_group_id: `eq.${familyGroupId}`,
      order: "sibling_order.asc",
    }),
  ]);

  const memberIds = memberRows.map((row) => row.student_id);
  const financials = [];
  for (const ids of chunk(memberIds, 100)) {
    const { rows } = await selectAll(env, "v_workbook_student_financials", {
      select: FINANCIAL_FIELDS,
      student_id: `in.(${ids.join(",")})`,
      session_label: `eq.${sessionLabel}`,
    });
    financials.push(...rows);
  }

  const byStudent = new Map(financials.map((row) => [row.student_id, mapFinancialRow(row)]));
  const orderById = new Map(memberRows.map((row) => [row.student_id, row]));

  const members = memberIds
    .map((id) => {
      const financial = byStudent.get(id);
      if (!financial) return null;
      return {
        ...financial,
        siblingOrder: orderById.get(id)?.sibling_order ?? null,
        isPolicyCandidate: orderById.get(id)?.is_policy_candidate ?? null,
        isQueriedStudent: id === studentId,
      };
    })
    .filter(Boolean);

  const combined = members.reduce(
    (acc, member) => ({
      feesExpected: acc.feesExpected + member.feesExpectedAmount,
      totalPaid: acc.totalPaid + member.totalPaid,
      feesPending: acc.feesPending + member.feesPendingAmount,
      lateFeePending: acc.lateFeePending + member.lateFeePendingAmount,
    }),
    { feesExpected: 0, totalPaid: 0, feesPending: 0, lateFeePending: 0 },
  );

  return {
    familyGroupId,
    familyLabel: groupRows[0]?.family_label || null,
    guardianName: groupRows[0]?.guardian_name || null,
    guardianPhone: groupRows[0]?.guardian_phone || null,
    sessionLabel,
    members,
    combined: { ...combined, totalCollectable: combined.feesPending + combined.lateFeePending },
    note: "Sibling order drives the third-child discount. A family is scoped to one session.",
  };
}

async function loadReceiptHistory(env, { studentId, sessionLabel, receiptLimit }) {
  const [{ rows: receipts }, { rows: adjustments }, { rows: refunds }, installments] =
    await Promise.all([
      selectAll(env, "receipts", {
        select: RECEIPT_FIELDS,
        student_id: `eq.${studentId}`,
        order: "payment_date.desc,created_at.desc",
        limit: receiptLimit,
      }),
      selectAll(env, "payment_adjustments", {
        select: "id,payment_id,installment_id,adjustment_type,amount_delta,reason,notes,created_at",
        student_id: `eq.${studentId}`,
        order: "created_at.asc",
      }),
      selectAll(env, "refund_requests", {
        select:
          "id,receipt_id,refund_date,requested_amount,refund_method,refund_reference,reason,notes,status,created_at,approved_at,processed_at",
        student_id: `eq.${studentId}`,
        order: "created_at.asc",
      }),
      getStudentInstallments(env, studentId, sessionLabel),
    ]);

  const receiptIds = receipts.map((row) => row.id);
  const [reversals, allocations] = await Promise.all([
    getReversalTotals(env, receiptIds),
    getAllocationsByReceipt(env, receiptIds),
  ]);

  const installmentById = new Map(installments.map((row) => [row.installmentId, row]));
  const adjustmentsByPayment = new Map();
  for (const row of adjustments) {
    const bucket = adjustmentsByPayment.get(row.payment_id) || [];
    bucket.push(mapAdjustment(row));
    adjustmentsByPayment.set(row.payment_id, bucket);
  }
  const refundsByReceipt = new Map();
  for (const row of refunds) {
    const bucket = refundsByReceipt.get(row.receipt_id) || [];
    bucket.push(mapRefund(row));
    refundsByReceipt.set(row.receipt_id, bucket);
  }

  const rows = receipts.map((row) => ({
    ...mapReceiptRow(row, { reversedAmount: reversals.get(row.id) || 0 }),
    verifyUrl: verifyUrl(env, row.receipt_number),
    allocations: (allocations.get(row.id) || []).map((payment) => ({
      ...mapAllocation(payment, installmentById.get(payment.installment_id)),
      adjustments: adjustmentsByPayment.get(payment.id) || [],
    })),
    refunds: refundsByReceipt.get(row.id) || [],
  }));

  return {
    receipts: rows,
    receiptsReturned: rows.length,
    mayBeTruncated: rows.length === receiptLimit,
    note: "Append-only history. A correction is a separate adjustment row and a reversed receipt stays on file marked as reversed — nothing is rewritten or deleted.",
  };
}
