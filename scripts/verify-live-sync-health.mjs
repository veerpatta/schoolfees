import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());

if (missingEnv.length > 0) {
  console.error(`Missing required env vars: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CHECK_SESSIONS = ["2026-27", "TEST-2026-27"];
const REQUIRED_DB_OBJECTS = [
  { type: "view", name: "v_workbook_student_financials" },
  { type: "view", name: "v_workbook_installment_balances" },
  { type: "view", name: "v_student_financial_state" },
];

let hasError = false;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
  hasError = true;
}

function info(msg) {
  console.log(`  · ${msg}`);
}

function section(title) {
  console.log(`\n## ${title}`);
}

async function checkDbObjects() {
  section("Required DB objects");

  for (const obj of REQUIRED_DB_OBJECTS) {
    const { error } = await supabase
      .from(obj.name)
      .select("*", { count: "exact", head: true })
      .limit(0);

    if (error) {
      warn(`${obj.name}: ${error.message}`);
    } else {
      ok(`${obj.name} is accessible`);
    }
  }

  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  const today = new Date().toISOString().slice(0, 10);

  const { error: previewError } = await supabase.rpc("preview_workbook_payment_allocation", {
    p_student_id: zeroUuid,
    p_payment_date: today,
  });

  const previewMissing =
    previewError?.code === "PGRST202" ||
    previewError?.message?.includes("does not exist") ||
    previewError?.message?.includes("could not find the function");

  if (previewMissing) {
    warn(`preview_workbook_payment_allocation: function missing — ${previewError.message}`);
  } else {
    ok("preview_workbook_payment_allocation is callable");
  }

  const { error: postError } = await supabase.rpc("post_student_payment", {
    p_student_id: zeroUuid,
    p_payment_date: today,
    p_payment_mode: "cash",
    p_total_amount: 1,
    p_reference_number: null,
    p_remarks: "readiness check only",
    p_received_by: "system-readiness",
    p_receipt_prefix: "SVP",
  });

  const postMissing =
    postError?.code === "PGRST202" ||
    postError?.message?.includes("does not exist") ||
    postError?.message?.includes("could not find the function");

  if (postMissing) {
    warn(`post_student_payment: function missing — ${postError.message}`);
  } else {
    ok("post_student_payment is callable");
  }

  const { error: reconcileError } = await supabase
    .from("session_reconcile_log")
    .select("id", { count: "exact", head: true })
    .limit(0);

  if (reconcileError) {
    warn(`session_reconcile_log: ${reconcileError.message}`);
  } else {
    ok("session_reconcile_log is accessible");
  }

  const { error: eventsError } = await supabase
    .from("office_sync_events")
    .select("id", { count: "exact", head: true })
    .limit(0);

  if (eventsError) {
    warn(`office_sync_events: ${eventsError.message}`);
  } else {
    ok("office_sync_events is accessible");
  }
}

async function checkSession(sessionLabel) {
  section(`Session: ${sessionLabel}`);

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id")
    .eq("session_label", sessionLabel)
    .eq("status", "active");

  if (classesError) {
    warn(`Classes query failed: ${classesError.message}`);
    return;
  }

  const classIds = (classes ?? []).map((c) => c.id);
  info(`Active classes: ${classIds.length}`);

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id")
    .eq("status", "active")
    .in("class_id", classIds.length > 0 ? classIds : ["none"]);

  if (studentsError) {
    warn(`Students query failed: ${studentsError.message}`);
    return;
  }

  const studentIds = (students ?? []).map((s) => s.id);
  info(`Active students: ${studentIds.length}`);

  if (studentIds.length === 0) {
    info("No active students — skipping dues check");
    return;
  }

  const { data: installments, error: installmentsError } = await supabase
    .from("installments")
    .select("student_id")
    .in("student_id", studentIds)
    .neq("status", "cancelled");

  if (installmentsError) {
    warn(`Installments query failed: ${installmentsError.message}`);
    return;
  }

  const studentsWithInstallments = new Set((installments ?? []).map((r) => r.student_id));
  const missingCount = studentIds.filter((id) => !studentsWithInstallments.has(id)).length;

  if (missingCount > 0) {
    warn(`${missingCount} student(s) have no installment rows`);
  } else {
    ok(`All ${studentIds.length} students have installment rows`);
  }

  const { data: feeSettings, error: feeSettingsError } = await supabase
    .from("fee_settings")
    .select("class_id")
    .eq("is_active", true)
    .in("class_id", classIds.length > 0 ? classIds : ["none"]);

  if (feeSettingsError) {
    warn(`Fee settings query failed: ${feeSettingsError.message}`);
    return;
  }

  const classesWithFees = new Set((feeSettings ?? []).map((r) => r.class_id));
  const gapCount = classIds.filter((id) => !classesWithFees.has(id)).length;

  if (gapCount > 0) {
    warn(`${gapCount} class(es) missing fee settings`);
  } else if (classIds.length > 0) {
    ok(`All ${classIds.length} classes have fee settings`);
  }

  const { data: financials, error: financialsError } = await supabase
    .from("v_workbook_student_financials")
    .select("student_id", { count: "exact", head: true })
    .in("student_id", studentIds);

  if (financialsError) {
    warn(`Workbook financials query failed: ${financialsError.message}`);
  } else {
    const prepared = financials ?? 0;
    const count = typeof prepared === "number" ? prepared : (financials?.length ?? 0);
    info(`Workbook financial rows for session students: ${count}`);
  }
}

async function checkEnv() {
  section("Environment");

  if (usingServiceRole) {
    ok("Using service role key (full sync available)");
  } else {
    warn("SUPABASE_SERVICE_ROLE_KEY not set — automatic sync uses anon key (limited)");
  }

  info(`Supabase URL: ${supabaseUrl}`);
}

async function main() {
  console.log("# Sync Health Verification");
  console.log(`Run at: ${new Date().toISOString()}`);

  await checkEnv();
  await checkDbObjects();

  for (const sessionLabel of CHECK_SESSIONS) {
    await checkSession(sessionLabel);
  }

  console.log("");

  if (hasError) {
    console.log("Result: NEEDS ATTENTION — see warnings above");
    process.exit(1);
  } else {
    console.log("Result: HEALTHY");
  }
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
