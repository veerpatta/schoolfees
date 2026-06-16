// Previous-Year Dues Carry-Forward — READ-ONLY dry run.
//
// Reads an owner-confirmed `Confirm Dues Match` spreadsheet, matches each row
// against live students, and prints the matched / unmatched / ambiguous /
// write-off breakdown + confirmed & matched subtotals. Writes NOTHING to the
// database. The parse + match logic lives in scripts/prev-year-dues-core.mjs,
// which is locked to the canonical TS lib (lib/prev-year-dues/*) by
// tests/unit/prev-year-dues-port-parity.test.ts.
//
// Usage:
//   node scripts/prev-year-dues-dry-run.mjs "<path-to.xlsx>" [sessionLabel] [sheetName]
// Defaults: sessionLabel=2026-27, sheetName="Confirm Dues Match"

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

import { parseRows, planRows } from "./prev-year-dues-core.mjs";

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
  if (!sheet) {
    console.error("No usable sheet.");
    process.exit(1);
  }
  const records = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const parsed = parseRows(records);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Read-only: students in the target session + active fee settings + existing
  // carry-forwards. Prefer the first-class balance table; fall back to the
  // legacy installment marker for databases that have not run the newer
  // migration yet.
  const { data: studentsRaw, error: sErr } = await supabase
    .from("students")
    .select("id, admission_no, full_name, father_name, primary_phone, class_id, classes!inner(session_label, status)")
    .eq("status", "active")
    .eq("classes.session_label", sessionLabel);
  if (sErr) {
    console.error("students query failed:", sErr.message);
    process.exit(1);
  }

  const { data: feeSettings, error: fErr } = await supabase
    .from("fee_settings")
    .select("id, class_id")
    .eq("is_active", true);
  if (fErr) {
    console.error("fee_settings query failed:", fErr.message);
    process.exit(1);
  }
  const feeByClass = new Map((feeSettings ?? []).map((f) => [f.class_id, f.id]));

  let existingCf = [];
  const carryForwardBalanceResult = await supabase
    .from("student_carry_forward_balances")
    .select("student_id")
    .eq("target_session_label", sessionLabel)
    .neq("status", "cancelled");
  if (!carryForwardBalanceResult.error) {
    existingCf = carryForwardBalanceResult.data ?? [];
  } else if (["42P01", "42703"].includes(carryForwardBalanceResult.error.code)) {
    const { data, error: cErr } = await supabase
      .from("installments")
      .select("student_id")
      .eq("is_carry_forward", true);
    if (cErr) {
      console.error("installments query failed:", cErr.message);
      process.exit(1);
    }
    existingCf = data ?? [];
  } else {
    console.error("carry-forward balance query failed:", carryForwardBalanceResult.error.message);
    process.exit(1);
  }
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
  const inr = (n) => n.toLocaleString("en-IN");

  console.log(`\n# Previous-Year Dues — DRY RUN (read-only)`);
  console.log(`File: ${filePath}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Sheet: ${sheetName}  | Session: ${sessionLabel}  | Active students: ${students.length}`);
  console.log(`\n## Owner decisions`);
  console.log(`- Total rows:        ${parsed.length}`);
  console.log(`- CONFIRM (Y):       ${confirmed.length}   subtotal ₹${inr(confirmed.reduce((a, r) => a + (r.prevYearDue ?? 0), 0))}`);
  console.log(`- WRITE-OFF:         ${parsed.filter((r) => r.ownerDecision === "write_off").length}`);
  console.log(`- N (reject):        ${parsed.filter((r) => r.ownerDecision === "reject").length}`);
  console.log(`- blank (pending):   ${parsed.filter((r) => r.ownerDecision === "pending").length}`);
  console.log(`\n## Match outcome (confirmed rows)`);
  console.log(`- MATCHED:           ${count("matched")}   subtotal ₹${inr(sum((p) => p.status === "matched"))}`);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
