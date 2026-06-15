import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";

const MAX_ROWS = 5000;

const financialFields = [
  "student_id",
  "admission_no",
  "student_name",
  "father_name",
  "mother_name",
  "father_phone",
  "mother_phone",
  "record_status",
  "class_id",
  "class_name",
  "class_label",
  "sort_order",
  "session_label",
  "transport_route_id",
  "transport_route_name",
  "transport_route_code",
  "student_status_label",
  "tuition_fee",
  "transport_fee",
  "academic_fee",
  "discount_amount",
  "late_fee_total",
  "late_fee_waiver_amount",
  "total_due",
  "total_paid",
  "outstanding_amount",
  "next_due_date",
  "next_due_amount",
  "next_due_label",
  "last_payment_date",
  "paid_installment_count",
  "partly_paid_installment_count",
  "overdue_installment_count",
  "inst1_pending",
  "inst2_pending",
  "inst3_pending",
  "inst4_pending",
  "status_label",
].join(", ");

const installmentFields = [
  "installment_id",
  "student_id",
  "installment_no",
  "installment_label",
  "due_date",
  "base_charge",
  "paid_amount",
  "adjustment_amount",
  "final_late_fee",
  "total_charge",
  "pending_amount",
  "balance_status",
  "last_payment_date",
].join(", ");

const contactFields = [
  "student_id",
  "contacted_at",
  "snooze_until",
  "outcome",
  "channel",
  "phone_label",
].join(", ");

const legacyContactFields = [
  "student_id",
  "contacted_at",
  "snooze_until",
  "outcome",
  "channel",
].join(", ");

const HIGH_EXPOSURE_AMOUNT = 30000;
const NOT_RESPONDING_STREAK = 3;
const SCHOOL_UPI_PAYMENT_CONFIG = {
  vpa: "shriveerpattassecsch.68347408@hdfcbank",
  payeeName: "SHRI VEER PATTA S SEC SCH",
  currency: "INR",
};

function getDefaultSession(env) {
  return env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27";
}

function sessionSchema(env) {
  return z
    .string()
    .regex(/^(?:(?:TEST|UAT|DEMO)-)?20\d{2}-\d{2}$/)
    .default(getDefaultSession(env))
    .describe("Academic session label, for example TEST-2026-27 or 2026-27.");
}

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Maximum rows to return.");

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,mcp-session-id,mcp-protocol-version,last-event-id",
      ...(init.headers || {}),
    },
  });
}

function unauthorized() {
  return json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    },
    { status: 401 },
  );
}

async function isPublicMetadataRequest(request) {
  if (request.method !== "POST") {
    return false;
  }

  try {
    const body = await request.clone().json();
    const messages = Array.isArray(body) ? body : [body];
    const publicMethods = new Set([
      "initialize",
      "notifications/initialized",
      "ping",
      "tools/list",
    ]);

    return messages.every((message) => {
      if (!message || typeof message !== "object") {
        return false;
      }
      if (!("method" in message)) {
        return true;
      }
      return publicMethods.has(message.method);
    });
  } catch {
    return false;
  }
}

async function checkAuth(request, env) {
  const token = env.SCHOOLFEES_MCP_TOKEN;
  if (!token) {
    return true;
  }

  const url = new URL(request.url);
  if (url.pathname === `/mcp/${token}`) {
    return true;
  }

  if (request.headers.get("authorization") === `Bearer ${token}`) {
    return true;
  }

  return isPublicMetadataRequest(request);
}

function getRequiredEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required Worker secret: ${name}`);
  }
  return value;
}

function getSupabaseSchema(env) {
  return env.SCHOOLFEES_MCP_SUPABASE_SCHEMA || "public";
}

async function supabaseGet(env, table, params) {
  const baseUrl = getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const key = getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "accept-profile": getSupabaseSchema(env),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${table} read failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value || 0)));
}

function number(value) {
  return Math.round(Number(value || 0));
}

function wholeRupees(value) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function paymentReference(admissionNo) {
  const normalized = String(admissionNo || "").replace(/\s+/g, " ").trim() || "STUDENT";
  return `Fee ${normalized}`.slice(0, 35);
}

function buildStudentFeeUpiPayment({ admissionNo, amount }) {
  const roundedAmount = wholeRupees(Number(amount || 0));
  const displayReference = paymentReference(admissionNo);
  const params = new URLSearchParams({
    pa: SCHOOL_UPI_PAYMENT_CONFIG.vpa,
    pn: SCHOOL_UPI_PAYMENT_CONFIG.payeeName,
    am: String(roundedAmount),
    cu: SCHOOL_UPI_PAYMENT_CONFIG.currency,
    tn: displayReference,
  });

  return {
    uri: `upi://pay?${params.toString().replaceAll("+", "%20")}`,
    displayReference,
    payeeName: SCHOOL_UPI_PAYMENT_CONFIG.payeeName,
    vpa: SCHOOL_UPI_PAYMENT_CONFIG.vpa,
    amount: roundedAmount,
  };
}

