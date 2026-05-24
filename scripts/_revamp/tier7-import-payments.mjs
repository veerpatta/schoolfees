#!/usr/bin/env node
/**
 * Tier 7 — Bulk import 136 paid transactions from Custom_Report_2026-05-23_214406.xlsx
 * into live 2026-27.
 *
 * Strategy:
 *   - Manual alias map for owner-confirmed name resolutions
 *   - Match each Custom_Report row to a live student by (class, normalized name)
 *   - Fall back to fuzzy match within class
 *   - Greedy allocate amount across installments Inst 1 -> 2 -> 3 -> 4
 *   - Insert one receipt per CR row (preserve VPS00-... invoice number)
 *   - One payment row per installment touched
 */
import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const paidRows = JSON.parse(fs.readFileSync("scripts/_revamp/out/custom-report-paid.json", "utf8"));
console.log(`[tier7] ${paidRows.length} paid rows from Custom_Report`);

const MODE = {
  "Offline via Cash": "cash",
  "Offline via UPI Transfer": "upi",
  "Offline via Bank Transfer": "bank_transfer",
  "Offline via Cheque": "cheque",
  "CoFee": "upi",
};

const MANUAL_ALIASES = {
  "KANISHK PRATAP SINGH PANWAR|SKG": "2429",
};

function normName(s) { return (s || "").toUpperCase().replace(/[^A-Z]+/g, ""); }
function nameTokens(s) { return (s || "").toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 2); }

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1]===b[j-1]?0:1));
  }
  return dp[m][n];
}

function fuzzyScore(aTokens, bTokens) {
  let score = 0;
  for (const at of aTokens) {
    for (const bt of bTokens) {
      const d = lev(at, bt);
      if (d === 0) { score += 1.0; break; }
      if (d === 1 && at.length >= 4) { score += 0.8; break; }
      if (d === 2 && at.length >= 6) { score += 0.5; break; }
      if (at.length >= 5 && bt.startsWith(at)) { score += 0.7; break; }
      if (bt.length >= 5 && at.startsWith(bt)) { score += 0.7; break; }
    }
  }
  if (aTokens[0] && bTokens[0] && (lev(aTokens[0], bTokens[0]) <= 1 || aTokens[0].startsWith(bTokens[0]) || bTokens[0].startsWith(aTokens[0]))) score += 0.5;
  return score / Math.max(aTokens.length, bTokens.length);
}

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s).trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

console.log("[tier7] loading live 2026-27 students + installments...");
const { data: classes } = await sb.from("classes").select("id,class_name").eq("session_label", "2026-27");
const classNameById = new Map(classes.map((c) => [c.id, c.class_name]));

const liveStudents = [];
let off = 0;
while (true) {
  const { data } = await sb.from("students").select("id,full_name,admission_no,class_id").range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const s of data) if (classNameById.has(s.class_id)) liveStudents.push(s);
  if (data.length < 1000) break; off += 1000;
}
console.log(`[tier7] ${liveStudents.length} live 2026-27 students loaded`);

const byClassName = new Map();
const byClass = new Map();
for (const s of liveStudents) {
  const cName = classNameById.get(s.class_id);
  const key = `${cName}||${normName(s.full_name)}`;
  if (!byClassName.has(key)) byClassName.set(key, []);
  byClassName.get(key).push(s);
  if (!byClass.has(cName)) byClass.set(cName, []);
  byClass.get(cName).push(s);
}
const byAdm = new Map(liveStudents.map((s) => [s.admission_no, s]));

function fuzzyMatch(name, cls) {
  const aTokens = nameTokens(name);
  const pool = cls ? (byClass.get(cls) || []) : liveStudents;
  let best = null, bestScore = 0;
  for (const s of pool) {
    const bTokens = nameTokens(s.full_name);
    const score = fuzzyScore(aTokens, bTokens);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.6 ? { match: best, score: bestScore } : null;
}

console.log("[tier7] loading installments for all live students...");
const installmentsByStudent = new Map();
off = 0;
while (true) {
  const { data } = await sb.from("installments").select("id,student_id,installment_no,base_amount,transport_amount,amount_due,status").range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const i of data) {
    if (!installmentsByStudent.has(i.student_id)) installmentsByStudent.set(i.student_id, []);
    installmentsByStudent.get(i.student_id).push(i);
  }
  if (data.length < 1000) break; off += 1000;
}
for (const arr of installmentsByStudent.values()) arr.sort((a, b) => a.installment_no - b.installment_no);

