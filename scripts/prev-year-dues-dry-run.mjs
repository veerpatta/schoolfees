// Previous-Year Dues Carry-Forward — READ-ONLY dry run.
//
// Reads an owner-confirmed `Confirm Dues Match` spreadsheet, matches each row
// against live students, and prints the matched / unmatched / ambiguous /
// write-off breakdown + confirmed & matched subtotals. Writes NOTHING to the
// database. The matching logic mirrors lib/prev-year-dues/* (locked by
// tests/unit/prev-year-dues.test.ts); the Admin Tools apply path is the
// canonical runtime and uses that TS lib directly.
//
// Usage:
//   node scripts/prev-year-dues-dry-run.mjs "<path-to.xlsx>" [sessionLabel] [sheetName]
// Defaults: sessionLabel=2026-27, sheetName="Confirm Dues Match"

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

// ----- env loading (matches scripts/verify-live-fee-health.mjs) -------------
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!k || process.env[k]) continue;
    process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const PREV_LABEL = "Previous year tuition balance (2025-26)";

// ----- pure logic (faithful port of lib/prev-year-dues) ---------------------
const normName = (v) => (v ?? "").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const normPhone = (v) => {
  const d = (v ?? "").toString().replace(/\D+/g, "");
  return d ? d.slice(-10) : "";
};
const normAdm = (v) => (v ?? "").toString().trim().toUpperCase();
const parseRupees = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  const c = v.replace(/[₹,\s]/g, "").trim();
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
function interpretConfirm(v) {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "") return "pending";
  if (["Y", "YES", "CONFIRM", "CONFIRMED"].includes(t)) return "confirm";
  const c = t.replace(/[^A-Z]/g, "");
  if (["WRITEOFF", "WAIVE", "WAIVED"].includes(c)) return "write_off";
  if (t === "N" || t === "NO") return "reject";
  return "pending";
}
const matchers = {
  oldAdmissionNo: (h) => h.includes("old") && h.includes("adm"),
  oldName: (h) => h.includes("name") && (h.includes("last year") || h.includes("export")),
  prevYearDue: (h) => h.includes("prev") && h.includes("due"),
  suggestedAppAdmissionNo: (h) => h.includes("suggested") && h.includes("adm"),
  appStudentName: (h) => h.includes("app") && h.includes("student") && h.includes("name"),
  appPhone: (h) => h.includes("app") && h.includes("phone"),
  confirm: (h) => h.includes("confirm"),
  correctedAppAdmissionNo: (h) => h.includes("correct") && h.includes("adm"),
};
function resolveColumns(headers) {
  const hits = {};
  for (const header of headers) {
    const n = header.trim().toLowerCase().replace(/\s+/g, " ");
    for (const key of Object.keys(matchers)) {
      if (!hits[key] && matchers[key](n)) hits[key] = header;
    }
  }
  return hits;
}
const txt = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
function parseRows(records) {
  if (!records.length) return [];
  const headers = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const cols = resolveColumns(headers);
  const get = (r, c) => (c ? (r[c] ?? null) : null);
  return records.map((r, idx) => {
    const ownerDecision = interpretConfirm(get(r, cols.confirm));
    const prevYearDue = parseRupees(get(r, cols.prevYearDue));
    const corrected = txt(get(r, cols.correctedAppAdmissionNo));
    const suggested = txt(get(r, cols.suggestedAppAdmissionNo));
    let parseError = null;
    if (ownerDecision === "confirm") {
      if (prevYearDue === null) parseError = "Confirmed row has no readable Prev-Year Due amount.";
      else if (prevYearDue <= 0) parseError = "Confirmed row has a non-positive amount.";
    }
    return {
      rowIndex: idx,
      ownerDecision,
      prevYearDue,
      targetAdmissionNo: corrected ?? suggested,
      appStudentName: txt(get(r, cols.appStudentName)),
      oldName: txt(get(r, cols.oldName)),
      appPhone: txt(get(r, cols.appPhone)),
      oldAdmissionNo: txt(get(r, cols.oldAdmissionNo)),
      parseError,
    };
  });
}
function planRows(rows, students) {
  const byAdm = new Map();
  const byNamePhone = new Map();
  for (const s of students) {
    const a = normAdm(s.admissionNo);
    if (a) (byAdm.get(a) ?? byAdm.set(a, []).get(a)).push(s);
    const n = normName(s.fullName);
    const p = normPhone(s.phone);
    if (n && p) {
      const k = `${n}|${p}`;
      (byNamePhone.get(k) ?? byNamePhone.set(k, []).get(k)).push(s);
    }
  }
  const claimed = new Set();
  return rows.map((row) => {
    const out = { row, status: null, matchMethod: "unmatched", matchedStudentId: null, applyAmount: null, alreadyApplied: false, skipReason: null };
    if (row.parseError) return { ...out, status: "error", skipReason: row.parseError };
    if (row.ownerDecision !== "confirm")
      return { ...out, status: "skipped", skipReason: `Owner decision: ${row.ownerDecision}` };
    let candidates = [];
    let method = "unmatched";
    const ta = normAdm(row.targetAdmissionNo);
    if (ta && byAdm.has(ta)) { candidates = byAdm.get(ta); method = "admission_no"; }
    if (!candidates.length) {
      const n = normName(row.appStudentName ?? row.oldName);
      const p = normPhone(row.appPhone);
      if (n && p && byNamePhone.has(`${n}|${p}`)) { candidates = byNamePhone.get(`${n}|${p}`); method = "name_phone"; }
    }
    if (!candidates.length) return { ...out, status: "unmatched", skipReason: "No matching student found." };
    if (candidates.length > 1) return { ...out, status: "ambiguous", matchMethod: "ambiguous", skipReason: `Multiple students (${candidates.length}) match.` };
    const s = candidates[0];
    out.matchMethod = method;
    out.matchedStudentId = s.studentId;
    if (claimed.has(s.studentId)) return { ...out, status: "error", skipReason: "Duplicate confirmed row for same student." };
    if (s.hasExistingCarryForward) { claimed.add(s.studentId); return { ...out, status: "matched", applyAmount: row.prevYearDue, alreadyApplied: true, skipReason: "Already has carry-forward (idempotent)." }; }
    if (!s.feeSettingId || !s.classId) return { ...out, status: "no_fee_setting", skipReason: "No active fee setting for class." };
    claimed.add(s.studentId);
    return { ...out, status: "matched", applyAmount: row.prevYearDue };
  });
}