function todayIst() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeQuery(value) {
  return (value || "").trim().toLowerCase();
}

function includesQuery(row, query) {
  if (!query) {
    return true;
  }

  return [
    row.student_name,
    row.admission_no,
    row.father_name,
    row.mother_name,
    row.father_phone,
    row.mother_phone,
    row.class_label,
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function routeLabel(row) {
  if (!row.transport_route_name) {
    return "No Transport";
  }

  return row.transport_route_code
    ? `${row.transport_route_name} (${row.transport_route_code})`
    : row.transport_route_name;
}

function mapFinancialRow(row) {
  return {
    studentId: row.student_id,
    admissionNo: row.admission_no,
    studentName: row.student_name,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.father_phone,
    motherPhone: row.mother_phone,
    classId: row.class_id,
    classLabel: row.class_label || row.class_name,
    routeLabel: routeLabel(row),
    sessionLabel: row.session_label,
    studentStatus: row.student_status_label,
    totalDue: number(row.total_due),
    totalPaid: number(row.total_paid),
    outstandingAmount: number(row.outstanding_amount),
    lateFeeTotal: number(row.late_fee_total),
    discountAmount: number(row.discount_amount),
    lateFeeWaived: number(row.late_fee_waiver_amount),
    nextDueDate: row.next_due_date,
    nextDueAmount: row.next_due_amount == null ? null : number(row.next_due_amount),
    nextDueLabel: row.next_due_label,
    lastPaymentDate: row.last_payment_date,
    overdueInstallmentCount: number(row.overdue_installment_count),
    paidInstallmentCount: number(row.paid_installment_count),
    partlyPaidInstallmentCount: number(row.partly_paid_installment_count),
    installmentPending: {
      inst1: number(row.inst1_pending),
      inst2: number(row.inst2_pending),
      inst3: number(row.inst3_pending),
      inst4: number(row.inst4_pending),
    },
    statusLabel: row.status_label || "",
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function summarizeFinancialRows(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.studentCount += 1;
      acc.totalDue += number(row.total_due);
      acc.totalPaid += number(row.total_paid);
      acc.totalOutstanding += number(row.outstanding_amount);
      acc.totalLateFee += number(row.late_fee_total);
      acc.totalDiscount += number(row.discount_amount);
      if (number(row.outstanding_amount) > 0) {
        acc.pendingStudentCount += 1;
      }
      if (number(row.overdue_installment_count) > 0) {
        acc.overdueStudentCount += 1;
      }
      return acc;
    },
    {
      studentCount: 0,
      pendingStudentCount: 0,
      overdueStudentCount: 0,
      totalDue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalLateFee: 0,
      totalDiscount: 0,
    },
  );
}

async function getFinancialRows(env, { sessionLabel, classId, limit = MAX_ROWS, onlyActive = true } = {}) {
  const params = {
    select: financialFields,
    session_label: `eq.${sessionLabel || getDefaultSession(env)}`,
    order: "sort_order.asc,student_name.asc",
    limit: Math.min(limit, MAX_ROWS),
  };

  if (onlyActive) {
    params.record_status = "eq.active";
  }

  if (classId) {
    params.class_id = `eq.${classId}`;
  }

  return supabaseGet(env, "v_workbook_student_financials", params);
}

async function getInstallmentRows(env, studentId) {
  const rows = await supabaseGet(env, "v_workbook_installment_balances", {
    select: installmentFields,
    student_id: `eq.${studentId}`,
    order: "due_date.asc,installment_no.asc",
  });

  return rows.map((row) => ({
    installmentId: row.installment_id,
    installmentNo: row.installment_no,
    installmentLabel: row.installment_label,
    dueDate: row.due_date,
    baseCharge: number(row.base_charge),
    paidAmount: number(row.paid_amount),
    adjustmentAmount: number(row.adjustment_amount),
    lateFee: number(row.final_late_fee),
    totalCharge: number(row.total_charge),
    pendingAmount: number(row.pending_amount),
    balanceStatus: row.balance_status,
    lastPaymentDate: row.last_payment_date,
  }));
}

function rankDefaulters(rows) {
  return [...rows].sort((a, b) => {
    const overdue = number(b.overdue_installment_count) - number(a.overdue_installment_count);
    if (overdue !== 0) return overdue;
    const pending = number(b.outstanding_amount) - number(a.outstanding_amount);
    if (pending !== 0) return pending;
    return String(a.next_due_date || "9999-12-31").localeCompare(
      String(b.next_due_date || "9999-12-31"),
    );
  });
}

function summarizeContactRows(rows, wantedStudentIds) {
  const wanted = new Set(wantedStudentIds);
  const result = new Map();
  const counts = new Map();
  const streaks = new Map();
  const streakBroken = new Set();

  for (const row of rows || []) {
    if (!wanted.has(row.student_id)) continue;
    counts.set(row.student_id, (counts.get(row.student_id) || 0) + 1);

    if (!streakBroken.has(row.student_id)) {
      if (row.outcome === "no_answer") {
        streaks.set(row.student_id, (streaks.get(row.student_id) || 0) + 1);
      } else if (row.outcome) {
        streakBroken.add(row.student_id);
      }
    }

    if (!result.has(row.student_id)) {
      result.set(row.student_id, {
        snoozeUntil: row.snooze_until || null,
        lastContactedAt: row.contacted_at || null,
        lastOutcome: row.outcome || null,
        lastChannel: row.channel || null,
        suggestedPhoneLabel: row.phone_label || null,
        noAnswerStreak: 0,
        totalAttempts: 0,
      });
    }
  }

  for (const [studentId, summary] of result.entries()) {
    result.set(studentId, {
      ...summary,
      noAnswerStreak: streaks.get(studentId) || 0,
      totalAttempts: counts.get(studentId) || 0,
    });
  }

  return result;
}

async function getContactSummaries(env, sessionLabel, studentIds) {
  if (studentIds.length === 0) return new Map();
  try {
    const rows = await supabaseGet(env, "defaulter_contacts", {
      select: contactFields,
      session_label: `eq.${sessionLabel}`,
      order: "contacted_at.desc",
      limit: MAX_ROWS,
    });
    return summarizeContactRows(rows, studentIds);
  } catch (error) {
    try {
      const legacyRows = await supabaseGet(env, "defaulter_contacts", {
        select: legacyContactFields,
        session_label: `eq.${sessionLabel}`,
        order: "contacted_at.desc",
        limit: MAX_ROWS,
      });
      return summarizeContactRows(
        (legacyRows || []).map((row) => ({ ...row, phone_label: null })),
        studentIds,
      );
    } catch {
      // Fall through to the graceful empty summary below.
    }
    console.warn("[schoolfees-mcp] contact summaries unavailable", error?.message || error);
    return new Map();
  }
}

async function getNoCallStudentIds(env, sessionLabel, studentIds) {
  if (studentIds.length === 0) return new Set();
  try {
    const rows = await supabaseGet(env, "student_collection_flags", {
      select: "student_id,no_call",
      session_label: `eq.${sessionLabel}`,
      no_call: "eq.true",
      limit: MAX_ROWS,
    });
    const wanted = new Set(studentIds);
    return new Set((rows || []).filter((row) => wanted.has(row.student_id)).map((row) => row.student_id));
  } catch (error) {
    console.warn("[schoolfees-mcp] no-call flags unavailable", error?.message || error);
    return new Set();
  }
}

function promiseState(summary, todayKey) {
  if (summary?.lastOutcome !== "promised_pay" || !summary.snoozeUntil) return null;
  if (summary.snoozeUntil < todayKey) return "broken";
  if (summary.snoozeUntil === todayKey) return "due_today";
  return "scheduled";
}

function recoveryReasons(row, summary, noCall, todayKey) {
  const reasons = [];
  const promise = promiseState(summary, todayKey);
  if (noCall) reasons.push("No-call flag");
  if (promise === "broken") reasons.push("Broken promise");
  if (promise === "due_today") reasons.push("Promise due today");
  if ((summary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK) reasons.push("Repeated no-answer");
  if (number(row.outstanding_amount) >= HIGH_EXPOSURE_AMOUNT) reasons.push("High exposure");
  if (number(row.overdue_installment_count) > 0) reasons.push("Overdue balance");
  if (reasons.length === 0) reasons.push("Pending balance");
  return reasons;
}

function recoveryScore(row, summary, noCall, todayKey) {
  if (noCall) return -1;
  let score = number(row.overdue_installment_count) * 25;
  const promise = promiseState(summary, todayKey);
  if (promise === "broken") score += 90;
  if (promise === "due_today") score += 60;
  score += Math.min(35, Math.floor(number(row.outstanding_amount) / 5000));
  if ((summary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK) score += 25;
  if (number(row.outstanding_amount) >= HIGH_EXPOSURE_AMOUNT) score += 20;
  return score;
}

function buildRecoveryRows(financialRows, contactSummaries, noCallIds, { includeNoCall = false } = {}) {
  const todayKey = todayIst();
  return financialRows
    .filter((row) => number(row.outstanding_amount) > 0)
    .map((row) => {
      const summary = contactSummaries.get(row.student_id) || null;
      const noCall = noCallIds.has(row.student_id);
      return {
        ...mapFinancialRow(row),
        noCall,
        contactSummary: summary,
        promiseState: promiseState(summary, todayKey),
        recoveryReasons: recoveryReasons(row, summary, noCall, todayKey),
        recoveryScore: recoveryScore(row, summary, noCall, todayKey),
      };
    })
    .filter((row) => includeNoCall || !row.noCall)
    .sort((left, right) => {
      if (right.recoveryScore !== left.recoveryScore) return right.recoveryScore - left.recoveryScore;
      if (right.outstandingAmount !== left.outstandingAmount) return right.outstandingAmount - left.outstandingAmount;
      return left.studentName.localeCompare(right.studentName);
    });
}

async function getRecoveryContext(env, sessionLabel) {
  const financialRows = await getFinancialRows(env, { sessionLabel });
  const studentIds = financialRows.map((row) => row.student_id).filter(Boolean);
  const [contactSummaries, noCallIds] = await Promise.all([
    getContactSummaries(env, sessionLabel, studentIds),
    getNoCallStudentIds(env, sessionLabel, studentIds),
  ]);
  return { financialRows, contactSummaries, noCallIds };
}

async function getStudentIdsForSession(env, sessionLabel) {
  const rows = await supabaseGet(env, "students", {
    select: "id,class_ref:classes!inner(session_label,status)",
    status: "eq.active",
    "class_ref.session_label": `eq.${sessionLabel}`,
    "class_ref.status": "eq.active",
    limit: MAX_ROWS,
  });

  return rows.map((row) => row.id).filter(Boolean);
}

async function getRecentPayments(env, { sessionLabel, days = 7, limit = 20 }) {
  const studentIds = await getStudentIdsForSession(env, sessionLabel);
  if (studentIds.length === 0) {
    return [];
  }

  const allRows = [];
  for (const chunk of chunkArray(studentIds, 100)) {
    const rows = await supabaseGet(env, "receipts", {
      select:
        "id,receipt_number,payment_date,created_at,payment_mode,total_amount,received_by,student_id,student_ref:students(id,full_name,admission_no,father_name,primary_phone)",
      student_id: `in.(${chunk.join(",")})`,
      payment_date: `gte.${dateDaysAgo(days)}`,
      order: "payment_date.desc,created_at.desc",
      limit: Math.min(limit, 100),
    });
    allRows.push(...rows);
  }

  return allRows
    .sort((left, right) => {
      const dateCompare = String(right.payment_date || "").localeCompare(String(left.payment_date || ""));
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return String(right.created_at || "").localeCompare(String(left.created_at || ""));
    })
    .slice(0, Math.min(limit, 100))
    .map((row) => {
      const student = Array.isArray(row.student_ref) ? row.student_ref[0] : row.student_ref;
      return {
        receiptId: row.id,
        receiptNumber: row.receipt_number,
        paymentDate: row.payment_date,
        createdAt: row.created_at,
        paymentMode: row.payment_mode,
        totalAmount: number(row.total_amount),
        receivedBy: row.received_by,
        studentId: row.student_id,
        studentName: student?.full_name || "Unknown student",
        admissionNo: student?.admission_no || "-",
        fatherName: student?.father_name || null,
        fatherPhone: student?.primary_phone || null,
      };
    });
}

async function buildCollectionBrief(env, { sessionLabel, topDefaultersLimit = 10, recentPaymentsLimit = 10 }) {
  const [financialRows, recentPayments] = await Promise.all([
    getFinancialRows(env, { sessionLabel }),
    getRecentPayments(env, { sessionLabel, days: 7, limit: recentPaymentsLimit }),
  ]);
  const summary = summarizeFinancialRows(financialRows);
  const topDefaulters = rankDefaulters(
    financialRows.filter((row) => number(row.outstanding_amount) > 0),
  )
    .slice(0, topDefaultersLimit)
    .map(mapFinancialRow);

  return {
    sessionLabel,
    asOfDate: todayIst(),
    summary,
    topDefaulters,
    recentPayments,
  };
}

async function buildRecoveryQueue(env, { sessionLabel, limit = 25, includeNoCall = false }) {
  const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(env, sessionLabel);
  const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds, { includeNoCall })
    .slice(0, limit)
    .map((row, index) => ({ rank: index + 1, ...row }));

  return {
    sessionLabel,
    asOfDate: todayIst(),
    includeNoCall,
    rows,
  };
}

async function buildPromiseDueList(env, { sessionLabel, limit = 25 }) {
  const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(env, sessionLabel);
  const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds)
    .filter((row) => row.promiseState === "broken" || row.promiseState === "due_today")
    .slice(0, limit)
    .map((row, index) => ({ rank: index + 1, ...row }));

  return {
    sessionLabel,
    asOfDate: todayIst(),
    rows,
  };
}

function buildRecoveryPlanFromRows({ sessionLabel, rows, language }) {
  const groups = {
    brokenPromises: rows.filter((row) => row.promiseState === "broken"),
    promisesDueToday: rows.filter((row) => row.promiseState === "due_today"),
    repeatedNoAnswer: rows.filter((row) => (row.contactSummary?.noAnswerStreak || 0) >= NOT_RESPONDING_STREAK),
    highExposure: rows.filter((row) => row.outstandingAmount >= HIGH_EXPOSURE_AMOUNT),
  };
  const headline =
    language === "english"
      ? `Start with ${groups.brokenPromises.length} broken promise(s), then ${groups.promisesDueToday.length} promise due row(s), then repeated no-answer and high exposure accounts.`
      : `Pehle ${groups.brokenPromises.length} broken promise, phir ${groups.promisesDueToday.length} promise due, uske baad no-answer aur high exposure accounts follow karein.`;

  return {
    sessionLabel,
    asOfDate: todayIst(),
    language,
    headline,
    groups,
    nextBestRows: rows.slice(0, 10),
  };
}

async function buildRecoveryPlan(env, { sessionLabel, limit = 30, language = "hinglish" }) {
  const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(env, sessionLabel);
  const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds).slice(0, limit);
  return buildRecoveryPlanFromRows({ sessionLabel, rows, language });
}

function buildFollowupDraft(row, language) {
  const payment = buildStudentFeeUpiPayment({
    admissionNo: row.admissionNo,
    amount: row.outstandingAmount,
  });
  const amount = money(row.outstandingAmount);
  const dueText = row.nextDueDate ? ` Next due date: ${row.nextDueDate}.` : "";
  const upiText =
    ` UPI payment link: ${payment.uri}. UPI note/reference: ${payment.displayReference}. ` +
    "After payment, please share the UPI screenshot/UTR. Receipt will be posted from Payment Desk after office verification.";
  const text =
    language === "english"
      ? `Dear parent, this is a reminder from Shri Veer Patta Senior Secondary School. Pending fee for ${row.studentName} (${row.classLabel}) is ${amount}.${dueText}${upiText}`
      : `Dear parent, Shri Veer Patta Senior Secondary School se fee reminder hai. ${row.studentName} (${row.classLabel}) ki pending fee ${amount} hai.${dueText}${upiText}`;

  return {
    studentId: row.studentId,
    studentName: row.studentName,
    admissionNo: row.admissionNo,
    fatherName: row.fatherName,
    phone: row.fatherPhone || row.motherPhone,
    pendingAmount: row.outstandingAmount,
    paymentLink: payment.uri,
    paymentReference: payment.displayReference,
    upi: payment,
    draftMessage: text,
  };
}

async function buildFollowupDrafts(
  env,
  { sessionLabel, minPendingAmount = 0, overdueOnly = false, limit = 10, language = "hinglish" },
) {
  const financialRows = await getFinancialRows(env, { sessionLabel });
  const rows = rankDefaulters(
    financialRows.filter((row) => {
      if (number(row.outstanding_amount) <= 0) return false;
      if (number(row.outstanding_amount) < minPendingAmount) return false;
      if (overdueOnly && number(row.overdue_installment_count) === 0) return false;
      return true;
    }),
  )
    .slice(0, limit)
    .map(mapFinancialRow);

  return {
    sessionLabel,
    language,
    drafts: rows.map((row) => buildFollowupDraft(row, language)),
  };
}

async function buildDailyRecoveryDigest(
  env,
  { sessionLabel, language = "hinglish", recoveryLimit = 25, promiseLimit = 25, draftLimit = 10 },
) {
  const [collectionSummary, recoveryQueue, promisesDue, recoveryPlan, followUpDrafts] =
    await Promise.all([
      buildCollectionBrief(env, {
        sessionLabel,
        topDefaultersLimit: 10,
        recentPaymentsLimit: 10,
      }),
      buildRecoveryQueue(env, { sessionLabel, limit: recoveryLimit, includeNoCall: false }),
      buildPromiseDueList(env, { sessionLabel, limit: promiseLimit }),
      buildRecoveryPlan(env, { sessionLabel, limit: recoveryLimit, language }),
      buildFollowupDrafts(env, {
        sessionLabel,
        minPendingAmount: 0,
        overdueOnly: false,
        limit: draftLimit,
        language,
      }),
    ]);

  return {
    sessionLabel,
    asOfDate: todayIst(),
    language,
    collectionSummary,
    recoveryQueue,
    promisesDue,
    recoveryPlan,
    followUpDrafts,
    safety: {
      readOnly: true,
      messagesSent: false,
      paymentsPosted: false,
      note: "Drafts only. Payment receipt posting stays in Payment Desk after office verification.",
    },
  };
}

function toolResult(summary, structuredContent) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent,
  };
}

