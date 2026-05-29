#!/usr/bin/env node
// One-off data correction: normalize duplicate installment_label variants
// in public.installments so that each (session_label, installment_no) has
// exactly one canonical label.
//
// Background: bulk-data scripts produced both "Installment N" and
// "Installment N (DD-MM-YYYY)" variants for the same installment. The
// dated form is more descriptive and matches the workbook export style,
// so we keep that.
//
// Usage:
//   node scripts/dedupe-installment-labels.mjs --dry-run            (default)
//   node scripts/dedupe-installment-labels.mjs --apply               (commits)
//   node scripts/dedupe-installment-labels.mjs --session 2026-27 --apply

import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sessionFlagIndex = args.indexOf("--session");
const targetSession =
  sessionFlagIndex >= 0 ? args[sessionFlagIndex + 1] : "2026-27";

if (!targetSession) {
  console.error("Missing --session value");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function formatDDMMYYYY(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

async function main() {
  console.log(`[dedupe-installment-labels] session=${targetSession} mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const { data: classRows, error: classErr } = await supabase
    .from("classes")
    .select("id")
    .eq("session_label", targetSession);
  if (classErr) throw classErr;
  const classIds = classRows.map((row) => row.id);
  if (classIds.length === 0) {
    console.log(`No classes for session ${targetSession}`);
    return;
  }

  const { data: installments, error: instErr } = await supabase
    .from("installments")
    .select("id, installment_no, installment_label, due_date, class_id")
    .in("class_id", classIds);
  if (instErr) throw instErr;

  const grouped = new Map();
  for (const row of installments) {
    const key = `${row.installment_no}::${row.due_date}`;
    if (!grouped.has(key)) {
      grouped.set(key, { installmentNo: row.installment_no, dueDate: row.due_date, labels: new Map(), rows: [] });
    }
    const entry = grouped.get(key);
    entry.labels.set(row.installment_label, (entry.labels.get(row.installment_label) ?? 0) + 1);
    entry.rows.push(row);
  }

  let updatePlans = [];
  for (const entry of grouped.values()) {
    const canonical = `Installment ${entry.installmentNo} (${formatDDMMYYYY(entry.dueDate)})`;
    const labelList = Array.from(entry.labels.entries());
    const variantCount = labelList.length;
    const mismatched = entry.rows.filter((row) => row.installment_label !== canonical);

    console.log(
      `  installment_no=${entry.installmentNo} due=${entry.dueDate} variants=${variantCount} canonical="${canonical}"`,
    );
    for (const [label, count] of labelList) {
      const mark = label === canonical ? "(keep)" : "(rewrite)";
      console.log(`    ${mark} ${count}× "${label}"`);
    }

    if (mismatched.length > 0) {
      updatePlans.push({ canonical, ids: mismatched.map((row) => row.id) });
    }
  }

  const totalUpdates = updatePlans.reduce((sum, plan) => sum + plan.ids.length, 0);
  console.log(`\nTotal rows to rewrite: ${totalUpdates}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to commit changes.");
    return;
  }

  for (const plan of updatePlans) {
    const { error: updErr } = await supabase
      .from("installments")
      .update({ installment_label: plan.canonical })
      .in("id", plan.ids);
    if (updErr) throw updErr;
    console.log(`  Updated ${plan.ids.length} rows → "${plan.canonical}"`);
  }

  console.log("\nVerification:");
  const { data: verifyRows, error: verifyErr } = await supabase
    .from("installments")
    .select("installment_no, installment_label")
    .in("class_id", classIds);
  if (verifyErr) throw verifyErr;
  const verifyGroup = new Map();
  for (const row of verifyRows) {
    if (!verifyGroup.has(row.installment_no)) verifyGroup.set(row.installment_no, new Set());
    verifyGroup.get(row.installment_no).add(row.installment_label);
  }
  for (const [no, labels] of [...verifyGroup.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  installment_no=${no} → ${labels.size} distinct label(s): ${[...labels].join(" | ")}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