// ----- main -----------------------------------------------------------------
async function main() {
  const filePath = process.argv[2];
  const sessionLabel = process.argv[3] || "2026-27";
  const sheetName = process.argv[4] || "Confirm Dues Match";
  if (!filePath || !existsSync(filePath)) {
    console.error(`File not found: ${filePath || "(no path given)"}`);
    console.error(`Usage: node scripts/prev-year-dues-dry-run.mjs "<path.xlsx>" [sessionLabel] [sheetName]`);
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { console.error("No usable sheet."); process.exit(1); }
  const records = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const parsed = parseRows(records);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) { console.error("Missing Supabase env vars."); process.exit(1); }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Read-only: students in the target session + active fee settings + existing carry-forwards (by label).
  const { data: studentsRaw, error: sErr } = await supabase
    .from("students")
    .select("id, admission_no, full_name, father_name, primary_phone, class_id, classes!inner(session_label, status)")
    .eq("status", "active")
    .eq("classes.session_label", sessionLabel);
  if (sErr) { console.error("students query failed:", sErr.message); process.exit(1); }

  const { data: feeSettings, error: fErr } = await supabase
    .from("fee_settings").select("id, class_id").eq("is_active", true);
  if (fErr) { console.error("fee_settings query failed:", fErr.message); process.exit(1); }
  const feeByClass = new Map((feeSettings ?? []).map((f) => [f.class_id, f.id]));

  const { data: existingCf, error: cErr } = await supabase
    .from("installments").select("student_id").eq("installment_label", PREV_LABEL);
  if (cErr) { console.error("installments query failed:", cErr.message); process.exit(1); }
  const cfStudents = new Set((existingCf ?? []).map((r) => r.student_id));

  const students = (studentsRaw ?? []).map((s) => ({
    studentId: s.id,
    admissionNo: s.admission_no,
    fullName: s.full_name,
    fatherName: s.father_name,
    phone: s.primary_phone,
    classId: s.class_id,
    feeSettingId: feeByClass.get(s.class_id) ?? null,
    hasExistingCarryForward: cfStudents.has(s.id),
  }));

  const planned = planRows(parsed, students);
  const sum = (pred) => planned.filter(pred).reduce((acc, p) => acc + (p.row.prevYearDue ?? 0), 0);
  const count = (status) => planned.filter((p) => p.status === status).length;
  const confirmed = parsed.filter((r) => r.ownerDecision === "confirm");

  console.log(`\n# Previous-Year Dues — DRY RUN (read-only)`);
  console.log(`File: ${filePath}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Sheet: ${sheetName}  | Session: ${sessionLabel}  | Active students: ${students.length}`);
  console.log(`\n## Owner decisions`);
  console.log(`- Total rows:        ${parsed.length}`);
  console.log(`- CONFIRM (Y):       ${confirmed.length}   subtotal ₹${confirmed.reduce((a, r) => a + (r.prevYearDue ?? 0), 0).toLocaleString("en-IN")}`);
  console.log(`- WRITE-OFF:         ${parsed.filter((r) => r.ownerDecision === "write_off").length}`);
  console.log(`- N (reject):        ${parsed.filter((r) => r.ownerDecision === "reject").length}`);
  console.log(`- blank (pending):   ${parsed.filter((r) => r.ownerDecision === "pending").length}`);
  console.log(`\n## Match outcome (confirmed rows)`);
  console.log(`- MATCHED:           ${count("matched")}   subtotal ₹${sum((p) => p.status === "matched").toLocaleString("en-IN")}`);
  console.log(`    (of which already-applied / idempotent: ${planned.filter((p) => p.alreadyApplied).length})`);
  console.log(`- UNMATCHED:         ${count("unmatched")}`);
  console.log(`- AMBIGUOUS:         ${count("ambiguous")}`);
  console.log(`- NO FEE SETTING:    ${count("no_fee_setting")}`);
  console.log(`- ERROR/duplicate:   ${count("error")}`);

  const showList = (label, status) => {
    const items = planned.filter((p) => p.status === status);
    if (!items.length) return;
    console.log(`\n### ${label}`);
    for (const p of items.slice(0, 50)) {
      console.log(`- row ${p.row.rowIndex + 1}: old=${p.row.oldAdmissionNo ?? "?"} target=${p.row.targetAdmissionNo ?? "?"} due=₹${p.row.prevYearDue ?? "?"} — ${p.skipReason ?? ""}`);
    }
    if (items.length > 50) console.log(`  …and ${items.length - 50} more`);
  };
  showList("Unmatched (need manual student selection)", "unmatched");
  showList("Ambiguous (multiple candidates)", "ambiguous");
  showList("Matched but no active fee setting (cannot insert)", "no_fee_setting");
  showList("Errors / duplicates", "error");

  console.log(`\nNOTE: This is a dry run. No rows were written. Apply only after the owner approves these numbers.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
