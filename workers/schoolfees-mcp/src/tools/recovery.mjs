/**
 * The daily follow-up work: who to ring, in what order, and what to say.
 *
 * All eight tools here keep their original names so the school's existing
 * morning automation keeps working. What changed underneath is the population:
 * they used to read active students only, which hid families who paid something
 * and then left — money the ledger still holds and the office still has to
 * collect. They now read the `collectable` scope, matching the office app.
 *
 * Two behaviours worth keeping in view:
 *  - A family on an EMI plan that is on track is chased only for what the plan
 *    says is due, never the full underlying balance.
 *  - A no-call flag suppresses a family entirely unless the caller opts in.
 */

import * as z from "zod/v4";

import { getFinancialRows, getRecoveryContext, matchesQuery, normalizeQuery } from "../reads.mjs";
import { mapFinancialRow, summarizeFinancialRows } from "../shape/student.mjs";
import {
  HIGH_EXPOSURE_AMOUNT,
  NOT_RESPONDING_STREAK,
  promiseState,
} from "../shape/contact.mjs";
import { getActivePlan } from "../shape/plan.mjs";
import { getStudentInstallments } from "../shape/installment.mjs";
import { todayIst } from "../freshness.mjs";
import { daysOverdue, money, number, wholeRupees } from "../format.mjs";
import {
  defineTool,
  limitSchema,
  scopeSchema,
  sessionSchema,
  toolResult,
  withScope,
} from "../toolkit.mjs";

const SCHOOL_UPI = {
  vpa: "shriveerpattassecsch.68347408@hdfcbank",
  payeeName: "SHRI VEER PATTA S SEC SCH",
  currency: "INR",
};

function paymentReference(admissionNo) {
  const normalized = String(admissionNo || "").replace(/\s+/g, " ").trim() || "STUDENT";
  return `Fee ${normalized}`.slice(0, 35);
}

function buildUpiIntent({ admissionNo, amount }) {
  const rounded = wholeRupees(amount);
  const displayReference = paymentReference(admissionNo);
  const params = new URLSearchParams({
    pa: SCHOOL_UPI.vpa,
    pn: SCHOOL_UPI.payeeName,
    am: String(rounded),
    cu: SCHOOL_UPI.currency,
    tn: displayReference,
  });

  return {
    uri: `upi://pay?${params.toString().replaceAll("+", "%20")}`,
    displayReference,
    payeeName: SCHOOL_UPI.payeeName,
    vpa: SCHOOL_UPI.vpa,
    amount: rounded,
  };
}

/**
 * What this family should actually be asked for today.
 *
 * Without a plan that is the whole outstanding balance. With one it is the
 * installments the plan does not cover, plus whatever the plan itself says is
 * overdue — chasing an on-track family for the full balance breaks the
 * agreement the school made with them.
 */
function planAwareState(row, installments, coverage, todayKey) {
  const mapped = mapFinancialRow(row);
  const covered = coverage?.coveredInstallmentIds || new Set();
  const overdueOutsidePlan = installments.filter(
    (installment) =>
      installment.balanceStatus === "overdue" &&
      installment.feesPendingAmount > 0 &&
      !covered.has(installment.installmentId),
  );
  const outsidePlanAmount = overdueOutsidePlan.reduce(
    (sum, installment) => sum + installment.feesPendingAmount,
    0,
  );
  const outsidePlanDueDate =
    overdueOutsidePlan.map((installment) => installment.dueDate).filter(Boolean).sort()[0] || null;

  const plan = coverage?.plan || null;
  const planCatchUp = plan ? Math.max(plan.catchUpAmount, 0) : 0;
  const overdueAmount = outsidePlanAmount + planCatchUp;
  const candidateDates = [outsidePlanDueDate, plan?.nextDueDate].filter(Boolean).sort();

  return {
    ...mapped,
    repaymentPlan: plan,
    planAware: Boolean(plan),
    planIsBehind: Boolean(plan && plan.missedInstallmentCount > 0),
    overdueAmount,
    daysOverdue: Math.max(
      daysOverdue(outsidePlanDueDate, todayKey),
      planCatchUp > 0 ? daysOverdue(plan?.nextDueDate, todayKey) : 0,
    ),
    recoveryAmount: plan ? overdueAmount : mapped.feesPendingAmount,
    recoveryDueDate: candidateDates[0] || mapped.nextDueDate,
    effectiveOverdueInstallmentCount:
      overdueOutsidePlan.length + (plan ? plan.missedInstallmentCount : 0),
  };
}

