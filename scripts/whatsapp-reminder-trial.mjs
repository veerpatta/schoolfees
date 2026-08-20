/**
 * WhatsApp fee-reminder trial — AiSensy Campaign API.
 *
 * Self-contained trial harness. It does not touch the app or write to any
 * table. It reads `v_workbook_student_financials` (read-only), works out who
 * is overdue and has paid almost nothing, and can send them a WhatsApp
 * template message through an AiSensy API Campaign.
 *
 * The list is recomputed from live data on every run, so a parent who paid
 * yesterday is simply absent today. That is the whole "automatically remove
 * the parents who are paying" mechanism — no list to maintain, no tag to undo.
 *
 * WHO GETS A MESSAGE
 *   total_paid <= 1100  (the academic-fee-only families: 0, 500 or 1100 paid)
 *   AND installment 1 + installment 2 still carry fees
 *   AND scope 'collectable' (on roll, or has paid something)
 *   AND a usable mobile number (father's, falling back to mother's)
 *   MINUS anyone listed in the exclude file
 *   MINUS RTE students, unless --include-rte
 *
 * HOW MUCH IT SAYS THEY OWE  (--amount)
 *   inst12   (default) installment 1 + installment 2 of THIS year only.
 *            Matches the figures in the office's 25-Aug CSV.
 *   overdue  every overdue base charge, INCLUDING last year's carry-forward
 *            balance. Larger, and for some families much larger:
 *            adm 2241 reads 14,750 as inst12 and 34,750 as overdue,
 *            the difference being a 20,000 carry-forward from 2025-26.
 *
 * USAGE
 *   node scripts/whatsapp-reminder-trial.mjs                       # dry run, writes a CSV
 *   node scripts/whatsapp-reminder-trial.mjs --test-to 9XXXXXXXXX --markers
 *   node scripts/whatsapp-reminder-trial.mjs --send --live --limit 5
 *   node scripts/whatsapp-reminder-trial.mjs --send --live
 *
 * ENV (.env.local)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (already present)
 *   AISENSY_API_KEY=<AiSensy -> Manage -> API Key>
 *   AISENSY_CAMPAIGN=Fees Collection August
 *
 * SAFETY
 *   - Read-only against Postgres. No writes, no RPCs.
 *   - `--send` refuses to run without `--live`.
 *   - Every send is appended to data/whatsapp-trial/sent-log.jsonl. A student
 *     already messaged today is skipped, so running the command twice in one
 *     day does not double-message a parent.
 *   - Throttled (default 400ms) so a burst never trips AiSensy or Meta.
 */

import { existsSync, readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------- env loading

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const SESSION = value("session", "2026-27");
const CAMPAIGN = value("campaign", process.env.AISENSY_CAMPAIGN || "Fees Collection August");
const API_KEY = process.env.AISENSY_API_KEY?.trim();
const LIMIT = value("limit") ? Number(value("limit")) : null;
const DELAY_MS = Number(value("delay-ms", "400"));
const MAX_TOTAL_PAID = Number(value("max-total-paid", "1100"));
const AMOUNT_MODE = value("amount", "inst12"); // inst12 | overdue
const EXCLUDE_FILE = value("exclude-file", "data/whatsapp-trial/exclude.txt");
const INCLUDE_RTE = flag("include-rte");
const TAG = value("tag", null);
const TEST_TO = value("test-to");
const MARKERS = flag("markers");
const SEND = flag("send");
const LIVE = flag("live");
const ONE_PER_PHONE = flag("one-per-phone");

if (!["inst12", "overdue"].includes(AMOUNT_MODE)) {
  console.error(`--amount must be inst12 or overdue, got "${AMOUNT_MODE}"`);
  process.exit(1);
}

const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
/** Hardcoded inside the approved template body. Sending past this date is a lie. */
const TEMPLATE_DEADLINE = "2026-08-25";
const OUT_DIR = "data/whatsapp-trial";
const LOG_PATH = `${OUT_DIR}/sent-log.jsonl`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD IST

// ------------------------------------------------------------------ formatting

/**
 * @allow-raw-money-format  Standalone operational script, not app source. The
 * approved AiSensy template already carries the rupee sign, so the helper in
 * lib/helpers/currency.ts (which emits "₹9,100") would double it.
 */
const groupInr = (rupees) => new Intl.NumberFormat("en-IN").format(rupees);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDueDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
};

/** AiSensy wants a country code. 10 local digits => +91XXXXXXXXXX. */
function normalisePhone(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return normalisePhone(digits.slice(1));
  return null; // not a number we are willing to burn a paid message on
}

