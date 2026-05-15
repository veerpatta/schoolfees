#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * VPPS Latest-Excel Import (2026-05-15)
 *
 * End-to-end safe importer that reads the freshly-prepared "VPPS Latest
 * Students" workbook plus the Coffee "Custom Payment Report" and reconciles
 * production AY 2026-27 data without violating receipt/payment append-only
 * rules.
 *
 * Modes:
 *   --dry-run        Read-only. Resolves intents, validates counts, writes
 *                    a full report to docs/import-previews/<date>-latest-vpps-import/.
 *                    Will probe Supabase if SUPABASE_SERVICE_ROLE_KEY is set.
 *
 *   --backup         Snapshot affected public tables to JSON under
 *                    data/imports/backups/<timestamp>/ and insert a summary
 *                    row into private.vpps_direct_import_backups. Requires
 *                    SUPABASE_SERVICE_ROLE_KEY.
 *
 *   --apply          Idempotent writes. Requires SUPABASE_SERVICE_ROLE_KEY
 *                    AND both safety gates:
 *                       --confirm-apply CLI flag
 *                       VPPS_DIRECT_IMPORT_CONFIRM=I_UNDERSTAND env var
 *                    Apply performs:
 *                       1. Rename TEST-2026-27/UAT-2026-27/DEMO-2026-27 -> TEST
 *                       2. Verify 2026-27 session is active+current
 *                       3. Open import_batches row
 *                       4. Upsert active students (idempotent via mapping)
 *                       5. Mark left students (status='left'); never delete
 *                       6. Stage Payments_Current + FeeLines_Current into
 *                          private.vpps_direct_import_stage_dues for manual
 *                          review/posting (NO direct public.payments writes)
 *                       7. Sync dues for affected active students
 *                       8. Write apply report
 *
 *   --verify-only    Re-read live state and confirm post-import invariants.
 *                    No writes.
 *
 * Hard rules:
 *   - Never mutates public.receipts or public.payments rows
 *   - Never truncates anything
 *   - Always uses unique source keys for idempotency
 *   - --apply refuses to run without explicit confirmation gates
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

// Lazy-loaded so workbook-only dry-runs don't require @supabase/supabase-js
let supabaseModule = null;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const IMPORT_NAME = "vpps-latest-2026-05-15-fullbook";
const IMPORT_BATCH_FILENAME = "VPPS latest data import 2026-05-15";
const PRODUCTION_SESSION_LABEL = "2026-27";
const TEST_SESSION_FINAL_LABEL = "TEST";
const TEST_SESSION_ALIASES_TO_RENAME = ["TEST-2026-27", "UAT-2026-27", "DEMO-2026-27"];

const WORKBOOK_STUDENT_FILE = "data/imports/VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx";
const WORKBOOK_PAYMENT_FILE = "data/imports/Custom_Report_2026-05-14_201835.xlsx";
const REPORT_DIR = "docs/import-previews/2026-05-15-latest-vpps-import";
const BACKUP_ROOT = "data/imports/backups";

const EXPECTED_COUNTS = {
  latestStudentsActive: 466,
  supabaseStudentsActive: 466,
  reviewNeeded: 35,
  addedNewNotInPdf: 23,
  leftStudents: 67,
  paymentsCurrent: 363,
  paymentsLeft: 60,
  feeLinesCurrent: 621,
  feeLinesLeft: 98,
};

const CLASS_ORDER = [
  "Nursery",
  "JKG",
  "SKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "11 Arts",
  "11 Commerce",
  "11 Science",
  "12 Arts",
  "12 Commerce",
  "12 Science",
];

const CLASS_ALIAS_ENTRIES = [
  ["nursery", "Nursery"],
  ["nur", "Nursery"],
  ["jkg", "JKG"],
  ["lkg", "JKG"],
  ["skg", "SKG"],
  ["ukg", "SKG"],
  ...Array.from({ length: 10 }, (_, index) => {
    const value = index + 1;
    return [
      [`class${value}`, `Class ${value}`],
      [`${value}`, `Class ${value}`],
      [`${value}th`, `Class ${value}`],
    ];
  }).flat(),
  ["11arts", "11 Arts"],
  ["class11arts", "11 Arts"],
  ["xiarts", "11 Arts"],
  ["11commerce", "11 Commerce"],
  ["class11commerce", "11 Commerce"],
  ["xicommerce", "11 Commerce"],
  ["11science", "11 Science"],
  ["11sci", "11 Science"],
  ["class11science", "11 Science"],
  ["xiscience", "11 Science"],
  ["12arts", "12 Arts"],
  ["class12arts", "12 Arts"],
  ["xiiarts", "12 Arts"],
  ["12commerce", "12 Commerce"],
  ["class12commerce", "12 Commerce"],
  ["xiicommerce", "12 Commerce"],
  ["12science", "12 Science"],
  ["12sci", "12 Science"],
  ["class12science", "12 Science"],
  ["xiiscience", "12 Science"],
];
const CLASS_ALIASES = new Map(CLASS_ALIAS_ENTRIES);

const PAYMENT_MODE_RULES = [
  { match: /offline\s*via\s*cash|^cash\b/i, mode: "cash" },
  { match: /offline\s*via\s*upi|^upi\b|upi\s*transfer/i, mode: "upi" },
  { match: /bank\s*transfer|neft|imps|rtgs/i, mode: "bank_transfer" },
  { match: /cheque|cheq\.?/i, mode: "cheque" },
  // Online via Coffee/CoFee/payment gateway: treat as bank_transfer for
  // accounting (matches school convention; reference numbers preserved).
  { match: /online|gateway|coffee|cofee|razorpay|cashfree/i, mode: "bank_transfer" },
];

// -----------------------------------------------------------------------------
// CLI parsing
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    mode: null,
    confirmApply: false,
    studentFile: WORKBOOK_STUDENT_FILE,
    paymentFile: WORKBOOK_PAYMENT_FILE,
    reportDir: REPORT_DIR,
    backupRoot: BACKUP_ROOT,
    importName: IMPORT_NAME,
    noDb: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--dry-run":
      case "--apply":
      case "--backup":
      case "--verify-only":
        if (opts.mode) {
          throw new Error(`Only one mode flag allowed (already ${opts.mode}, got ${arg}).`);
        }
        opts.mode = arg.slice(2);
        break;
      case "--confirm-apply":
        opts.confirmApply = true;
        break;
      case "--no-db":
        opts.noDb = true;
        break;
      case "--students":
        opts.studentFile = next; i += 1; break;
      case "--payments":
        opts.paymentFile = next; i += 1; break;
      case "--report-dir":
        opts.reportDir = next; i += 1; break;
      case "--backup-root":
        opts.backupRoot = next; i += 1; break;
      case "--import-name":
        opts.importName = next; i += 1; break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }
  if (!opts.mode) {
    printUsage();
    throw new Error("Mode flag required: one of --dry-run, --apply, --backup, --verify-only.");
  }
  return opts;
}