const matched = [];
const unmatched = [];
const ambiguous = [];

for (const p of paidRows) {
  const cls = p.derived_class;
  const aliasKey = `${(p.name || "").toUpperCase()}|${cls || ""}`;
  if (MANUAL_ALIASES[aliasKey] && byAdm.has(MANUAL_ALIASES[aliasKey])) {
    matched.push({ row: p, student: byAdm.get(MANUAL_ALIASES[aliasKey]), alias: true });
    continue;
  }
  let match = null;
  let m_score = null;
  const candidates = cls ? (byClassName.get(`${cls}||${normName(p.name)}`) || []) : [];
  if (candidates.length === 1) match = candidates[0];
  else if (candidates.length > 1) {
    const adv = String(p.admission_no || "");
    const adm = candidates.find((s) => s.admission_no === adv);
    if (adm) match = adm;
    else { ambiguous.push({ ...p, candidate_admission_nos: candidates.map((c) => c.admission_no) }); continue; }
  } else {
    if (p.admission_no && byAdm.has(String(p.admission_no))) {
      match = byAdm.get(String(p.admission_no));
    } else {
      const fz = fuzzyMatch(p.name, cls);
      if (fz) { match = fz.match; m_score = fz.score; }
      else {
        const fzAll = fuzzyMatch(p.name, null);
        if (fzAll && fzAll.score >= 0.7) { match = fzAll.match; m_score = fzAll.score; }
      }
      if (!match) { unmatched.push(p); continue; }
    }
  }
  matched.push({ row: p, student: match, fuzzy_score: m_score });
}

console.log(`[tier7] matched: ${matched.length}`);
console.log(`[tier7] ambiguous: ${ambiguous.length}`);
console.log(`[tier7] unmatched: ${unmatched.length}`);
fs.writeFileSync("scripts/_revamp/out/tier7-unmatched.json", JSON.stringify({ unmatched, ambiguous }, null, 2));

if (process.argv.includes("--dry-run")) {
  console.log("[tier7] dry-run — no DB writes");
  process.exit(0);
}

console.log("[tier7] (assumes append-only triggers are disabled by caller)");

let receiptCount = 0, paymentCount = 0, failures = 0;
const log = [];
for (const m of matched) {
  const { row: p, student } = m;
  const insts = installmentsByStudent.get(student.id) || [];
  const amt = Math.round(Number(p.amount_paid));  // Round fractional rupees
  const paymentDate = parseDate(p.paid_on);
  const mode = MODE[p.paid_via] || "cash";
  const receiptNumber = p.invoice_id || `IMPRT-${p.transaction_id}`;
  const { data: rec, error: recErr } = await sb.from("receipts").insert({
    receipt_number: receiptNumber, student_id: student.id, payment_date: paymentDate,
    payment_mode: mode, total_amount: amt, reference_number: p.transaction_id,
    notes: `Tier-7 import: ${p.group_name} | ${p.notes || ""}`.slice(0, 500),
    received_by: "tier7-import",
  }).select("id").single();
  if (recErr) { console.error(`receipt fail ${p.name}:`, recErr.message); failures++; continue; }
  receiptCount++;
  let remaining = amt;
  for (const inst of insts) {
    if (remaining <= 0) break;
    const allocate = Math.min(remaining, inst.amount_due);
    if (allocate <= 0) continue;
    const { error: payErr } = await sb.from("payments").insert({
      receipt_id: rec.id, student_id: student.id, installment_id: inst.id, amount: allocate,
    });
    if (payErr) { console.error(`payment fail ${p.name} I${inst.installment_no}:`, payErr.message); break; }
    paymentCount++;
    remaining -= allocate;
  }
  log.push({ name: student.full_name, adm: student.admission_no, paid: amt, leftover: remaining });
  if (receiptCount % 25 === 0) process.stdout.write(`  ${receiptCount} receipts / ${paymentCount} payments\r`);
}
console.log("");
console.log(`[tier7] DONE. receipts=${receiptCount} payments=${paymentCount} fails=${failures}`);
const leftSum = log.reduce((s, l) => s + l.leftover, 0);
const overpaid = log.filter((l) => l.leftover > 0);
console.log(`[tier7] overpayments: ${overpaid.length} students, total leftover = Rs ${leftSum}`);
fs.writeFileSync("scripts/_revamp/out/tier7-allocation-log.json", JSON.stringify(log, null, 2));