function createMcpServer(env) {
  const server = new McpServer({
    name: "schoolfees-collection-assistant",
    version: "0.3.0",
  });

  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  server.registerTool(
    "today_fee_collection_brief",
    {
      title: "Today's Fee Collection Brief",
      description:
        "Use this when the user wants the current fee collection overview, pending dues, top follow-up targets, and recent receipts for a session.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        topDefaultersLimit: limitSchema.default(10),
        recentPaymentsLimit: limitSchema.default(10),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, topDefaultersLimit, recentPaymentsLimit }) => {
      const brief = await buildCollectionBrief(env, {
        sessionLabel,
        topDefaultersLimit,
        recentPaymentsLimit,
      });

      return toolResult(
        `${sessionLabel}: ${brief.summary.pendingStudentCount} students have pending dues, total pending ${money(brief.summary.totalOutstanding)}.`,
        brief,
      );
    },
  );

  server.registerTool(
    "list_defaulters_for_followup",
    {
      title: "List Defaulters For Follow-Up",
      description:
        "Use this when the user asks who to call or message for fee collection follow-up.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        classId: z.string().uuid().optional().describe("Optional class UUID."),
        minPendingAmount: z.number().int().min(0).default(0),
        overdueOnly: z.boolean().default(false),
        limit: limitSchema,
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, classId, minPendingAmount, overdueOnly, limit }) => {
      const financialRows = await getFinancialRows(env, { sessionLabel, classId });
      const rows = rankDefaulters(
        financialRows.filter((row) => {
          if (number(row.outstanding_amount) <= 0) return false;
          if (number(row.outstanding_amount) < minPendingAmount) return false;
          if (overdueOnly && number(row.overdue_installment_count) === 0) return false;
          return true;
        }),
      )
        .slice(0, limit)
        .map((row, index) => ({
          rank: index + 1,
          ...mapFinancialRow(row),
        }));

      const totalPending = rows.reduce((sum, row) => sum + row.outstandingAmount, 0);
      return toolResult(
        `Found ${rows.length} follow-up students for ${sessionLabel}; listed pending total ${money(totalPending)}.`,
        {
          sessionLabel,
          filters: { classId: classId || null, minPendingAmount, overdueOnly, limit },
          rows,
        },
      );
    },
  );

  server.registerTool(
    "get_student_due_status",
    {
      title: "Get Student Due Status",
      description:
        "Use this when the user asks for one student's pending amount, installment status, parent phone, or payment context.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        query: z
          .string()
          .min(1)
          .max(80)
          .describe("Student name, admission number, class label, or parent phone."),
        limit: limitSchema.default(5),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, query, limit }) => {
      const normalizedQuery = normalizeQuery(query);
      const financialRows = await getFinancialRows(env, { sessionLabel });
      const matches = financialRows.filter((row) => includesQuery(row, normalizedQuery)).slice(0, limit);
      const students = [];

      for (const row of matches) {
        students.push({
          ...mapFinancialRow(row),
          installments: await getInstallmentRows(env, row.student_id),
        });
      }

      return toolResult(
        students.length === 0
          ? `No matching student found for "${query}" in ${sessionLabel}.`
          : `Found ${students.length} matching student record(s) for "${query}" in ${sessionLabel}.`,
        {
          sessionLabel,
          query,
          students,
        },
      );
    },
  );

  server.registerTool(
    "get_recovery_queue",
    {
      title: "Get Daily Recovery Queue",
      description:
        "Use this when the user asks for today's fee recovery call queue using pending dues, promise dates, no-answer streaks, and no-call flags from the app.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        limit: limitSchema.default(25),
        includeNoCall: z.boolean().default(false),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit, includeNoCall }) => {
      const queue = await buildRecoveryQueue(env, { sessionLabel, limit, includeNoCall });

      return toolResult(
        `Prepared ${queue.rows.length} recovery queue row(s) for ${sessionLabel}.`,
        queue,
      );
    },
  );

  server.registerTool(
    "get_promise_due_list",
    {
      title: "Get Promise Due List",
      description:
        "Use this when the user asks which parents promised payment and should be followed up today or because the promised date has passed.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        limit: limitSchema.default(25),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit }) => {
      const promiseList = await buildPromiseDueList(env, { sessionLabel, limit });

      return toolResult(
        `Found ${promiseList.rows.length} promise follow-up row(s) for ${sessionLabel}.`,
        promiseList,
      );
    },
  );

  server.registerTool(
    "get_parent_followup_context",
    {
      title: "Get Parent Follow-Up Context",
      description:
        "Use this when the user asks what to say or do for a specific student's parent during recovery follow-up.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        query: z
          .string()
          .min(1)
          .max(80)
          .describe("Student name, admission number, class label, or parent phone."),
        limit: limitSchema.default(5),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, query, limit }) => {
      const normalizedQuery = normalizeQuery(query);
      const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(env, sessionLabel);
      const recoveryRows = buildRecoveryRows(financialRows, contactSummaries, noCallIds, {
        includeNoCall: true,
      });
      const matches = recoveryRows
        .filter((row) =>
          [
            row.studentName,
            row.admissionNo,
            row.fatherName,
            row.motherName,
            row.fatherPhone,
            row.motherPhone,
            row.classLabel,
          ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)),
        )
        .slice(0, limit);

      const students = [];
      for (const row of matches) {
        students.push({
          ...row,
          installments: await getInstallmentRows(env, row.studentId),
        });
      }

      return toolResult(
        students.length === 0
          ? `No matching recovery context found for "${query}" in ${sessionLabel}.`
          : `Found ${students.length} recovery context row(s) for "${query}" in ${sessionLabel}.`,
        {
          sessionLabel,
          query,
          students,
        },
      );
    },
  );

  server.registerTool(
    "draft_recovery_plan",
    {
      title: "Draft Daily Recovery Plan",
      description:
        "Use this when the user wants a daily fee recovery plan grouped by broken promises, promises due, repeated no-answer, and high exposure.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        limit: limitSchema.default(30),
        language: z.enum(["english", "hinglish"]).default("hinglish"),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit, language }) => {
      const plan = await buildRecoveryPlan(env, { sessionLabel, limit, language });

      return toolResult(plan.headline, plan);
    },
  );

  server.registerTool(
    "get_class_due_summary",
    {
      title: "Get Class Due Summary",
      description:
        "Use this when the user wants class-wise expected, collected, pending, and overdue totals.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel }) => {
      const financialRows = await getFinancialRows(env, { sessionLabel });
      const classMap = new Map();

      for (const row of financialRows) {
        const key = row.class_id;
        const current =
          classMap.get(key) ||
          {
            classId: row.class_id,
            classLabel: row.class_label || row.class_name,
            studentCount: 0,
            pendingStudentCount: 0,
            overdueStudentCount: 0,
            totalDue: 0,
            totalPaid: 0,
            totalOutstanding: 0,
          };

        current.studentCount += 1;
        current.totalDue += number(row.total_due);
        current.totalPaid += number(row.total_paid);
        current.totalOutstanding += number(row.outstanding_amount);
        if (number(row.outstanding_amount) > 0) current.pendingStudentCount += 1;
        if (number(row.overdue_installment_count) > 0) current.overdueStudentCount += 1;
        classMap.set(key, current);
      }

      const classes = [...classMap.values()].sort((a, b) =>
        a.classLabel.localeCompare(b.classLabel, "en", { numeric: true }),
      );

      return toolResult(
        `Loaded class-wise due summary for ${classes.length} classes in ${sessionLabel}.`,
        {
          sessionLabel,
          classes,
        },
      );
    },
  );

  server.registerTool(
    "get_recent_payments",
    {
      title: "Get Recent Payments",
      description:
        "Use this when the user asks who paid recently, today's receipts, or recent collection activity.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        days: z.number().int().min(0).max(90).default(7),
        limit: limitSchema,
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, days, limit }) => {
      const payments = await getRecentPayments(env, { sessionLabel, days, limit });
      const totalAmount = payments.reduce((sum, row) => sum + row.totalAmount, 0);

      return toolResult(
        `Found ${payments.length} receipt(s) in the last ${days} day(s), total ${money(totalAmount)}.`,
        {
          sessionLabel,
          days,
          totalAmount,
          payments,
        },
      );
    },
  );

  server.registerTool(
    "prepare_followup_messages",
    {
      title: "Prepare Follow-Up Messages",
      description:
        "Use this when the user wants draft WhatsApp/SMS call text for pending fee follow-up. This only drafts messages and never sends them.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        minPendingAmount: z.number().int().min(0).default(0),
        overdueOnly: z.boolean().default(false),
        limit: limitSchema.default(10),
        language: z.enum(["english", "hinglish"]).default("hinglish"),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, minPendingAmount, overdueOnly, limit, language }) => {
      const draftPack = await buildFollowupDrafts(env, {
        sessionLabel,
        minPendingAmount,
        overdueOnly,
        limit,
        language,
      });

      return toolResult(
        `Prepared ${draftPack.drafts.length} draft follow-up message(s). Nothing was sent.`,
        draftPack,
      );
    },
  );

  server.registerTool(
    "daily_recovery_digest",
    {
      title: "Daily Recovery Digest",
      description:
        "Use this for the morning fee recovery automation. It bundles today's collection brief, recovery queue, promise follow-ups, recovery plan, and ready WhatsApp drafts with UPI intent links. It is read-only and never sends messages or posts payments.",
      inputSchema: {
        sessionLabel: sessionSchema(env),
        language: z.enum(["english", "hinglish"]).default("hinglish"),
        recoveryLimit: limitSchema.default(25),
        promiseLimit: limitSchema.default(25),
        draftLimit: limitSchema.default(10),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, language, recoveryLimit, promiseLimit, draftLimit }) => {
      const digest = await buildDailyRecoveryDigest(env, {
        sessionLabel,
        language,
        recoveryLimit,
        promiseLimit,
        draftLimit,
      });

      return toolResult(
        `${sessionLabel}: daily recovery digest ready with ${digest.recoveryQueue.rows.length} queue row(s), ${digest.promisesDue.rows.length} promise follow-up row(s), and ${digest.followUpDrafts.drafts.length} draft message(s). Nothing was sent.`,
        digest,
      );
    },
  );

  return server;
}

async function handleMcp(request, env) {
  if (!(await checkAuth(request, env))) {
    return unauthorized();
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(env);
  await server.connect(transport);
  return transport.handleRequest(request);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        name: "schoolfees-collection-assistant",
        defaultSession: getDefaultSession(env),
        schema: getSupabaseSchema(env),
      });
    }

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return handleMcp(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};

export default worker;