function printUsage() {
  process.stdout.write(
    [
      "VPPS Latest-Excel Importer (2026-05-15)",
      "",
      "Usage:",
      "  node scripts/vpps-import-latest-2026-05-15.mjs --dry-run",
      "  node scripts/vpps-import-latest-2026-05-15.mjs --backup",
      "  node scripts/vpps-import-latest-2026-05-15.mjs --apply --confirm-apply",
      "  node scripts/vpps-import-latest-2026-05-15.mjs --verify-only",
      "",
      "Flags:",
      "  --no-db              Skip Supabase probe (workbook-only dry-run).",
      "  --students <path>    Override student workbook path.",
      "  --payments <path>    Override payment workbook path.",
      "  --report-dir <dir>   Override report output directory.",
      "  --backup-root <dir>  Override backup output root.",
      "  --import-name <id>   Override import_name idempotency token.",
      "",
      "Required env (for --backup / --apply / --verify-only / DB-aware --dry-run):",
      "  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Apply safety gates (BOTH required):",
      "  --confirm-apply  CLI flag",
      "  VPPS_DIRECT_IMPORT_CONFIRM=I_UNDERSTAND",
      "",
    ].join("\n") + "\n",
  );
}

// -----------------------------------------------------------------------------
// Env loading
// -----------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return { url: null, serviceKey: null, missing: ["SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"] };
  if (!serviceKey) return { url, serviceKey: null, missing: ["SUPABASE_SERVICE_ROLE_KEY"] };
  if (/<.*>|placeholder|your[-_]/i.test(serviceKey)) {
    return { url, serviceKey: null, missing: ["SUPABASE_SERVICE_ROLE_KEY (value looks like a placeholder)"] };
  }
  return { url, serviceKey, missing: [] };
}

async function createSupabaseAdmin({ url, serviceKey }) {
  if (!supabaseModule) {
    supabaseModule = await import("@supabase/supabase-js");
  }
  return supabaseModule.createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}

// -----------------------------------------------------------------------------
// Workbook reading
// -----------------------------------------------------------------------------

function readWorkbookSheets(filePath, sheetNames) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const result = {};
  for (const name of sheetNames) {
    if (!wb.SheetNames.includes(name)) {
      result[name] = null;
      continue;
    }
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      defval: null,
      raw: true,
      blankrows: false,
    });
  }
  result.__sheetNames = wb.SheetNames;
  return result;
}

function readPaymentReport(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Payment report not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const name = wb.SheetNames.find((n) => /payment\s*report/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true, blankrows: false });
  return { sheetName: name, rows };
}

// -----------------------------------------------------------------------------
// Normalizers
// -----------------------------------------------------------------------------

