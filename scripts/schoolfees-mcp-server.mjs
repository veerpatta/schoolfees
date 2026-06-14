import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadEnvFile(path.join(repoRoot, ".env.local"));

const PORT = Number(process.env.SCHOOLFEES_MCP_PORT || 4317);
const HOST = process.env.SCHOOLFEES_MCP_HOST || "127.0.0.1";
const MCP_PATH = process.env.SCHOOLFEES_MCP_PATH || "/mcp";
const DEFAULT_SESSION = process.env.SCHOOLFEES_MCP_DEFAULT_SESSION || "TEST-2026-27";
const MCP_TOKEN = process.env.SCHOOLFEES_MCP_TOKEN || "";
const ALLOWED_HOSTS = (process.env.SCHOOLFEES_MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const MAX_ROWS = 5000;

const SessionLabel = z
  .string()
  .regex(/^(?:(?:TEST|UAT|DEMO)-)?20\d{2}-\d{2}$/)
  .default(DEFAULT_SESSION)
  .describe("Academic session label, for example TEST-2026-27 or 2026-27.");

const Limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Maximum rows to return.");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseSchema() {
  if (process.env.SCHOOLFEES_MCP_SUPABASE_SCHEMA) {
    return process.env.SCHOOLFEES_MCP_SUPABASE_SCHEMA;
  }

  return process.env.APP_MODE === "test" ? "test" : "public";
}

function createSupabaseClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: getSupabaseSchema(),
    },
  });
}

const supabase = createSupabaseClient();
const transports = {};

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