const titleCase = (name) =>
  String(name ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

// ------------------------------------------------------------------ the query

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const SELECT = [
  "student_id", "admission_no", "student_name", "father_name",
  "father_phone", "mother_phone", "class_label", "sort_order", "record_status",
  "total_paid", "inst1_pending", "inst2_pending", "overdue_base_amount",
  "late_fee_outstanding_amount", "outstanding_amount",
].join(",");

async function fetchRows() {
  const url =
    `${SUPABASE_URL}/rest/v1/v_workbook_student_financials` +
    `?select=${encodeURIComponent(SELECT)}` +
    `&session_label=eq.${encodeURIComponent(SESSION)}` +
    `&order=sort_order.asc,student_name.asc`;

  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Admission numbers to skip, one per line (or first CSV column). '#' comments. */
function loadExclusions() {
  if (!existsSync(EXCLUDE_FILE)) return new Set();
  return new Set(
    readFileSync(EXCLUDE_FILE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.split(",")[0].trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

function selectRecipients(rows, excluded) {
  const skipped = { paidMore: 0, notOverdue: 0, notCollectable: 0, noPhone: 0, badPhone: 0, rte: 0, excluded: 0, zeroAmount: 0 };
  const noPhoneNames = [];
  const rteNames = [];
  const out = [];

  for (const row of rows) {
    const totalPaid = Number(row.total_paid ?? 0);
    if (totalPaid > MAX_TOTAL_PAID) { skipped.paidMore += 1; continue; }

    const inst12 = Number(row.inst1_pending ?? 0) + Number(row.inst2_pending ?? 0);
    if (inst12 <= 0) { skipped.notOverdue += 1; continue; }

    // 'collectable': on the roll, or gone but still owing what they paid against.
    if (!(row.record_status === "active" || totalPaid > 0)) { skipped.notCollectable += 1; continue; }

    const admission = String(row.admission_no ?? "");
    if (excluded.has(admission)) { skipped.excluded += 1; continue; }

    if (!INCLUDE_RTE && /RTE/i.test(admission)) {
      skipped.rte += 1;
      rteNames.push(`${admission} ${titleCase(row.student_name)}`);
      continue;
    }

    // Father first, mother as fallback — 22 families have no father's number on file.
    const phone = normalisePhone(row.father_phone) ?? normalisePhone(row.mother_phone);
    if (!phone) {
      if (!row.father_phone && !row.mother_phone) { skipped.noPhone += 1; noPhoneNames.push(`${admission} ${titleCase(row.student_name)}`); }
      else skipped.badPhone += 1;
      continue;
    }

    const dueAmount = AMOUNT_MODE === "overdue" ? Number(row.overdue_base_amount ?? 0) : inst12;
    if (dueAmount <= 0) { skipped.zeroAmount += 1; continue; }

    out.push({
      studentId: row.student_id,
      admissionNo: admission,
      phone,
      usedMotherPhone: !normalisePhone(row.father_phone),
      parentName: titleCase(row.father_name) || "Parent",
      studentName: titleCase(row.student_name),
      studentClass: row.class_label,
      dueAmount,
      inst12,
      overdueAll: Number(row.overdue_base_amount ?? 0),
      totalPaid,
    });
  }

  return { recipients: out, skipped, noPhoneNames, rteNames };
}

// ------------------------------------------------------------------ payload

const DUE_DATE = value("due-date", TODAY);

/**
 * The order of the variables inside the approved "Fees Collection August"
 * template. Confirmed on 2026-08-20 by sending a marker message (P1..P4) and
 * reading what arrived:
 *
 *   प्रिय P1,                          -> P1 = parent name
 *   ... P2 (P3) की सत्र 2026-27 ...    -> P2 = student name, P3 = class
 *   देय राशि: रु. P4                   -> P4 = amount, plain grouped digits
 *                                          ("9,100"); the template supplies "रु."
 *
 * The due date is NOT a variable. The body hardcodes "25 अगस्त 2026" and the
 * ₹1,000-per-installment late fee warning that follows it. From 26 August this
 * template is factually stale and must not go out again until it is replaced.
 * --due-date therefore affects only the CSV written for review, never the
 * message text.
 */
const PARAM_ORDER = value("param-order", "parentName,studentName,studentClass,dueAmount")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);

function paramValue(token, r) {
  switch (token) {
    case "parentName": return r.parentName;
    case "studentName": return r.studentName;
    case "studentClass": return r.studentClass;
    case "dueAmount": return groupInr(r.dueAmount);
    case "dueDate": return formatDueDate(DUE_DATE);
    default: throw new Error(`Unknown --param-order token "${token}". Known: parentName, studentName, studentClass, dueAmount, dueDate.`);
  }
}

function buildPayload(r) {
  const params = MARKERS
    ? PARAM_ORDER.map((_, i) => `P${i + 1}`)
    : PARAM_ORDER.map((token) => paramValue(token, r));

  const payload = {
    apiKey: API_KEY,
    campaignName: CAMPAIGN,
    destination: r.phone,
    userName: r.parentName,
    source: "vpps-fee-app-trial",
    templateParams: params,
  };
  if (TAG) payload.tags = [TAG];
  return payload;
}

async function send(payload) {
  const res = await fetch(AISENSY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

// ------------------------------------------------------------------ send log

function readLog() {
  if (!existsSync(LOG_PATH)) return [];
  return readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function appendLog(entry) {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

// ------------------------------------------------------------------ main

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (TEST_TO) {
    if (!API_KEY) { console.error("AISENSY_API_KEY not set in .env.local"); process.exit(1); }
    const phone = normalisePhone(TEST_TO);
    if (!phone) { console.error(`--test-to "${TEST_TO}" is not a valid Indian mobile number.`); process.exit(1); }

    const payload = buildPayload({
      phone, parentName: "Test Parent", studentName: "Test Student",
      studentClass: "Class 5", dueAmount: 9100,
    });
    console.log(`Campaign : ${CAMPAIGN}`);
    console.log(`To       : ${phone}`);
    console.log(`Mode     : ${MARKERS ? "MARKERS — P1..P5 reveal the variable order" : "realistic sample"}`);
    console.log(`Payload  : ${JSON.stringify({ ...payload, apiKey: "***" }, null, 2)}`);
    const result = await send(payload);
    console.log(`\nHTTP ${result.status}\n${JSON.stringify(result.body, null, 2)}`);
    console.log(result.ok
      ? "\nAccepted. Check the phone — if nothing arrives, the campaign is not Live or the template is unapproved."
      : "\nRejected. Usual causes: campaign name mismatch, campaign not Live, wrong number of templateParams.");
    return;
  }

  console.log(`Session   : ${SESSION}${SESSION === "2026-27" ? "  (LIVE)" : ""}`);
  console.log(`Amount    : ${AMOUNT_MODE}${AMOUNT_MODE === "inst12" ? "  (installments 1+2 this year — matches the office CSV)" : "  (all overdue incl. last year's carry-forward)"}`);
  console.log(`Paid <=   : ${groupInr(MAX_TOTAL_PAID)}`);
  console.log(`Params    : ${PARAM_ORDER.join(", ")}  (${PARAM_ORDER.length} slots)`);

  const excluded = loadExclusions();
  console.log(`Exclusions: ${excluded.size} from ${existsSync(EXCLUDE_FILE) ? EXCLUDE_FILE : "(no exclude file yet)"}`);

  const rows = await fetchRows();
  const { recipients, skipped, noPhoneNames, rteNames } = selectRecipients(rows, excluded);

  let queue = recipients;
  if (ONE_PER_PHONE) {
    const seen = new Set();
    queue = queue.filter((r) => (seen.has(r.phone) ? false : seen.add(r.phone)));
  }
  queue = [...queue].sort((a, b) => b.dueAmount - a.dueAmount);
  if (LIMIT) queue = queue.slice(0, LIMIT);

  const phoneCounts = new Map();
  for (const r of recipients) phoneCounts.set(r.phone, (phoneCounts.get(r.phone) ?? 0) + 1);
  const sharedPhones = [...phoneCounts.values()].filter((n) => n > 1).length;

  console.log(`\nStudents in session          : ${rows.length}`);
  console.log(`  paid more than the cutoff  : ${skipped.paidMore}`);
  console.log(`  nothing pending on inst 1+2: ${skipped.notOverdue}`);
  console.log(`  left and never paid        : ${skipped.notCollectable}`);
  console.log(`  RTE students               : ${skipped.rte}${INCLUDE_RTE ? "" : "  (pass --include-rte to keep them)"}`);
  console.log(`  on your exclude list       : ${skipped.excluded}`);
  console.log(`  no phone number on record  : ${skipped.noPhone}`);
  console.log(`  phone unusable             : ${skipped.badPhone}`);
  console.log(`  amount worked out to zero  : ${skipped.zeroAmount}`);
  console.log(`MESSAGEABLE                  : ${recipients.length}`);
  console.log(`  of which use mother's phone: ${recipients.filter((r) => r.usedMotherPhone).length}`);
  console.log(`  numbers shared by siblings : ${sharedPhones}${ONE_PER_PHONE ? " (collapsed)" : " (one message per child — --one-per-phone to collapse)"}`);
  console.log(`QUEUED THIS RUN              : ${queue.length}`);
  console.log(`Fees behind this queue       : ${groupInr(queue.reduce((s, r) => s + r.dueAmount, 0))}`);

  if (noPhoneNames.length) {
    console.log(`\nNo phone on record — these families can never be reached by WhatsApp:`);
    for (const n of noPhoneNames) console.log(`  ${n}`);
  }
  if (rteNames.length) {
    console.log(`\nRTE students held back:`);
    for (const n of rteNames) console.log(`  ${n}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csvPath = `${OUT_DIR}/recipients-${TODAY}.csv`;
  writeFileSync(csvPath, [
    "phone number,parentName,studentName,studentClass,dueAmount,dueDate,tags",
    ...queue.map((r) => [
      r.phone.replace("+91", ""), r.parentName, r.studentName, r.studentClass,
      groupInr(r.dueAmount), formatDueDate(DUE_DATE), TAG ?? "",
    ].map(esc).join(",")),
  ].join("\n"), "utf8");

  // Audit file: both amounts side by side, so the inst12-vs-overdue choice is visible.
  const auditPath = `${OUT_DIR}/audit-${TODAY}.csv`;
  writeFileSync(auditPath, [
    "admissionNo,studentName,class,phone,usedMotherPhone,totalPaid,inst1plus2,allOverdue,sending",
    ...queue.map((r) => [
      r.admissionNo, r.studentName, r.studentClass, r.phone, r.usedMotherPhone,
      r.totalPaid, r.inst12, r.overdueAll, r.dueAmount,
    ].map(esc).join(",")),
  ].join("\n"), "utf8");

  console.log(`\nWrote ${csvPath}`);
  console.log(`Wrote ${auditPath}  <- check inst1plus2 vs allOverdue before sending`);

  if (!SEND) {
    console.log("\nDry run — nothing sent. Payload for the top row:");
    if (queue[0]) console.log(JSON.stringify({ ...buildPayload(queue[0]), apiKey: "***" }, null, 2));
    console.log("\nAdd --send --live to actually send.");
    return;
  }

  if (!LIVE) { console.error("\n--send needs --live as well. Nothing sent."); process.exit(1); }

  // The approved template hardcodes "25 अगस्त 2026" as the deadline and warns
  // about a late fee "after that". Sending it on the 26th tells 200 families to
  // beat a deadline that has already gone. Fail closed; --ignore-stale-template
  // is there for the case where the template body has actually been updated.
  if (TODAY > TEMPLATE_DEADLINE && !flag("ignore-stale-template")) {
    console.error(`\nRefusing to send: the template body hardcodes ${TEMPLATE_DEADLINE} as the deadline and today is ${TODAY}.`);
    console.error("Get a replacement template approved, then pass --ignore-stale-template (or edit TEMPLATE_DEADLINE).");
    process.exit(1);
  }
  if (!API_KEY) { console.error("AISENSY_API_KEY not set in .env.local"); process.exit(1); }

  const alreadyToday = new Set(
    readLog().filter((e) => e.date === TODAY && e.ok).map((e) => `${e.phone}|${e.studentId}`),
  );

  let sent = 0, skippedToday = 0, failed = 0;
  for (const r of queue) {
    if (alreadyToday.has(`${r.phone}|${r.studentId}`)) { skippedToday += 1; continue; }

    const result = await send(buildPayload(r));
    appendLog({
      date: TODAY, at: new Date().toISOString(), studentId: r.studentId,
      admissionNo: r.admissionNo, studentName: r.studentName, phone: r.phone,
      dueAmount: r.dueAmount, amountMode: AMOUNT_MODE, campaign: CAMPAIGN,
      ok: result.ok, status: result.status, response: result.body,
    });

    if (result.ok) { sent += 1; process.stdout.write("."); }
    else { failed += 1; console.log(`\n  FAIL ${r.admissionNo} ${r.studentName} ${r.phone}: ${result.status} ${JSON.stringify(result.body)}`); }

    await sleep(DELAY_MS);
  }

  console.log(`\n\nSent ${sent}, failed ${failed}, skipped ${skippedToday} (already messaged today).`);
  console.log(`Log: ${LOG_PATH}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
