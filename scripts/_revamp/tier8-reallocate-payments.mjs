#!/usr/bin/env node
/**
 * Tier 8 — Re-allocate existing payments greedily so any shortfall lands on
 * the LAST installment (not the first).
 *
 * Why: after the academic fee was added to Installment 1 post-Tier-7, students
 * who paid the original installment amount appear ₹500/₹1100 short on Inst 1
 * while later installments look fully paid. The cleaner UX is "Inst 1-3 paid,
 * Inst 4 partial". This script preserves every receipt and every total amount,
 * but redistributes per-installment allocations greedily.
 *
 * Append-only triggers on `payments` must be DISABLED before running.
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

console.log("[tier8] loading live 2026-27 students with payments...");

// Load all receipts paginated
const receipts = [];
let off = 0;
while (true) {
  const { data, error } = await sb.from("receipts").select("id,student_id,payment_date,total_amount").order("student_id").order("payment_date").range(off, off + 999);
  if (error) { console.error("Failed to load receipts:", error.message); process.exit(2); }
  if (!data || data.length === 0) break;
  receipts.push(...data);
  if (data.length < 1000) break;
  off += 1000;
}
console.log(`[tier8] loaded ${receipts.length} receipts`);

// Restrict to live 2026-27 students
const { data: liveClassesData } = await sb.from("classes").select("id").eq("session_label", "2026-27");
const liveClassIds = new Set(liveClassesData.map((c) => c.id));
const { data: allStudents } = await sb.from("students").select("id,class_id");
const liveStudentIds = new Set(allStudents.filter((s) => liveClassIds.has(s.class_id)).map((s) => s.id));
const liveReceipts = receipts.filter((r) => liveStudentIds.has(r.student_id));
console.log(`[tier8] ${liveReceipts.length} receipts belong to live 2026-27 students`);

// Group receipts by student
const receiptsByStudent = new Map();
for (const r of liveReceipts) {
  if (!receiptsByStudent.has(r.student_id)) receiptsByStudent.set(r.student_id, []);
  receiptsByStudent.get(r.student_id).push(r);
}
console.log(`[tier8] ${receiptsByStudent.size} unique students with payments`);

// Get installments per student (paginate; .in() with 500+ ids breaks)
const allInstallments = [];
let instOff = 0;
while (true) {
  const { data, error } = await sb.from("installments").select("id,student_id,installment_no,amount_due").range(instOff, instOff + 999);
  if (error) { console.error("inst load fail:", error.message); process.exit(2); }
  if (!data || data.length === 0) break;
  for (const i of data) if (liveStudentIds.has(i.student_id)) allInstallments.push(i);
  if (data.length < 1000) break;
  instOff += 1000;
}
console.log(`[tier8] loaded ${allInstallments.length} installments for live students`);
const instByStudent = new Map();
for (const i of allInstallments) {
  if (!instByStudent.has(i.student_id)) instByStudent.set(i.student_id, []);
  instByStudent.get(i.student_id).push(i);
}
for (const arr of instByStudent.values()) arr.sort((a, b) => a.installment_no - b.installment_no);

// For each student, delete existing payments and re-insert greedy
let totalDeleted = 0, totalInserted = 0, studentsProcessed = 0, errors = 0;
for (const [studentId, studentReceipts] of receiptsByStudent) {
  const insts = instByStudent.get(studentId) || [];
  if (insts.length === 0) continue;

  // Delete existing payments for this student
  const { error: delErr, count: delCount } = await sb.from("payments").delete({ count: "exact" }).eq("student_id", studentId);
  if (delErr) { console.error(`del fail ${studentId}:`, delErr.message); errors++; continue; }
  totalDeleted += delCount || 0;

  // Track remaining per installment
  const remaining = insts.map((i) => ({ id: i.id, installment_no: i.installment_no, remaining: i.amount_due }));

  // For each receipt (in date order), greedily allocate to earliest unfilled installment
  for (const r of studentReceipts) {
    let receiptRemaining = r.total_amount;
    const newPayments = [];
    for (const inst of remaining) {
      if (receiptRemaining <= 0) break;
      if (inst.remaining <= 0) continue;
      const alloc = Math.min(receiptRemaining, inst.remaining);
      newPayments.push({ receipt_id: r.id, student_id: studentId, installment_id: inst.id, amount: alloc });
      receiptRemaining -= alloc;
      inst.remaining -= alloc;
    }
    // If receipt still has remaining (parent overpaid total dues), allocate the rest to the LAST installment as overpayment
    if (receiptRemaining > 0 && newPayments.length > 0) {
      // Add to the last installment we touched (creates an overpaid installment)
      const lastPayment = newPayments[newPayments.length - 1];
      lastPayment.amount += receiptRemaining;
    } else if (receiptRemaining > 0) {
      // No installment was touched — put the whole receipt on Inst 4 as overpayment
      newPayments.push({ receipt_id: r.id, student_id: studentId, installment_id: remaining[remaining.length - 1].id, amount: receiptRemaining });
    }
    if (newPayments.length > 0) {
      const { error: insErr, data } = await sb.from("payments").insert(newPayments).select("id");
      if (insErr) { console.error(`payment insert fail: ${insErr.message}`); errors++; continue; }
      totalInserted += data.length;
    }
  }
  studentsProcessed++;
  if (studentsProcessed % 25 === 0) process.stdout.write(`  processed ${studentsProcessed}/${receiptsByStudent.size}\r`);
}
console.log(`[tier8] DONE. students=${studentsProcessed} deleted=${totalDeleted} inserted=${totalInserted} errors=${errors}`);
