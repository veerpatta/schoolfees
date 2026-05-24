#!/usr/bin/env node
/**
 * Tier 4 — Assign conventional discounts (RTE/Staff Child/3rd Child) + transport overrides
 * to the 479 students just imported into live 2026-27.
 *
 * Reads scripts/_revamp/out/discount-plan.json.
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

const plan = JSON.parse(fs.readFileSync("scripts/_revamp/out/discount-plan.json", "utf8"));
console.log(`[tier4] discount plan has ${plan.length} entries`);

// Policy id map for 2026-27
const POLICY_BY_CODE = {
  rte: "f9f19c96-1a0c-4b6f-b228-11ece922ada7",
  staff_child: "f1edf279-70e8-43ef-b9c5-db69f42c5618",
  "3rd_child": "b4e3aba6-cc97-4bd2-a7b8-7599542669e8",
};

// Class tuition map
const CLASS_TUITION = {
  "Nursery":16000,"JKG":17000,"SKG":17000,"Class 1":18000,"Class 2":18500,
  "Class 3":19000,"Class 4":19500,"Class 5":20000,"Class 6":21000,"Class 7":22000,
  "Class 8":23000,"Class 9":24000,"Class 10":25000,
  "11 Arts":30000,"11 Commerce":30000,"11 Science":35000,
  "12 Arts":32000,"12 Commerce":32000,"12 Science":38000,
};

// Load live student admission_no -> id
console.log("[tier4] loading live 2026-27 students...");
const liveStudents = new Map();
let from = 0;
while (true) {
  const { data, error } = await sb.from("students").select("id,admission_no,class_id,full_name").range(from, from + 999);
  if (error) { console.error(error); process.exit(2); }
  if (!data || data.length === 0) break;
  for (const s of data) liveStudents.set(s.admission_no, s);
  if (data.length < 1000) break;
  from += 1000;
}
// Restrict to 2026-27 (cross-reference class session)
const { data: liveClasses } = await sb.from("classes").select("id,class_name").eq("session_label", "2026-27");
const classNameById = new Map(liveClasses.map((c) => [c.id, c.class_name]));
console.log(`[tier4] loaded ${liveStudents.size} students total, ${liveClasses.length} live classes`);

const conventionalAssignments = [];
const transportOverrideTodos = [];
const missing = [];

for (const p of plan) {
  const adm = p.admission_no_live;
  const st = liveStudents.get(adm);
  if (!st) { missing.push(adm); continue; }
  if (!classNameById.has(st.class_id)) {
    // student lives in a different session; skip
    continue;
  }

  if (p.policy_code) {
    const polId = POLICY_BY_CODE[p.policy_code];
    if (!polId) { console.error(`unknown policy_code ${p.policy_code}`); process.exit(3); }
    const className = classNameById.get(st.class_id);
    const beforeTuition = CLASS_TUITION[className];
    const resultingTuition = p.expected_tuition_after;
    conventionalAssignments.push({
      student_id: st.id, policy_id: polId, academic_session_label: "2026-27",
      is_active: true, applied_at: new Date().toISOString(),
      reason: `Official AY 2026-27 Excel revamp — ${p.policy_code} per Tuition Override column`,
      notes: p.reason,
      before_tuition_amount: beforeTuition, resulting_tuition_amount: resultingTuition,
      calculation_snapshot: { source: "tier4 revamp 2026-05-24", class_default: beforeTuition, override_value: p.override_value, policy: p.policy_code },
      is_manual_override: false,
    });
  } else if (p.transport_override_annual !== undefined) {
    transportOverrideTodos.push({
      student_id: st.id, admission_no: adm, full_name: st.full_name,
      class: classNameById.get(st.class_id),
      transport_override_annual: p.transport_override_annual,
    });
  }
}

console.log(`[tier4] conventional assignments to insert: ${conventionalAssignments.length}`);
console.log(`[tier4] transport overrides to insert: ${transportOverrideTodos.length}`);
console.log(`[tier4] missing admission_no: ${missing.length}`);
if (missing.length) console.log("  ", missing.slice(0, 5).join(", "), "...");

// Insert conventional assignments
const { error: cdErr, data: cdData } = await sb.from("student_conventional_discount_assignments")
  .insert(conventionalAssignments).select("id");
if (cdErr) { console.error("conv discount insert failed:", cdErr); process.exit(4); }
console.log(`[tier4] inserted ${cdData.length} conventional discount assignments`);

// Insert transport overrides as student_fee_overrides (one row per student, transport-only)
// fee_setting_id required: find the fee_setting for the student's class
const liveFeeSettings = await sb.from("fee_settings").select("id,class_id");
const feeSettingByClass = new Map(liveFeeSettings.data.map((f) => [f.class_id, f.id]));

const transportOverrideRows = [];
for (const t of transportOverrideTodos) {
  const cls = liveClasses.find((c) => c.class_name === t.class);
  const feeSettingId = feeSettingByClass.get(cls.id);
  const installmentAmount = Math.round(Number(t.transport_override_annual) / 4);
  transportOverrideRows.push({
    student_id: t.student_id,
    fee_setting_id: feeSettingId,
    custom_transport_installment_amount: installmentAmount,
    discount_amount: 0,
    reason: `Official AY 2026-27 Excel revamp — transport override ₹${t.transport_override_annual}/year — needs owner confirmation`,
    notes: `OWNER CONFIRMATION REQUIRED. Annual override = ₹${t.transport_override_annual}, per-installment = ₹${installmentAmount}.`,
    is_active: true,
  });
}
if (transportOverrideRows.length) {
  const { error: trErr, data: trData } = await sb.from("student_fee_overrides")
    .insert(transportOverrideRows).select("id");
  if (trErr) { console.error("transport override insert failed:", trErr); process.exit(5); }
  console.log(`[tier4] inserted ${trData.length} transport override rows`);
}

console.log(`[tier4] DONE.`);