function recoveryReasons(row, summary, noCall, todayKey) {
  const reasons = [];
  const promise = promiseState(summary, todayKey);
  if (noCall) reasons.push("No-call flag");
  if (promise === "broken") reasons.push("Broken promise");
  if (promise === "due_today") reasons.push("Promise due today");
  if ((summary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK) reasons.push("Repeated no-answer");
  if (row.feesPendingAmount >= HIGH_EXPOSURE_AMOUNT) reasons.push("High exposure");
  if (row.planIsBehind) reasons.push("EMI missed");
  else if (row.repaymentPlan?.paymentStatus === "due") reasons.push("EMI due now");
  if (row.overdueAmount > 0) reasons.push("Overdue balance");
  if (!row.enrollment.onRoll) reasons.push(`${row.enrollment.label} but still owes`);
  if (reasons.length === 0) reasons.push("Pending balance");
  return reasons;
}

function recoveryScore(row, summary, noCall, todayKey) {
  if (noCall) return -1;
  let score = number(row.effectiveOverdueInstallmentCount) * 25;
  const promise = promiseState(summary, todayKey);
  if (promise === "broken") score += 90;
  if (promise === "due_today") score += 60;
  score += Math.min(35, Math.floor(number(row.recoveryAmount) / 5000));
  if ((summary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK) score += 25;
  if (number(row.feesPendingAmount) >= HIGH_EXPOSURE_AMOUNT) score += 20;
  return score;
}

export function buildRecoveryRows(
  context,
  { includeNoCall = false, includePlanOnTrack = false } = {},
) {
  const todayKey = todayIst();
  const { financialRows, contactSummaries, noCallIds, installmentsByStudent, planCoverage } =
    context;

  return financialRows
    .filter((row) => number(row.outstanding_amount) > 0)
    .map((row) => {
      const summary = contactSummaries.get(row.student_id) || null;
      const noCall = noCallIds.has(row.student_id);
      const state = planAwareState(
        row,
        installmentsByStudent.get(row.student_id) || [],
        planCoverage.get(row.student_id) || null,
        todayKey,
      );
      return {
        ...state,
        noCall,
        contactSummary: summary,
        promiseState: promiseState(summary, todayKey),
        recoveryReasons: recoveryReasons(state, summary, noCall, todayKey),
        recoveryScore: recoveryScore(state, summary, noCall, todayKey),
      };
    })
    .filter(
      (row) =>
        includePlanOnTrack ||
        row.recoveryAmount > 0 ||
        row.promiseState === "broken" ||
        row.promiseState === "due_today",
    )
    .filter((row) => includeNoCall || !row.noCall)
    .sort((left, right) => {
      if (right.recoveryScore !== left.recoveryScore) return right.recoveryScore - left.recoveryScore;
      if (right.feesPendingAmount !== left.feesPendingAmount) {
        return right.feesPendingAmount - left.feesPendingAmount;
      }
      return String(left.studentName).localeCompare(String(right.studentName));
    });
}

function draftMessage(row, language) {
  const amountToRequest = row.repaymentPlan ? row.recoveryAmount : row.feesPendingAmount;
  const upi = buildUpiIntent({ admissionNo: row.admissionNo, amount: amountToRequest });
  const amount = money(amountToRequest);
  const dueDate = row.recoveryDueDate || row.nextDueDate;
  const dueText = dueDate ? ` Due date: ${dueDate}.` : "";
  const upiText =
    ` UPI payment link: ${upi.uri}. UPI note/reference: ${upi.displayReference}. ` +
    "After payment, please share the UPI screenshot/UTR. Receipt will be posted from Payment Desk after office verification.";
  const label = row.repaymentPlan ? "EMI due/catch-up amount" : "pending fee";

  const text =
    language === "english"
      ? `Dear parent, this is a reminder from Shri Veer Patta Senior Secondary School. ${label} for ${row.studentName} (${row.classLabel}) is ${amount}.${dueText}${upiText}`
      : `Dear parent, Shri Veer Patta Senior Secondary School se fee reminder hai. ${row.studentName} (${row.classLabel}) ka ${row.repaymentPlan ? "EMI due/catch-up" : "pending fee"} ${amount} hai.${dueText}${upiText}`;

  return {
    studentId: row.studentId,
    studentName: row.studentName,
    admissionNo: row.admissionNo,
    classLabel: row.classLabel,
    enrollment: row.enrollment,
    fatherName: row.fatherName,
    phone: row.fatherPhone || row.motherPhone,
    amountRequested: amountToRequest,
    totalFeesPendingAmount: row.feesPendingAmount,
    lateFeePendingAmount: row.lateFeePendingAmount,
    repaymentPlan: row.repaymentPlan,
    upi,
    draftMessage: text,
  };
}

const SAFETY = {
  readOnly: true,
  messagesSent: false,
  paymentsPosted: false,
  recordsChanged: false,
  note: "Drafts only. Nothing was sent, and no payment was posted. Receipt posting stays in the Payment Desk after office verification.",
};

function queuePayload(context, rows, extra = {}) {
  return withScope(
    {
      sessionLabel: extra.sessionLabel,
      asOfDateIst: todayIst(),
      rows,
      degraded: context.degraded,
      ...(context.degraded.length > 0
        ? {
            degradedWarning:
              "Some follow-up data could not be read. Promise dates, no-answer streaks or no-call suppression may be missing from this queue — treat the ordering as incomplete.",
          }
        : {}),
      ...extra,
    },
    context.scope,
    context.financialRows,
  );
}

export function registerRecoveryTools(server, ctx) {
  const { env } = ctx;
  const recoveryPermissions = ["defaulters:view", "finance:view", "reports:view"];

  defineTool(server, ctx, {
    name: "today_fee_collection_brief",
    title: "Today's Fee Collection Brief",
    description:
      "Use this for the current overall picture: how much is pending, how many families owe, who the top follow-up targets are, and what came in over the past week. A good opening call for 'how are we doing on fees'.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      topDefaultersLimit: limitSchema.default(10),
    },
    handler: async ({ sessionLabel, topDefaultersLimit }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context, { includeNoCall: true });
      const summary = summarizeFinancialRows(context.financialRows);
      summary.overdueStudentCount = rows.filter((row) => row.overdueAmount > 0).length;

      return toolResult(
        `${sessionLabel}: ${summary.pendingStudentCount} families owe fees, totalling ${money(summary.totalFeesPending)}, plus ${money(summary.totalLateFeePending)} of late fee. ${summary.overdueStudentCount} are overdue right now.`,
        queuePayload(context, rows.slice(0, topDefaultersLimit), {
          sessionLabel,
          summary,
          safety: SAFETY,
        }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "list_defaulters_for_followup",
    title: "List Defaulters For Follow-Up",
    description:
      "Use this when the user asks who to call or message about unpaid fees. Ranked by urgency, aware of EMI plans, and never lists a family whose only debt is a late fee.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      classId: z.string().uuid().optional().describe("Restrict to one class."),
      minPendingAmount: z.number().int().min(0).default(0),
      overdueOnly: z.boolean().default(false),
      limit: limitSchema.default(25),
    },
    handler: async ({ sessionLabel, classId, minPendingAmount, overdueOnly, limit }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context)
        .filter((row) => (classId ? row.classId === classId : true))
        .filter((row) => row.recoveryAmount >= minPendingAmount)
        .filter((row) => (overdueOnly ? row.overdueAmount > 0 : true))
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      const totalPending = rows.reduce((sum, row) => sum + row.feesPendingAmount, 0);
      const totalRecovery = rows.reduce((sum, row) => sum + row.recoveryAmount, 0);

      return toolResult(
        `${rows.length} family/families to follow up in ${sessionLabel}. ${money(totalRecovery)} is due for recovery now, out of ${money(totalPending)} total fees pending across them.`,
        queuePayload(context, rows, {
          sessionLabel,
          filters: { classId: classId || null, minPendingAmount, overdueOnly, limit },
          totalFeesPending: totalPending,
          totalRecoveryAmount: totalRecovery,
        }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_student_due_status",
    title: "Get Student Due Status",
    description:
      "Use this for one student's current position: what is owed, the installment breakdown, parent phone numbers, and any EMI plan. For the full record including receipts and family, use get_student instead.",
    requires: ["students:view", "fees:view"],
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z.string().min(1).max(80).describe("Student name, admission number, class, or parent phone."),
      scope: scopeSchema(
        "collectable",
        'A student who left owing money is findable by default. Use "everyone" to include leavers whose dues were cancelled.',
      ),
      limit: limitSchema.default(5),
    },
    handler: async ({ sessionLabel, query, scope, limit }) => {
      const normalized = normalizeQuery(query);
      const { rows } = await getFinancialRows(env, { sessionLabel, scope });
      const matches = rows.filter((row) => matchesQuery(row, normalized)).slice(0, limit);

      const students = [];
      for (const row of matches) {
        const [installments, plan] = await Promise.all([
          getStudentInstallments(env, row.student_id, sessionLabel),
          getActivePlan(env, { studentId: row.student_id, sessionLabel }),
        ]);
        students.push({ ...mapFinancialRow(row), installments, repaymentPlan: plan });
      }

      return toolResult(
        students.length === 0
          ? `No student matched "${query}" in ${sessionLabel} under the ${scope} scope. If the student may have left without paying anything, try scope "everyone".`
          : `${students.length} student record(s) for "${query}" in ${sessionLabel}.`,
        withScope({ sessionLabel, query, students }, scope, matches),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_recovery_queue",
    title: "Get Daily Recovery Queue",
    description:
      "Use this for today's call list, ordered by urgency: broken promises first, then promises due today, repeated no-answers, high exposure and overdue balances. Families flagged no-call are suppressed unless you ask for them.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      limit: limitSchema.default(25),
      includeNoCall: z
        .boolean()
        .default(false)
        .describe("Include families flagged do-not-call. Default false — respect the flag."),
    },
    handler: async ({ sessionLabel, limit, includeNoCall }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context, { includeNoCall })
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      return toolResult(
        `${rows.length} family/families in today's recovery queue for ${sessionLabel}.`,
        queuePayload(context, rows, { sessionLabel, includeNoCall, safety: SAFETY }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_promise_due_list",
    title: "Get Promise Due List",
    description:
      "Use this when the user asks which parents promised to pay and should be chased today, or whose promised date has already passed.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: { sessionLabel: sessionSchema(env), limit: limitSchema.default(25) },
    handler: async ({ sessionLabel, limit }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context)
        .filter((row) => row.promiseState === "broken" || row.promiseState === "due_today")
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      return toolResult(
        `${rows.length} promise follow-up(s) in ${sessionLabel}: ${rows.filter((row) => row.promiseState === "broken").length} broken, ${rows.filter((row) => row.promiseState === "due_today").length} due today.`,
        queuePayload(context, rows, { sessionLabel }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_parent_followup_context",
    title: "Get Parent Follow-Up Context",
    description:
      "Use this before calling one family: what they owe, what was said last time, whether they promised anything, whether they are on an EMI plan, and whether they have asked not to be called.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      query: z.string().min(1).max(80).describe("Student name, admission number, class, or parent phone."),
      limit: limitSchema.default(5),
    },
    handler: async ({ sessionLabel, query, limit }) => {
      const normalized = query.trim().toLowerCase();
      const context = await getRecoveryContext(env, sessionLabel);
      const matches = buildRecoveryRows(context, {
        includeNoCall: true,
        includePlanOnTrack: true,
      })
        .filter((row) =>
          [
            row.studentName,
            row.admissionNo,
            row.fatherName,
            row.motherName,
            row.fatherPhone,
            row.motherPhone,
            row.classLabel,
          ].some((value) => String(value || "").toLowerCase().includes(normalized)),
        )
        .slice(0, limit);

      const students = [];
      for (const row of matches) {
        const [installments, plan] = await Promise.all([
          getStudentInstallments(env, row.studentId, sessionLabel),
          getActivePlan(env, { studentId: row.studentId, sessionLabel }),
        ]);
        students.push({ ...row, installments, repaymentPlan: plan });
      }

      return toolResult(
        students.length === 0
          ? `No follow-up context found for "${query}" in ${sessionLabel}.`
          : `Follow-up context for ${students.length} family/families matching "${query}".${students.some((row) => row.noCall) ? " One or more are flagged do-not-call — do not suggest ringing them." : ""}`,
        queuePayload(context, students, { sessionLabel, query, safety: SAFETY }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "draft_recovery_plan",
    title: "Draft Daily Recovery Plan",
    description:
      "Use this for a structured plan for the day's collection work, grouped into broken promises, promises due today, repeated no-answers and high-exposure families.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      limit: limitSchema.default(30),
      language: z.enum(["english", "hinglish"]).default("hinglish"),
    },
    handler: async ({ sessionLabel, limit, language }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context).slice(0, limit);
      const plan = buildPlanGroups({ sessionLabel, rows, language });

      return toolResult(plan.headline, queuePayload(context, rows, { sessionLabel, ...plan }));
    },
  });

  defineTool(server, ctx, {
    name: "prepare_followup_messages",
    title: "Prepare Follow-Up Messages",
    description:
      "Use this to draft WhatsApp or SMS reminder text for families with pending fees, each with a UPI payment link for the correct amount. It only drafts — it cannot and does not send anything.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      minPendingAmount: z.number().int().min(0).default(0),
      overdueOnly: z.boolean().default(false),
      limit: limitSchema.default(10),
      language: z.enum(["english", "hinglish"]).default("hinglish"),
    },
    handler: async ({ sessionLabel, minPendingAmount, overdueOnly, limit, language }) => {
      const context = await getRecoveryContext(env, sessionLabel);
      const rows = buildRecoveryRows(context)
        .filter((row) => row.recoveryAmount > 0)
        .filter((row) => row.recoveryAmount >= minPendingAmount)
        .filter((row) => (overdueOnly ? row.overdueAmount > 0 : true))
        .slice(0, limit);

      return toolResult(
        `${rows.length} draft message(s) prepared. Nothing was sent — these are for a person to review and send.`,
        queuePayload(context, [], {
          sessionLabel,
          language,
          drafts: rows.map((row) => draftMessage(row, language)),
          safety: SAFETY,
        }),
      );
    },
  });

  defineTool(server, ctx, {
    name: "daily_recovery_digest",
    title: "Daily Recovery Digest",
    description:
      "Use this for the morning collection run. Bundles today's position, the ranked call queue, promise follow-ups, a grouped plan and ready-to-review reminder drafts in one call. Read-only: it never sends a message or posts a payment.",
    requires: recoveryPermissions,
    money: true,
    inputSchema: {
      sessionLabel: sessionSchema(env),
      language: z.enum(["english", "hinglish"]).default("hinglish"),
      recoveryLimit: limitSchema.default(25),
      promiseLimit: limitSchema.default(25),
      draftLimit: limitSchema.default(10),
    },
    handler: async ({ sessionLabel, language, recoveryLimit, promiseLimit, draftLimit }) => {
      // One context, five views of it — the old version fetched the whole
      // session five times over.
      const context = await getRecoveryContext(env, sessionLabel);

      const all = buildRecoveryRows(context);
      const withNoCall = buildRecoveryRows(context, { includeNoCall: true });
      const summary = summarizeFinancialRows(context.financialRows);
      summary.overdueStudentCount = withNoCall.filter((row) => row.overdueAmount > 0).length;

      const queue = all.slice(0, recoveryLimit).map((row, index) => ({ rank: index + 1, ...row }));
      const promises = all
        .filter((row) => row.promiseState === "broken" || row.promiseState === "due_today")
        .slice(0, promiseLimit);
      const drafts = all
        .filter((row) => row.recoveryAmount > 0)
        .slice(0, draftLimit)
        .map((row) => draftMessage(row, language));

      return toolResult(
        `${sessionLabel}: ${money(summary.totalFeesPending)} pending across ${summary.pendingStudentCount} families. ${queue.length} in the call queue, ${promises.length} promise follow-up(s), ${drafts.length} draft message(s). Nothing was sent.`,
        queuePayload(context, [], {
          sessionLabel,
          language,
          summary,
          recoveryQueue: queue,
          promisesDue: promises,
          recoveryPlan: buildPlanGroups({ sessionLabel, rows: all.slice(0, recoveryLimit), language }),
          followUpDrafts: drafts,
          topDefaulters: withNoCall.slice(0, 10),
          safety: SAFETY,
        }),
      );
    },
  });
}

function buildPlanGroups({ sessionLabel, rows, language }) {
  const groups = {
    brokenPromises: rows.filter((row) => row.promiseState === "broken"),
    promisesDueToday: rows.filter((row) => row.promiseState === "due_today"),
    repeatedNoAnswer: rows.filter(
      (row) => (row.contactSummary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK,
    ),
    highExposure: rows.filter((row) => row.feesPendingAmount >= HIGH_EXPOSURE_AMOUNT),
    leftButOwing: rows.filter((row) => !row.enrollment.onRoll),
  };

  const headline =
    language === "english"
      ? `Start with ${groups.brokenPromises.length} broken promise(s), then ${groups.promisesDueToday.length} promise(s) due today, then repeated no-answer and high-exposure families.`
      : `Pehle ${groups.brokenPromises.length} broken promise, phir ${groups.promisesDueToday.length} promise due, uske baad no-answer aur high exposure accounts follow karein.`;

  return { sessionLabel, asOfDateIst: todayIst(), language, headline, groups, nextBestRows: rows.slice(0, 10) };
}