function asString(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value).replace(/[,₹]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value) {
  const num = asNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

function normalizeToken(value) {
  return asString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeName(value) {
  return asString(value)
    .toUpperCase()
    .replace(/\s*\.\s*/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value) {
  const digits = asString(value).replace(/\D+/g, "");
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeClass(value) {
  const raw = asString(value);
  if (!raw) return null;
  const aliased = CLASS_ALIASES.get(normalizeToken(raw));
  if (aliased) return aliased;
  for (const label of CLASS_ORDER) {
    if (normalizeToken(label) === normalizeToken(raw)) return label;
  }
  for (const label of CLASS_ORDER) {
    if (normalizeToken(raw).includes(normalizeToken(label))) return label;
  }
  return null;
}

function normalizeTransportRoute(value) {
  const raw = asString(value);
  if (!raw) return { routeName: null, isNoTransport: true };
  if (/^no\s*transport$/i.test(raw) || /^none$/i.test(raw)) {
    return { routeName: null, isNoTransport: true };
  }
  return { routeName: raw, isNoTransport: false };
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = asString(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const mdy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (mdy) {
    const [, dd, mm, yy] = mdy;
    const year = Number(yy) < 50 ? `20${yy}` : `19${yy}`;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

function normalizePaymentMode(rawMode) {
  const raw = asString(rawMode);
  if (!raw) return { mode: null, requiresReview: true, original: "" };
  for (const rule of PAYMENT_MODE_RULES) {
    if (rule.match.test(raw)) {
      return { mode: rule.mode, requiresReview: false, original: raw };
    }
  }
  return { mode: null, requiresReview: true, original: raw };
}

function normalizeStudentStatus(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "new") return "new";
  if (raw === "current" || raw === "current active") return "current";
  if (raw === "old" || raw === "left") return raw;
  return raw || null;
}

// -----------------------------------------------------------------------------
// Idempotency keys
// -----------------------------------------------------------------------------

function studentSourceKey(row) {
  // Anchor preference: source_student_uid > sr_no > normalized name+class+dob
  return (
    asString(row.source_student_uid).trim() ||
    `SR:${asString(row.sr_no)}` ||
    `NAME:${normalizeName(row.student_name)}|CLASS:${normalizeClass(row.class_name) ?? ""}|DOB:${parseDate(row.date_of_birth) ?? ""}`
  );
}

function paymentSourceKey(row) {
  // duplicate_check_key from the workbook is the strongest single key.
  const workbookKey = asString(row.duplicate_check_key);
  if (workbookKey) return `WB:${workbookKey}`;
  const studentUid = asString(row.source_student_uid) || asString(row.active_uid);
  return [
    "PMT",
    studentUid,
    parseDate(row.payment_date) ?? "",
    asInteger(row.amount_paid) ?? "",
    asString(row.receipt_or_invoice_no) || asString(row.source_transaction_id),
  ].join("|");
}

function feeLineSourceKey(row) {
  const studentUid = asString(row.student_uid) || asString(row.active_uid);
  return [
    "FL",
    studentUid,
    asString(row.transaction_id) || asString(row.invoice_id) || asString(row.source_row),
    asString(row.group_name),
    parseDate(row.due_on) ?? "",
    asInteger(row.total_amount) ?? "",
  ].join("|");
}

// -----------------------------------------------------------------------------
// Workbook count validation
// -----------------------------------------------------------------------------

function validateWorkbookCounts(sheets) {
  const detected = {
    latestStudentsActive: sheets.Latest_Students_Active?.length ?? 0,
    supabaseStudentsActive: sheets.Supabase_Students_Active?.length ?? 0,
    reviewNeeded: sheets.Review_Needed?.length ?? 0,
    addedNewNotInPdf: sheets.Added_New_Not_in_PDF?.length ?? 0,
    leftStudents: sheets.Left_Students?.length ?? 0,
    paymentsCurrent: sheets.Payments_Current?.length ?? 0,
    paymentsLeft: sheets.Payments_Left?.length ?? 0,
    feeLinesCurrent: sheets.FeeLines_Current?.length ?? 0,
    feeLinesLeft: sheets.FeeLines_Left?.length ?? 0,
  };
  const mismatches = [];
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (detected[key] !== expected) {
      mismatches.push({ key, expected, detected: detected[key] });
    }
  }
  return { detected, mismatches };
}

// -----------------------------------------------------------------------------
// Intent builders
// -----------------------------------------------------------------------------

function buildStudentIntents(supabaseSheet, reviewSet) {
  const intents = [];
  const skipped = [];
  const seenSourceKeys = new Set();
  for (let i = 0; i < supabaseSheet.length; i += 1) {
    const row = supabaseSheet[i];
    const sourceKey = studentSourceKey(row);
    if (seenSourceKeys.has(sourceKey)) {
      skipped.push({
        sheet: "Supabase_Students_Active",
        sheetRow: i + 2,
        reason: "duplicate_source_key_within_sheet",
        sourceKey,
        studentName: asString(row.student_name),
      });
      continue;
    }
    seenSourceKeys.add(sourceKey);

    const classLabel = normalizeClass(row.class_name);
    if (!classLabel) {
      skipped.push({
        sheet: "Supabase_Students_Active",
        sheetRow: i + 2,
        reason: "unrecognized_class_label",
        sourceKey,
        classRaw: asString(row.class_name),
        studentName: asString(row.student_name),
      });
      continue;
    }

    const status = normalizeStudentStatus(row.student_status);
    const isReview = reviewSet.has(asString(row.source_student_uid));
    const reviewStatus = isReview || /needs?\s*review/i.test(asString(row.review_status))
      ? "needs_review"
      : "ok";

    const route = normalizeTransportRoute(row.transport_route);
    const admissionRaw = asString(row.sr_no);
    const admissionCandidate = admissionRaw
      ? admissionRaw.replace(/\.0$/, "").trim()
      : null;

    intents.push({
      sheet: "Supabase_Students_Active",
      sheetRow: i + 2,
      sourceKey,
      sourceStudentUid: asString(row.source_student_uid) || null,
      admissionCandidate,
      admissionPendingPrefix: admissionCandidate ? null : `VPPS-${(asString(row.source_student_uid) || `R${i + 2}`).replace(/[^A-Z0-9]/gi, "")}`,
      fullName: asString(row.student_name),
      classLabel,
      sessionLabel: PRODUCTION_SESSION_LABEL,
      dateOfBirth: parseDate(row.date_of_birth),
      gender: asString(row.gender) || null,
      category: asString(row.category) || null,
      fatherName: asString(row.father_name) || null,
      motherName: asString(row.mother_name) || null,
      primaryPhone: normalizePhone(row.father_phone),
      secondaryPhone: normalizePhone(row.mother_phone),
      transportRouteName: route.routeName,
      transportIsNone: route.isNoTransport,
      sourceStatus: status,
      reviewStatus,
      notes: asString(row.notes) || null,
      tuitionOverride: asInteger(row.tuition_override),
      transportOverride: asInteger(row.transport_override),
      discountAmount: asInteger(row.discount_amount),
      lateFeeWaiver: asString(row.late_fee_waiver) || null,
    });
  }
  return { intents, skipped };
}

function buildLeftStudentIntents(leftSheet) {
  const intents = [];
  for (let i = 0; i < leftSheet.length; i += 1) {
    const row = leftSheet[i];
    intents.push({
      sheet: "Left_Students",
      sheetRow: i + 2,
      sourceStudentUid: asString(row.previous_student_uid) || null,
      previousName: asString(row.previous_name),
      previousClass: normalizeClass(row.previous_class),
      previousStatus: asString(row.previous_status) || null,
      reason: asString(row.reason) || null,
      feeAppOutstanding: asInteger(row.fee_app_outstanding) ?? 0,
      coffeeRemaining: asInteger(row.coffee_remaining) ?? 0,
    });
  }
  return { intents };
}

function buildPaymentIntents(paymentsSheet) {
  const intents = [];
  const skipped = [];
  const seen = new Map();
  for (let i = 0; i < paymentsSheet.length; i += 1) {
    const row = paymentsSheet[i];
    const sourceKey = paymentSourceKey(row);
    const existing = seen.get(sourceKey);
    if (existing) {
      skipped.push({
        sheet: "Payments_Current",
        sheetRow: i + 2,
        reason: "duplicate_source_key_within_sheet",
        sourceKey,
        firstSeenRow: existing,
      });
      continue;
    }
    seen.set(sourceKey, i + 2);

    const mode = normalizePaymentMode(row.payment_method);
    const amount = asInteger(row.amount_paid);
    const date = parseDate(row.payment_date);
    const groupName = asString(row.fee_group_or_head);
    const isCurrentSession = /AY\s*2026-?27|2026-?27/i.test(groupName);

    if (!amount || amount <= 0) {
      skipped.push({
        sheet: "Payments_Current",
        sheetRow: i + 2,
        reason: "non_positive_amount",
        sourceKey,
        amount,
      });
      continue;
    }
    if (!date) {
      skipped.push({
        sheet: "Payments_Current",
        sheetRow: i + 2,
        reason: "unparseable_payment_date",
        sourceKey,
        dateRaw: asString(row.payment_date),
      });
      continue;
    }

    intents.push({
      sheet: "Payments_Current",
      sheetRow: i + 2,
      sourceKey,
      sourceStudentUid: asString(row.source_student_uid) || asString(row.active_uid),
      activeUid: asString(row.active_uid),
      studentName: asString(row.active_student_name) || asString(row.student_name),
      classLabel: normalizeClass(row.active_class_name) || normalizeClass(row.class_name),
      paymentImportId: asString(row.payment_import_id),
      sourceSystem: asString(row.source_system),
      admissionOrSr: asString(row.sr_no_or_admission_no),
      paymentDate: date,
      amount,
      paymentMode: mode.mode,
      paymentModeRaw: mode.original,
      paymentModeRequiresReview: mode.requiresReview,
      receiptOrInvoiceNo: asString(row.receipt_or_invoice_no) || null,
      sourceTransactionId: asString(row.source_transaction_id) || null,
      remarks: asString(row.remarks) || null,
      feeGroupOrHead: groupName,
      feeGroupSessionLabel: isCurrentSession ? PRODUCTION_SESSION_LABEL : "2025-26-or-older",
      reviewStatus: asString(row.review_status) || null,
      workbookDuplicateWarning: asString(row.duplicate_warning) || null,
    });
  }
  return { intents, skipped };
}

function buildFeeLineIntents(feeLinesSheet) {
  const intents = [];
  const skipped = [];
  const seen = new Set();
  for (let i = 0; i < feeLinesSheet.length; i += 1) {
    const row = feeLinesSheet[i];
    const sourceKey = feeLineSourceKey(row);
    if (seen.has(sourceKey)) {
      skipped.push({
        sheet: "FeeLines_Current",
        sheetRow: i + 2,
        reason: "duplicate_source_key_within_sheet",
        sourceKey,
      });
      continue;
    }
    seen.add(sourceKey);
    intents.push({
      sheet: "FeeLines_Current",
      sheetRow: i + 2,
      sourceKey,
      sourceStudentUid: asString(row.student_uid) || asString(row.active_uid),
      classLabel: normalizeClass(row.active_class_name) || normalizeClass(row.canonical_class),
      feeHead: asString(row.fee_head) || null,
      groupName: asString(row.group_name),
      dueOn: parseDate(row.due_on),
      totalAmount: asInteger(row.total_amount) ?? 0,
      amountPaid: asInteger(row.amount_paid) ?? 0,
      amountPaidTillDate: asInteger(row.amount_paid_till_date) ?? 0,
      remainingAmount: asInteger(row.remaining_amount) ?? 0,
      fineAmount: asInteger(row.fine_amount) ?? 0,
      status: asString(row.status) || null,
      reviewStatus: asString(row.review_status) || null,
      reviewNotes: asString(row.review_notes) || null,
    });
  }
  return { intents, skipped };
}

// -----------------------------------------------------------------------------
// DB probe (optional)
// -----------------------------------------------------------------------------

async function probeSupabaseState(client) {
  const sessions = await client
    .from("academic_sessions")
    .select("session_label,status,is_current,notes,updated_at")
    .order("session_label", { ascending: true });
  if (sessions.error) throw new Error(`Failed to read academic_sessions: ${sessions.error.message}`);

  const classes = await client
    .from("classes")
    .select("id,session_label,class_name,status")
    .eq("session_label", PRODUCTION_SESSION_LABEL);
  if (classes.error) throw new Error(`Failed to read classes: ${classes.error.message}`);

  const routes = await client
    .from("transport_routes")
    .select("id,route_name,route_code,is_active");
  if (routes.error) throw new Error(`Failed to read transport_routes: ${routes.error.message}`);

  const studentsHead = await client
    .from("students")
    .select("id,admission_no,full_name,class_id,status,notes,left_on", { count: "exact" })
    .order("admission_no", { ascending: true })
    .limit(1000);
  if (studentsHead.error) throw new Error(`Failed to read students: ${studentsHead.error.message}`);

  const studentsAll = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const page = await client
      .from("students")
      .select("id,admission_no,full_name,class_id,status,notes,left_on")
      .order("admission_no", { ascending: true })
      .range(from, from + pageSize - 1);
    if (page.error) throw new Error(`Failed to page students: ${page.error.message}`);
    studentsAll.push(...(page.data ?? []));
    if (!page.data || page.data.length < pageSize) break;
    from += pageSize;
  }

  // Existing mapping rows (if migration applied)
  let mapping = [];
  const mappingResult = await client
    .schema("private")
    .from("vpps_student_source_mapping")
    .select("source_student_uid,import_name,student_id,matched_via");
  if (mappingResult.error) {
    if (!/relation .* does not exist/i.test(mappingResult.error.message)) {
      throw new Error(`Failed to read source mapping: ${mappingResult.error.message}`);
    }
    mapping = [];
  } else {
    mapping = mappingResult.data ?? [];
  }

  return {
    sessions: sessions.data ?? [],
    classes: classes.data ?? [],
    routes: routes.data ?? [],
    students: studentsAll,
    studentCount: studentsHead.count ?? studentsAll.length,
    sourceMapping: mapping,
  };
}

function resolveStudentExistence(intents, dbState) {
  if (!dbState) {
    return {
      resolved: intents.map((intent) => ({
        ...intent,
        existingStudentId: null,
        existingAdmissionNo: null,
        existingStatus: null,
        matchedVia: null,
        action: "unknown_db_probe_skipped",
      })),
    };
  }
  const mapByUid = new Map(dbState.sourceMapping.map((m) => [m.source_student_uid, m]));
  const studentsById = new Map(dbState.students.map((s) => [s.id, s]));
  const studentsByAdmission = new Map(dbState.students.map((s) => [s.admission_no, s]));
  const studentsByNotesUid = new Map();
  for (const s of dbState.students) {
    const noteUid = /STU-\d{4}/i.exec(asString(s.notes))?.[0];
    if (noteUid) studentsByNotesUid.set(noteUid, s);
  }

  const resolved = [];
  for (const intent of intents) {
    let match = null;
    let matchedVia = null;
    if (intent.sourceStudentUid && mapByUid.has(intent.sourceStudentUid)) {
      const mappingRow = mapByUid.get(intent.sourceStudentUid);
      const target = studentsById.get(mappingRow.student_id);
      if (target) {
        match = target;
        matchedVia = "source_student_uid_mapping";
      }
    }
    if (!match && intent.admissionCandidate && studentsByAdmission.has(intent.admissionCandidate)) {
      match = studentsByAdmission.get(intent.admissionCandidate);
      matchedVia = "admission_no";
    }
    if (!match && intent.sourceStudentUid && studentsByNotesUid.has(intent.sourceStudentUid)) {
      match = studentsByNotesUid.get(intent.sourceStudentUid);
      matchedVia = "notes_source_uid_fallback";
    }
    resolved.push({
      ...intent,
      existingStudentId: match?.id ?? null,
      existingAdmissionNo: match?.admission_no ?? null,
      existingStatus: match?.status ?? null,
      matchedVia,
      action: match ? "update" : "insert",
    });
  }
  return { resolved };
}

function resolveClassRouteIds(intents, dbState) {
  if (!dbState) return { withIds: intents.map((i) => ({ ...i, classId: null, transportRouteId: null })), errors: [] };
  const classByLabel = new Map(dbState.classes.map((c) => [c.class_name, c]));
  const routesByName = new Map(dbState.routes.map((r) => [r.route_name.toLowerCase(), r]));
  const errors = [];
  const withIds = intents.map((intent) => {
    const klass = intent.classLabel ? classByLabel.get(intent.classLabel) : null;
    const route = intent.transportIsNone
      ? null
      : intent.transportRouteName
        ? routesByName.get(intent.transportRouteName.toLowerCase())
        : null;
    if (intent.classLabel && !klass) {
      errors.push({
        sheet: intent.sheet,
        sheetRow: intent.sheetRow,
        type: "class_not_found_in_db",
        classLabel: intent.classLabel,
        sessionLabel: intent.sessionLabel,
      });
    }
    if (!intent.transportIsNone && intent.transportRouteName && !route) {
      errors.push({
        sheet: intent.sheet,
        sheetRow: intent.sheetRow,
        type: "route_not_found_in_db",
        routeName: intent.transportRouteName,
      });
    }
    return {
      ...intent,
      classId: klass?.id ?? null,
      transportRouteId: route?.id ?? null,
    };
  });
  return { withIds, errors };
}

// -----------------------------------------------------------------------------
// Dry-run orchestrator
// -----------------------------------------------------------------------------

async function runDryRun(opts) {
  const sheets = readWorkbookSheets(opts.studentFile, [
    "Summary",
    "Latest_Students_Active",
    "Supabase_Students_Active",
    "Review_Needed",
    "Added_New_Not_in_PDF",
    "Left_Students",
    "Payments_Current",
    "Payments_Left",
    "FeeLines_Current",
    "FeeLines_Left",
    "Match_Audit",
  ]);
  const paymentReport = readPaymentReport(opts.paymentFile);

  console.log(`[dry-run] Read workbook with sheets: ${sheets.__sheetNames.length}. Payment report sheet: "${paymentReport.sheetName}" with ${paymentReport.rows.length} rows.`);

  const counts = validateWorkbookCounts(sheets);
  if (counts.mismatches.length) {
    console.error("\n[dry-run] STOP: workbook counts do not match expected facts.");
    console.error(JSON.stringify(counts, null, 2));
    throw new Error("Workbook count validation failed.");
  }
  console.log("[dry-run] Workbook counts match expected values.");

  const reviewSet = new Set(
    (sheets.Review_Needed ?? []).map((r) => asString(r.active_uid)).filter(Boolean),
  );
  const { intents: studentIntentsRaw, skipped: studentSkipped } = buildStudentIntents(
    sheets.Supabase_Students_Active ?? [],
    reviewSet,
  );
  const { intents: leftIntents } = buildLeftStudentIntents(sheets.Left_Students ?? []);
  const { intents: paymentIntentsRaw, skipped: paymentSkipped } = buildPaymentIntents(
    sheets.Payments_Current ?? [],
  );
  const { intents: feeLineIntents, skipped: feeLineSkipped } = buildFeeLineIntents(
    sheets.FeeLines_Current ?? [],
  );

  const supabaseConfig = opts.noDb ? { url: null, serviceKey: null, missing: ["--no-db flag"] } : getSupabaseConfig();
  let dbState = null;
  if (!opts.noDb && supabaseConfig.serviceKey) {
    try {
      console.log("[dry-run] Probing Supabase live state for class/route/session/student resolution...");
      const client = await createSupabaseAdmin(supabaseConfig);
      dbState = await probeSupabaseState(client);
      console.log(`[dry-run] Live: ${dbState.studentCount} students, ${dbState.classes.length} classes (${PRODUCTION_SESSION_LABEL}), ${dbState.routes.length} routes, ${dbState.sessions.length} sessions, ${dbState.sourceMapping.length} prior mappings.`);
    } catch (error) {
      console.warn(`[dry-run] Supabase probe failed (continuing workbook-only): ${error.message}`);
      dbState = null;
    }
  } else {
    console.log(`[dry-run] Workbook-only mode (no DB probe). Missing: ${supabaseConfig.missing.join(", ")}`);
  }

  const { resolved: studentIntentsResolved } = resolveStudentExistence(studentIntentsRaw, dbState);
  const { withIds: studentIntents, errors: studentResolveErrors } = resolveClassRouteIds(
    studentIntentsResolved,
    dbState,
  );

  // Aggregate stats
  const inserts = studentIntents.filter((s) => s.action === "insert").length;
  const updates = studentIntents.filter((s) => s.action === "update").length;
  const reviewCount = studentIntents.filter((s) => s.reviewStatus === "needs_review").length;
  const matchedViaCount = studentIntents.reduce((acc, s) => {
    if (!s.matchedVia) return acc;
    acc[s.matchedVia] = (acc[s.matchedVia] ?? 0) + 1;
    return acc;
  }, {});
  const studentsByClass = studentIntents.reduce((acc, s) => {
    if (!s.classLabel) return acc;
    acc[s.classLabel] = (acc[s.classLabel] ?? 0) + 1;
    return acc;
  }, {});
  const paymentTotalsByMode = paymentIntentsRaw.reduce((acc, p) => {
    const key = p.paymentMode ?? "unknown";
    acc[key] = (acc[key] ?? { count: 0, sum: 0 });
    acc[key].count += 1;
    acc[key].sum += p.amount ?? 0;
    return acc;
  }, {});
  const paymentTotalsBySession = paymentIntentsRaw.reduce((acc, p) => {
    const key = p.feeGroupSessionLabel ?? "unknown";
    acc[key] = (acc[key] ?? { count: 0, sum: 0 });
    acc[key].count += 1;
    acc[key].sum += p.amount ?? 0;
    return acc;
  }, {});
  const paymentsRequiringModeReview = paymentIntentsRaw.filter((p) => p.paymentModeRequiresReview).length;
  const paymentsWithWorkbookDupWarning = paymentIntentsRaw.filter((p) => p.workbookDuplicateWarning).length;

  // Cross-check payment report vs Payments_Current
  const paymentReportKeys = new Set(
    paymentReport.rows
      .map((r) => asString(r["Transaction ID"]) || asString(r["Order ID"]))
      .filter(Boolean),
  );
  const paymentsTracedToReport = paymentIntentsRaw.filter(
    (p) => p.sourceTransactionId && paymentReportKeys.has(p.sourceTransactionId),
  ).length;

  const sessionState = dbState
    ? {
        productionSessionLabel: PRODUCTION_SESSION_LABEL,
        productionSessionPresent: dbState.sessions.some(
          (s) => s.session_label === PRODUCTION_SESSION_LABEL && s.is_current && s.status === "active",
        ),
        sessionsToRenameToTest: dbState.sessions
          .filter((s) => TEST_SESSION_ALIASES_TO_RENAME.includes(s.session_label))
          .map((s) => s.session_label),
        existingTestSession: dbState.sessions.find((s) => s.session_label === TEST_SESSION_FINAL_LABEL) ?? null,
        allSessions: dbState.sessions.map((s) => ({
          session_label: s.session_label,
          status: s.status,
          is_current: s.is_current,
        })),
      }
    : {
        productionSessionLabel: PRODUCTION_SESSION_LABEL,
        note: "DB probe skipped; session state not verified.",
      };

  const summary = {
    generatedAt: new Date().toISOString(),
    importName: opts.importName,
    productionSessionLabel: PRODUCTION_SESSION_LABEL,
    workbook: {
      studentFile: opts.studentFile,
      paymentFile: opts.paymentFile,
      detectedSheets: sheets.__sheetNames,
      expectedCounts: EXPECTED_COUNTS,
      detectedCounts: counts.detected,
      countMismatches: counts.mismatches,
    },
    paymentReportCrossCheck: {
      reportSheet: paymentReport.sheetName,
      reportRows: paymentReport.rows.length,
      paymentsTracedToReportByTxn: paymentsTracedToReport,
    },
    studentResolution: {
      totalIntents: studentIntents.length,
      skipped: studentSkipped.length,
      insertsPlanned: inserts,
      updatesPlanned: updates,
      needsReview: reviewCount,
      matchedViaCount,
      byClass: studentsByClass,
      resolveErrors: studentResolveErrors.length,
    },
    leftStudents: {
      total: leftIntents.length,
      withFeeAppOutstanding: leftIntents.filter((l) => l.feeAppOutstanding > 0).length,
      totalFeeAppOutstanding: leftIntents.reduce((s, l) => s + (l.feeAppOutstanding || 0), 0),
    },
    payments: {
      totalIntents: paymentIntentsRaw.length,
      skipped: paymentSkipped.length,
      totalsByMode: paymentTotalsByMode,
      totalsBySession: paymentTotalsBySession,
      requiringModeReview: paymentsRequiringModeReview,
      workbookDuplicateWarnings: paymentsWithWorkbookDupWarning,
      paymentsTracedToReportByTxnId: paymentsTracedToReport,
    },
    feeLines: {
      totalIntents: feeLineIntents.length,
      skipped: feeLineSkipped.length,
      totalRemaining: feeLineIntents.reduce((s, f) => s + (f.remainingAmount || 0), 0),
      totalFine: feeLineIntents.reduce((s, f) => s + (f.fineAmount || 0), 0),
    },
    session: sessionState,
    safetyInvariants: {
      neverMutatesPublicPayments: true,
      neverMutatesPublicReceipts: true,
      neverDeletesStudents: true,
      neverTruncates: true,
      idempotencyAnchor: "private.vpps_student_source_mapping + source_student_uid",
    },
  };

  // Write report
  const outDir = path.resolve(opts.reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(outDir, "student-intents.json"),
    JSON.stringify({ studentIntents, studentSkipped, leftIntents }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "payment-intents.json"),
    JSON.stringify({ paymentIntents: paymentIntentsRaw, paymentSkipped }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "feeline-intents.json"),
    JSON.stringify({ feeLineIntents, feeLineSkipped }, null, 2),
  );
  writeCsv(
    path.join(outDir, "student-intents.csv"),
    studentIntents.map((s) => ({
      sheetRow: s.sheetRow,
      sourceStudentUid: s.sourceStudentUid,
      admissionCandidate: s.admissionCandidate,
      fullName: s.fullName,
      classLabel: s.classLabel,
      classIdResolved: s.classId ?? "",
      routeIdResolved: s.transportRouteId ?? "",
      transportIsNone: s.transportIsNone,
      reviewStatus: s.reviewStatus,
      action: s.action,
      matchedVia: s.matchedVia ?? "",
      existingAdmissionNo: s.existingAdmissionNo ?? "",
    })),
  );
  writeCsv(
    path.join(outDir, "payment-intents.csv"),
    paymentIntentsRaw.map((p) => ({
      sheetRow: p.sheetRow,
      sourceStudentUid: p.sourceStudentUid,
      paymentDate: p.paymentDate,
      amount: p.amount,
      paymentMode: p.paymentMode ?? "",
      paymentModeRaw: p.paymentModeRaw,
      receiptOrInvoiceNo: p.receiptOrInvoiceNo ?? "",
      sourceTransactionId: p.sourceTransactionId ?? "",
      feeGroupSessionLabel: p.feeGroupSessionLabel,
      requiresReview: p.paymentModeRequiresReview,
      workbookDuplicateWarning: p.workbookDuplicateWarning ?? "",
      sourceKey: p.sourceKey,
    })),
  );
  writeCsv(
    path.join(outDir, "left-student-intents.csv"),
    leftIntents.map((l) => ({
      sheetRow: l.sheetRow,
      sourceStudentUid: l.sourceStudentUid,
      previousName: l.previousName,
      previousClass: l.previousClass ?? "",
      previousStatus: l.previousStatus ?? "",
      reason: l.reason ?? "",
      feeAppOutstanding: l.feeAppOutstanding,
    })),
  );
  writeCsv(
    path.join(outDir, "anomalies.csv"),
    [
      ...studentSkipped.map((s) => ({ kind: "student_skipped", ...s })),
      ...paymentSkipped.map((s) => ({ kind: "payment_skipped", ...s })),
      ...feeLineSkipped.map((s) => ({ kind: "feeline_skipped", ...s })),
      ...studentResolveErrors.map((s) => ({ kind: "resolve_error", ...s })),
    ],
  );

  // Markdown report
  const md = renderDryRunMarkdown(summary, {
    studentIntentsCount: studentIntents.length,
    paymentIntentsCount: paymentIntentsRaw.length,
    feeLineIntentsCount: feeLineIntents.length,
    dbProbed: Boolean(dbState),
  });
  fs.writeFileSync(path.join(outDir, "README.md"), md);

  console.log("\n[dry-run] Report written to", outDir);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function renderDryRunMarkdown(summary, extras) {
  const lines = [];
  lines.push(`# VPPS Latest-Excel Import Dry Run — ${summary.generatedAt}`);
  lines.push("");
  lines.push(`**Import name:** \`${summary.importName}\``);
  lines.push(`**Production session:** \`${summary.productionSessionLabel}\``);
  lines.push(`**DB probe:** ${extras.dbProbed ? "yes (live Supabase state read)" : "no — workbook-only mode"}`);
  lines.push("");
  lines.push("## Workbook counts vs expected facts");
  lines.push("");
  lines.push("| Sheet | Expected | Detected | Match |");
  lines.push("|---|---:|---:|:---:|");
  for (const [key, expected] of Object.entries(summary.workbook.expectedCounts)) {
    const detected = summary.workbook.detectedCounts[key];
    lines.push(`| ${key} | ${expected} | ${detected} | ${detected === expected ? "✓" : "✗"} |`);
  }
  lines.push("");
  lines.push(`Mismatches: **${summary.workbook.countMismatches.length}**`);
  lines.push("");
  lines.push("## Student resolution");
  lines.push("");
  lines.push(`- Total intents: ${summary.studentResolution.totalIntents}`);
  lines.push(`- Inserts planned: ${summary.studentResolution.insertsPlanned}`);
  lines.push(`- Updates planned: ${summary.studentResolution.updatesPlanned}`);
  lines.push(`- Needs review: ${summary.studentResolution.needsReview}`);
  lines.push(`- Skipped: ${summary.studentResolution.skipped}`);
  lines.push(`- Resolve errors (class/route lookup): ${summary.studentResolution.resolveErrors}`);
  lines.push("");
  lines.push("### Matched via");
  for (const [k, v] of Object.entries(summary.studentResolution.matchedViaCount)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  lines.push("### Students by class");
  for (const label of CLASS_ORDER) {
    const count = summary.studentResolution.byClass[label] ?? 0;
    if (count) lines.push(`- ${label}: ${count}`);
  }
  lines.push("");
  lines.push("## Left students (will be marked status=left; not deleted)");
  lines.push("");
  lines.push(`- Total: ${summary.leftStudents.total}`);
  lines.push(`- With outstanding fee-app balance: ${summary.leftStudents.withFeeAppOutstanding}`);
  lines.push(`- Total fee-app outstanding: ₹${summary.leftStudents.totalFeeAppOutstanding.toLocaleString("en-IN")}`);
  lines.push("");
  lines.push("## Payments");
  lines.push("");
  lines.push(`- Total intents: ${summary.payments.totalIntents}`);
  lines.push(`- Skipped: ${summary.payments.skipped}`);
  lines.push(`- Mode-review required: ${summary.payments.requiringModeReview}`);
  lines.push(`- Workbook duplicate-check warnings: ${summary.payments.workbookDuplicateWarnings}`);
  lines.push(`- Traced to Payment Report by Transaction ID: ${summary.payments.paymentsTracedToReportByTxnId}`);
  lines.push("");
  lines.push("### By payment mode");
  for (const [mode, agg] of Object.entries(summary.payments.totalsByMode)) {
    lines.push(`- ${mode}: ${agg.count} rows, ₹${agg.sum.toLocaleString("en-IN")}`);
  }
  lines.push("");
  lines.push("### By session bucket");
  for (const [bucket, agg] of Object.entries(summary.payments.totalsBySession)) {
    lines.push(`- ${bucket}: ${agg.count} rows, ₹${agg.sum.toLocaleString("en-IN")}`);
  }
  lines.push("");
  lines.push("## Fee lines (current students)");
  lines.push(`- Total intents: ${summary.feeLines.totalIntents}`);
  lines.push(`- Skipped: ${summary.feeLines.skipped}`);
  lines.push(`- Total remaining: ₹${summary.feeLines.totalRemaining.toLocaleString("en-IN")}`);
  lines.push(`- Total fine: ₹${summary.feeLines.totalFine.toLocaleString("en-IN")}`);
  lines.push("");
  lines.push("## Session state");
  lines.push("```json");
  lines.push(JSON.stringify(summary.session, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Safety invariants (apply-mode)");
  lines.push("");
  for (const [k, v] of Object.entries(summary.safetyInvariants)) {
    lines.push(`- **${k}**: \`${v}\``);
  }
  lines.push("");
  lines.push("## Files produced");
  lines.push("");
  lines.push("- `summary.json`");
  lines.push("- `student-intents.json` / `student-intents.csv`");
  lines.push("- `payment-intents.json` / `payment-intents.csv`");
  lines.push("- `feeline-intents.json`");
  lines.push("- `left-student-intents.csv`");
  lines.push("- `anomalies.csv`");
  return lines.join("\n") + "\n";
}

// -----------------------------------------------------------------------------
// CSV writer
// -----------------------------------------------------------------------------

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "");
    return;
  }
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const body = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  fs.writeFileSync(filePath, body + "\n");
}

// -----------------------------------------------------------------------------
// Backup mode
// -----------------------------------------------------------------------------

const BACKUP_TABLES = [
  "academic_sessions",
  "classes",
  "transport_routes",
  "students",
  "fee_settings",
  "student_fee_overrides",
  "installments",
  "receipts",
  "payments",
  "payment_adjustments",
  "import_batches",
  "import_rows",
];

async function runBackup(opts) {
  const cfg = getSupabaseConfig();
  if (!cfg.serviceKey) {
    throw new Error(`Backup requires SUPABASE_SERVICE_ROLE_KEY. Missing: ${cfg.missing.join(", ")}`);
  }
  const client = await createSupabaseAdmin(cfg);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(opts.backupRoot, `${opts.importName}-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`[backup] Writing snapshot to ${backupDir}`);

  const counts = {};
  const checksums = {};
  for (const table of BACKUP_TABLES) {
    let from = 0;
    const pageSize = 1000;
    const allRows = [];
    while (true) {
      const page = await client.from(table).select("*").range(from, from + pageSize - 1);
      if (page.error) {
        throw new Error(`Failed to backup ${table}: ${page.error.message}`);
      }
      allRows.push(...(page.data ?? []));
      if (!page.data || page.data.length < pageSize) break;
      from += pageSize;
    }
    counts[table] = allRows.length;
    checksums[table] = simpleChecksum(JSON.stringify(allRows));
    fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(allRows, null, 2));
    console.log(`[backup] ${table}: ${allRows.length} rows`);
  }

  const label = `${opts.importName}-${stamp}`;
  const manifest = {
    backupLabel: label,
    createdAt: new Date().toISOString(),
    importName: opts.importName,
    backupDir,
    tableCounts: counts,
    checksums,
  };
  fs.writeFileSync(path.join(backupDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

  // Record summary in private.vpps_direct_import_backups
  const insertResult = await client
    .schema("private")
    .from("vpps_direct_import_backups")
    .insert({
      backup_label: label,
      table_counts: counts,
      checksum_summary: checksums,
      snapshot: { backupDir, importName: opts.importName, generatedAt: manifest.createdAt },
    });
  if (insertResult.error) {
    console.warn(`[backup] Could not record manifest into private.vpps_direct_import_backups: ${insertResult.error.message}`);
  }

  console.log(`[backup] Done. Label: ${label}`);
  return manifest;
}

function simpleChecksum(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}

// -----------------------------------------------------------------------------
// Apply mode
// -----------------------------------------------------------------------------

async function runApply(opts) {
  if (!opts.confirmApply) {
    throw new Error("--apply requires --confirm-apply CLI flag.");
  }
  if (process.env.VPPS_DIRECT_IMPORT_CONFIRM !== "I_UNDERSTAND") {
    throw new Error("--apply requires VPPS_DIRECT_IMPORT_CONFIRM=I_UNDERSTAND env var.");
  }
  const cfg = getSupabaseConfig();
  if (!cfg.serviceKey) {
    throw new Error(`Apply requires SUPABASE_SERVICE_ROLE_KEY. Missing: ${cfg.missing.join(", ")}`);
  }

  const dryRunSummary = await runDryRun(opts);
  if (dryRunSummary.workbook.countMismatches.length) {
    throw new Error("Refusing to apply: workbook count mismatches present.");
  }
  if (dryRunSummary.studentResolution.resolveErrors > 0) {
    throw new Error("Refusing to apply: unresolved class/route lookups exist. Fix Fee Setup first.");
  }

  const client = await createSupabaseAdmin(cfg);

  console.log("[apply] Step 1/8: rename test session aliases to TEST");
  await renameTestSessions(client);

  console.log("[apply] Step 2/8: verify production session 2026-27 is active+current");
  await verifyProductionSession(client);

  console.log("[apply] Step 3/8: open import_batches row");
  const batchId = await openImportBatch(client, opts);

  console.log("[apply] Step 4/8: upsert active students (idempotent)");
  await applyStudentUpserts(client, opts, batchId);

  console.log("[apply] Step 5/8: mark left students (status=left, no deletes)");
  await applyLeftStudents(client, opts);

  console.log("[apply] Step 6/8: stage Payments_Current + FeeLines_Current into private staging");
  await stagePaymentsAndFeeLines(client, opts);

  console.log("[apply] Step 7/8: trigger dues sync for affected active students");
  await triggerDuesSync(client);

  console.log("[apply] Step 8/8: close import batch and write apply report");
  await closeImportBatch(client, batchId, "completed");

  console.log("[apply] Done. Review staged payments via the manual payment-posting workflow.");
}

async function renameTestSessions(client) {
  for (const oldLabel of TEST_SESSION_ALIASES_TO_RENAME) {
    const existing = await client
      .from("academic_sessions")
      .select("session_label")
      .eq("session_label", oldLabel)
      .maybeSingle();
    if (existing.error) throw new Error(`Probe ${oldLabel}: ${existing.error.message}`);
    if (!existing.data) continue;

    // If TEST already exists, just deactivate the alias (don't break PKs).
    const finalExisting = await client
      .from("academic_sessions")
      .select("session_label")
      .eq("session_label", TEST_SESSION_FINAL_LABEL)
      .maybeSingle();
    if (finalExisting.data) {
      console.log(`[apply] '${TEST_SESSION_FINAL_LABEL}' already exists; not renaming '${oldLabel}'. Manual reconciliation may be needed.`);
      continue;
    }
    const update = await client
      .from("academic_sessions")
      .update({ session_label: TEST_SESSION_FINAL_LABEL, is_current: false, status: "active" })
      .eq("session_label", oldLabel);
    if (update.error) throw new Error(`Rename ${oldLabel}: ${update.error.message}`);
    // Also retag classes/students rows that referenced the old label.
    const classUpdate = await client
      .from("classes")
      .update({ session_label: TEST_SESSION_FINAL_LABEL })
      .eq("session_label", oldLabel);
    if (classUpdate.error) {
      console.warn(`[apply] classes rename ${oldLabel}: ${classUpdate.error.message}`);
    }
    console.log(`[apply] renamed session '${oldLabel}' -> '${TEST_SESSION_FINAL_LABEL}'`);
  }
}

async function verifyProductionSession(client) {
  const row = await client
    .from("academic_sessions")
    .select("session_label,status,is_current")
    .eq("session_label", PRODUCTION_SESSION_LABEL)
    .maybeSingle();
  if (row.error) throw new Error(`Verify session: ${row.error.message}`);
  if (!row.data) throw new Error(`Production session ${PRODUCTION_SESSION_LABEL} not found.`);
  if (!row.data.is_current || row.data.status !== "active") {
    throw new Error(`Production session ${PRODUCTION_SESSION_LABEL} must be active+current. Got ${JSON.stringify(row.data)}`);
  }
}

async function openImportBatch(client, opts) {
  const insert = await client
    .from("import_batches")
    .insert({
      import_mode: "update",
      target_session_label: PRODUCTION_SESSION_LABEL,
      filename: IMPORT_BATCH_FILENAME,
      source_format: "xlsx",
      worksheet_name: "Supabase_Students_Active",
      status: "importing",
      detected_headers: ["source_student_uid", "sr_no", "class_name", "student_name"],
    })
    .select("id")
    .single();
  if (insert.error) throw new Error(`openImportBatch: ${insert.error.message}`);
  return insert.data.id;
}

async function closeImportBatch(client, batchId, status) {
  const update = await client
    .from("import_batches")
    .update({ status })
    .eq("id", batchId);
  if (update.error) throw new Error(`closeImportBatch: ${update.error.message}`);
}

async function applyStudentUpserts(_client, _opts, _batchId) {
  // NOTE: Concrete student upsert is implemented as a per-row idempotent
  // operation that:
  //   1. Resolves admission_no:
  //        - existing mapping in private.vpps_student_source_mapping
  //        - else existing students.admission_no
  //        - else workbook sr_no
  //        - else generated `VPPS-${sourceStudentUid}` placeholder
  //   2. Upserts public.students on admission_no
  //   3. Writes/updates private.vpps_student_source_mapping
  //   4. Records an import_rows row with batch_id + sheet + sheetRow
  //   5. Preserves DOB/parent names if existing values differ; flags conflict
  //      to the import_rows.anomaly_categories array.
  //
  // We deliberately keep the destructive side of this short of a fully-
  // unattended sweep so that --apply is reviewed once before going live in
  // a follow-up turn. The dry-run report contains the exact per-row plan;
  // re-run with --verify-only after apply to confirm parity.
  throw new Error("applyStudentUpserts: scaffolded but not enabled in this commit. Re-run after explicit approval in follow-up turn.");
}

async function applyLeftStudents(_client, _opts) {
  // For each Left_Students row, find student by source_student_uid via
  // private.vpps_student_source_mapping. If found and status != 'left',
  // update status='left' and append a note. Never delete.
  throw new Error("applyLeftStudents: scaffolded but not enabled in this commit.");
}

async function stagePaymentsAndFeeLines(_client, _opts) {
  // Insert payment + fee-line intents into private.vpps_direct_import_stage_dues
  // keyed by (import_name, source_key). This produces no public.payments or
  // public.receipts writes; manual posting via Payment Desk after review.
  throw new Error("stagePaymentsAndFeeLines: scaffolded but not enabled in this commit.");
}

async function triggerDuesSync(_client) {
  // Calls public.generate_missing_session_dues / equivalent helper for
  // PRODUCTION_SESSION_LABEL. Safe per lib/system-sync/financial-sync.ts
  // contract: does not wipe paid allocations.
  throw new Error("triggerDuesSync: scaffolded but not enabled in this commit.");
}

// -----------------------------------------------------------------------------
// Verify mode
// -----------------------------------------------------------------------------

async function runVerifyOnly(opts) {
  const cfg = getSupabaseConfig();
  if (!cfg.serviceKey) {
    throw new Error(`Verify requires SUPABASE_SERVICE_ROLE_KEY. Missing: ${cfg.missing.join(", ")}`);
  }
  const client = await createSupabaseAdmin(cfg);

  const sessions = await client.from("academic_sessions").select("session_label,status,is_current");
  if (sessions.error) throw new Error(sessions.error.message);
  const prod = sessions.data.find((s) => s.session_label === PRODUCTION_SESSION_LABEL);
  const test = sessions.data.find((s) => s.session_label === TEST_SESSION_FINAL_LABEL);

  const studentByClass = await client.rpc("workbook_class_summary").maybeSingle();
  const studentCount = await client.from("students").select("id", { count: "exact", head: true });
  const leftCount = await client.from("students").select("id", { count: "exact", head: true }).eq("status", "left");
  const receiptCount = await client.from("receipts").select("id", { count: "exact", head: true });
  const paymentCount = await client.from("payments").select("id", { count: "exact", head: true });

  const report = {
    generatedAt: new Date().toISOString(),
    productionSessionPresent: Boolean(prod && prod.is_current && prod.status === "active"),
    productionSession: prod,
    testSessionPresent: Boolean(test),
    testSession: test,
    counts: {
      students: studentCount.count ?? null,
      leftStudents: leftCount.count ?? null,
      receipts: receiptCount.count ?? null,
      payments: paymentCount.count ?? null,
    },
    workbookClassSummary: studentByClass.error ? studentByClass.error.message : studentByClass.data,
  };

  const outDir = path.resolve(opts.reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "verify-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve(".env"));
  const opts = parseArgs(process.argv.slice(2));

  switch (opts.mode) {
    case "dry-run":
      await runDryRun(opts);
      break;
    case "backup":
      await runBackup(opts);
      break;
    case "apply":
      await runApply(opts);
      break;
    case "verify-only":
      await runVerifyOnly(opts);
      break;
    default:
      throw new Error(`Unsupported mode: ${opts.mode}`);
  }
}

// Exports for tests (pure helpers only — never invoke I/O)
export {
  EXPECTED_COUNTS,
  CLASS_ORDER,
  PRODUCTION_SESSION_LABEL,
  TEST_SESSION_FINAL_LABEL,
  TEST_SESSION_ALIASES_TO_RENAME,
  normalizeClass,
  normalizeName,
  normalizePhone,
  normalizeTransportRoute,
  normalizePaymentMode,
  normalizeStudentStatus,
  parseDate,
  asInteger,
  studentSourceKey,
  paymentSourceKey,
  feeLineSourceKey,
  validateWorkbookCounts,
};

const isDirectInvocation = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return path.resolve(entry).replace(/\\/g, "/").endsWith("scripts/vpps-import-latest-2026-05-15.mjs");
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch((error) => {
    console.error("\n[vpps-import] FAILED:", error.message);
    if (process.env.VPPS_DEBUG) console.error(error.stack);
    process.exit(1);
  });
}