async function getFinancialRows({
  sessionLabel,
  classId,
  limit = MAX_ROWS,
  onlyActive = true,
} = {}) {
  let query = supabase
    .from("v_workbook_student_financials")
    .select(financialFields)
    .eq("session_label", sessionLabel || DEFAULT_SESSION)
    .order("sort_order", { ascending: true })
    .order("student_name", { ascending: true });

  if (onlyActive) {
    query = query.eq("record_status", "active");
  }

  if (classId) {
    query = query.eq("class_id", classId);
  }

  query = query.limit(Math.min(limit, MAX_ROWS));

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to load fee data: ${error.message}`);
  }

  return data || [];
}

async function getInstallmentRows(studentId) {
  const { data, error } = await supabase
    .from("v_workbook_installment_balances")
    .select(installmentFields)
    .eq("student_id", studentId)
    .order("due_date", { ascending: true })
    .order("installment_no", { ascending: true });

  if (error) {
    throw new Error(`Unable to load installment data: ${error.message}`);
  }

  return (data || []).map((row) => ({
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
    return String(a.next_due_date || "9999-12-31").localeCompare(String(b.next_due_date || "9999-12-31"));
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

async function getContactSummaries(sessionLabel, studentIds) {
  if (studentIds.length === 0) return new Map();
  let { data, error } = await supabase
    .from("defaulter_contacts")
    .select(contactFields)
    .eq("session_label", sessionLabel)
    .order("contacted_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error?.code === "42703") {
    const legacy = await supabase
      .from("defaulter_contacts")
      .select(legacyContactFields)
      .eq("session_label", sessionLabel)
      .order("contacted_at", { ascending: false })
      .limit(MAX_ROWS);
    data = (legacy.data || []).map((row) => ({ ...row, phone_label: null }));
    error = legacy.error;
  }

  if (error) {
    if (error.code !== "42P01") {
      console.warn("[schoolfees-mcp] contact summaries unavailable", error.message);
    }
    return new Map();
  }

  return summarizeContactRows(data || [], studentIds);
}

async function getNoCallStudentIds(sessionLabel, studentIds) {
  if (studentIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("student_collection_flags")
    .select("student_id, no_call")
    .eq("session_label", sessionLabel)
    .eq("no_call", true)
    .limit(MAX_ROWS);

  if (error) {
    if (error.code !== "42P01") {
      console.warn("[schoolfees-mcp] no-call flags unavailable", error.message);
    }
    return new Set();
  }

  const wanted = new Set(studentIds);
  return new Set((data || []).filter((row) => wanted.has(row.student_id)).map((row) => row.student_id));
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

async function getRecoveryContext(sessionLabel) {
  const financialRows = await getFinancialRows({ sessionLabel });
  const studentIds = financialRows.map((row) => row.student_id).filter(Boolean);
  const [contactSummaries, noCallIds] = await Promise.all([
    getContactSummaries(sessionLabel, studentIds),
    getNoCallStudentIds(sessionLabel, studentIds),
  ]);
  return { financialRows, contactSummaries, noCallIds };
}

async function getStudentIdsForSession(sessionLabel) {
  const { data, error } = await supabase
    .from("students")
    .select("id, class_ref:classes!inner(session_label, status)")
    .eq("status", "active")
    .eq("class_ref.session_label", sessionLabel)
    .eq("class_ref.status", "active")
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`Unable to load session student scope: ${error.message}`);
  }

  return (data || []).map((row) => row.id).filter(Boolean);
}

async function getRecentPayments({ sessionLabel, days = 7, limit = 20 }) {
  const studentIds = await getStudentIdsForSession(sessionLabel);
  if (studentIds.length === 0) {
    return [];
  }

  const allRows = [];
  for (const chunk of chunkArray(studentIds, 100)) {
    const { data, error } = await supabase
      .from("receipts")
      .select(
        "id, receipt_number, payment_date, created_at, payment_mode, total_amount, received_by, student_id, student_ref:students(id, full_name, admission_no, father_name, primary_phone)",
      )
      .in("student_id", chunk)
      .gte("payment_date", dateDaysAgo(days))
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) {
      throw new Error(`Unable to load recent payments: ${error.message}`);
    }

    allRows.push(...(data || []));
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

function toolResult(summary, structuredContent) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent,
  };
}

function createServer() {
  const server = new McpServer({
    name: "schoolfees-collection-assistant",
    version: "0.2.0",
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
        sessionLabel: SessionLabel,
        topDefaultersLimit: Limit.default(10),
        recentPaymentsLimit: Limit.default(10),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, topDefaultersLimit, recentPaymentsLimit }) => {
      const [financialRows, recentPayments] = await Promise.all([
        getFinancialRows({ sessionLabel }),
        getRecentPayments({ sessionLabel, days: 7, limit: recentPaymentsLimit }),
      ]);
      const summary = summarizeFinancialRows(financialRows);
      const topDefaulters = rankDefaulters(
        financialRows.filter((row) => number(row.outstanding_amount) > 0),
      )
        .slice(0, topDefaultersLimit)
        .map(mapFinancialRow);

      return toolResult(
        `${sessionLabel}: ${summary.pendingStudentCount} students have pending dues, total pending ${money(summary.totalOutstanding)}.`,
        {
          sessionLabel,
          asOfDate: todayIst(),
          summary,
          topDefaulters,
          recentPayments,
        },
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
        sessionLabel: SessionLabel,
        classId: z.string().uuid().optional().describe("Optional class UUID."),
        minPendingAmount: z.number().int().min(0).default(0),
        overdueOnly: z.boolean().default(false),
        limit: Limit,
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, classId, minPendingAmount, overdueOnly, limit }) => {
      const financialRows = await getFinancialRows({ sessionLabel, classId });
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
        sessionLabel: SessionLabel,
        query: z
          .string()
          .min(1)
          .max(80)
          .describe("Student name, admission number, class label, or parent phone."),
        limit: Limit.default(5),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, query, limit }) => {
      const normalizedQuery = normalizeQuery(query);
      const financialRows = await getFinancialRows({ sessionLabel });
      const matches = financialRows.filter((row) => includesQuery(row, normalizedQuery)).slice(0, limit);
      const students = [];

      for (const row of matches) {
        students.push({
          ...mapFinancialRow(row),
          installments: await getInstallmentRows(row.student_id),
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
        sessionLabel: SessionLabel,
        limit: Limit.default(25),
        includeNoCall: z.boolean().default(false),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit, includeNoCall }) => {
      const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(sessionLabel);
      const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds, { includeNoCall })
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      return toolResult(
        `Prepared ${rows.length} recovery queue row(s) for ${sessionLabel}.`,
        {
          sessionLabel,
          asOfDate: todayIst(),
          includeNoCall,
          rows,
        },
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
        sessionLabel: SessionLabel,
        limit: Limit.default(25),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit }) => {
      const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(sessionLabel);
      const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds)
        .filter((row) => row.promiseState === "broken" || row.promiseState === "due_today")
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      return toolResult(
        `Found ${rows.length} promise follow-up row(s) for ${sessionLabel}.`,
        {
          sessionLabel,
          asOfDate: todayIst(),
          rows,
        },
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
        sessionLabel: SessionLabel,
        query: z
          .string()
          .min(1)
          .max(80)
          .describe("Student name, admission number, class label, or parent phone."),
        limit: Limit.default(5),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, query, limit }) => {
      const normalizedQuery = normalizeQuery(query);
      const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(sessionLabel);
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
          installments: await getInstallmentRows(row.studentId),
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
        sessionLabel: SessionLabel,
        limit: Limit.default(30),
        language: z.enum(["english", "hinglish"]).default("hinglish"),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, limit, language }) => {
      const { financialRows, contactSummaries, noCallIds } = await getRecoveryContext(sessionLabel);
      const rows = buildRecoveryRows(financialRows, contactSummaries, noCallIds).slice(0, limit);
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

      return toolResult(headline, {
        sessionLabel,
        asOfDate: todayIst(),
        language,
        headline,
        groups,
        nextBestRows: rows.slice(0, 10),
      });
    },
  );

  server.registerTool(
    "get_class_due_summary",
    {
      title: "Get Class Due Summary",
      description:
        "Use this when the user wants class-wise expected, collected, pending, and overdue totals.",
      inputSchema: {
        sessionLabel: SessionLabel,
      },
      annotations: readOnly,
    },
    async ({ sessionLabel }) => {
      const financialRows = await getFinancialRows({ sessionLabel });
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
        sessionLabel: SessionLabel,
        days: z.number().int().min(0).max(90).default(7),
        limit: Limit,
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, days, limit }) => {
      const payments = await getRecentPayments({ sessionLabel, days, limit });
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
        sessionLabel: SessionLabel,
        minPendingAmount: z.number().int().min(0).default(0),
        overdueOnly: z.boolean().default(false),
        limit: Limit.default(10),
        language: z.enum(["english", "hinglish"]).default("hinglish"),
      },
      annotations: readOnly,
    },
    async ({ sessionLabel, minPendingAmount, overdueOnly, limit, language }) => {
      const financialRows = await getFinancialRows({ sessionLabel });
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

      const drafts = rows.map((row) => {
        const amount = money(row.outstandingAmount);
        const dueText = row.nextDueDate ? ` Next due date: ${row.nextDueDate}.` : "";
        const text =
          language === "english"
            ? `Dear parent, this is a reminder from Shri Veer Patta Senior Secondary School. Pending fee for ${row.studentName} (${row.classLabel}) is ${amount}.${dueText} Please clear it at the school office.`
            : `Dear parent, Shri Veer Patta Senior Secondary School se fee reminder hai. ${row.studentName} (${row.classLabel}) ki pending fee ${amount} hai.${dueText} Kripya school office me jama kar dein.`;

        return {
          studentId: row.studentId,
          studentName: row.studentName,
          admissionNo: row.admissionNo,
          fatherName: row.fatherName,
          phone: row.fatherPhone || row.motherPhone,
          pendingAmount: row.outstandingAmount,
          draftMessage: text,
        };
      });

      return toolResult(
        `Prepared ${drafts.length} draft follow-up message(s). Nothing was sent.`,
        {
          sessionLabel,
          language,
          drafts,
        },
      );
    },
  );

  return server;
}

function authorize(req, res, next) {
  if (!MCP_TOKEN) {
    next();
    return;
  }

  const expected = `Bearer ${MCP_TOKEN}`;
  if (req.get("authorization") === expected) {
    next();
    return;
  }

  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized",
    },
    id: null,
  });
}

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: ALLOWED_HOSTS.length > 0 ? ALLOWED_HOSTS : undefined,
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "schoolfees-collection-assistant",
    defaultSession: DEFAULT_SESSION,
    schema: getSupabaseSchema(),
  });
});

app.post(MCP_PATH, authorize, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  try {
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId && transports[closedSessionId]) {
          delete transports[closedSessionId];
        }
      };

      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing MCP session. Send initialize first.",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, authorize, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing MCP session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, HOST, (error) => {
  if (error) {
    console.error("Failed to start schoolfees MCP server:", error);
    process.exit(1);
  }

  console.log(`Schoolfees MCP server listening at http://${HOST}:${PORT}${MCP_PATH}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
});
