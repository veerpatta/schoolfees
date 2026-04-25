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

const requiredPublicEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const missingPublicEnv = requiredPublicEnv.filter((name) => !process.env[name]?.trim());

if (missingPublicEnv.length > 0) {
  console.error(`Missing required env vars: ${missingPublicEnv.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const zeroUuid = "00000000-0000-0000-0000-000000000000";
const today = new Date().toISOString().slice(0, 10);

function printHeader(title) {
  console.log(`\n## ${title}`);
}

function printRows(rows, emptyLabel = "None") {
  if (!rows || rows.length === 0) {
    console.log(`- ${emptyLabel}`);
    return;
  }

  for (const row of rows) {
    console.log(`- ${row}`);
  }
}

function errorMessage(error) {
  return error?.message ?? "unknown error";
}

async function checked(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.log(`- ${label}: ERROR - ${errorMessage(error)}`);
    return fallback;
  }
}

function toSingleRecord(value) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function sessionCountRows(rows) {
  const counts = new Map();

  for (const row of rows) {
    const label = row.sessionLabel || "Not set";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${label}: ${count}`);
}

printHeader("VPPS Live Fee Health");
console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Credential: ${usingServiceRole ? "service role" : "publishable key (RLS may limit results)"}`);

const activePolicy = await checked("active fee policy", async () => {
  const { data, error } = await supabase
    .from("fee_policy_configs")
    .select("academic_session_label, calculation_model, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}, null);

const activeSession = activePolicy?.academic_session_label?.trim() || "";

printHeader("Active Fee Policy");
if (activePolicy) {
  console.log(`Session: ${activePolicy.academic_session_label}`);
  console.log(`Calculation model: ${activePolicy.calculation_model}`);
} else {
  console.log("No active fee policy found.");
}

const currentAcademicSession = await checked("academic current session", async () => {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("session_label, status")
    .eq("is_current", true)
    .eq("status", "active");

  if (error) throw error;
  return data ?? [];
}, []);

printHeader("Academic Current Session");
printRows(
  currentAcademicSession.map((row) => `${row.session_label} (${row.status})`),
  "No current academic session found",
);

const students = await checked("active students", async () => {
  const { data, error } = await supabase
    .from("students")
    .select("id, admission_no, full_name, status, class_id, class_ref:classes(id, session_label, status, class_name, section, stream_name)")
    .eq("status", "active");

  if (error) throw error;
  return (data ?? []).map((row) => {
    const classRef = toSingleRecord(row.class_ref);
    return {
      id: row.id,
      admissionNo: row.admission_no,
      fullName: row.full_name,
      classId: row.class_id,
      classLabel: [classRef?.class_name, classRef?.section, classRef?.stream_name]
        .filter(Boolean)
        .join(" - "),
      sessionLabel: classRef?.session_label ?? "Not set",
      classStatus: classRef?.status ?? "not-loaded",
    };
  });
}, []);

printHeader("Active Students By Session");
printRows(sessionCountRows(students), "No active students found");

const activeSessionStudents = students.filter(
  (row) => row.sessionLabel === activeSession && row.classStatus === "active",
);
const activeStudentIds = activeSessionStudents.map((row) => row.id);
const activeClassIds = [...new Set(activeSessionStudents.map((row) => row.classId))];

const workbookFinancialRows = await checked("workbook financial rows", async () => {
  const { data, error } = await supabase
    .from("v_workbook_student_financials")
    .select("student_id, session_label");

  if (error) throw error;
  return data ?? [];
}, []);

printHeader("Workbook Financial Rows");
console.log(`Rows total: ${workbookFinancialRows.length}`);
printRows(
  sessionCountRows(
    workbookFinancialRows.map((row) => ({
      sessionLabel: row.session_label,
    })),
  ),
  "No workbook financial rows found",
);

const installmentRows = activeStudentIds.length > 0
  ? await checked("installment rows", async () => {
      const { data, error } = await supabase
        .from("installments")
        .select("student_id")
        .in("student_id", activeStudentIds)
        .neq("status", "cancelled");

      if (error) throw error;
      return data ?? [];
    }, [])
  : [];
const installmentStudentIds = new Set(installmentRows.map((row) => row.student_id));
const missingInstallmentStudents = activeSessionStudents.filter(
  (row) => !installmentStudentIds.has(row.id),
);

printHeader("Students Missing Installments");
printRows(
  missingInstallmentStudents.map((row) => `${row.fullName} (${row.admissionNo || "No SR"}) - ${row.classLabel}`),
  "No active-session students missing installments",
);

const feeSettings = activeClassIds.length > 0
  ? await checked("fee settings", async () => {
      const { data, error } = await supabase
        .from("fee_settings")
        .select("class_id")
        .eq("is_active", true)
        .in("class_id", activeClassIds);

      if (error) throw error;
      return data ?? [];
    }, [])
  : [];
const feeSettingClassIds = new Set(feeSettings.map((row) => row.class_id));
const classesMissingFeeSettings = activeSessionStudents
  .filter((row) => !feeSettingClassIds.has(row.classId))
  .map((row) => `${row.classLabel || row.classId} (${row.sessionLabel})`);

printHeader("Classes Missing Fee Settings");
printRows([...new Set(classesMissingFeeSettings)], "No active-session class fee gaps found");

const studentsOutsideActiveSession = students.filter(
  (row) => row.sessionLabel !== activeSession || row.classStatus !== "active",
);

printHeader("Students Outside Active Fee Setup Session");
printRows(
  studentsOutsideActiveSession.map(
    (row) => `${row.fullName} (${row.admissionNo || "No SR"}) - class session ${row.sessionLabel}`,
  ),
  "No active students outside the Fee Setup session",
);

const importBatches = await checked("import batches", async () => {
  const { data, error } = await supabase
    .from("import_batches")
    .select("target_session_label, status");

  if (error) throw error;
  return data ?? [];
}, []);
const importBatchCounts = new Map();
for (const row of importBatches) {
  const key = `${row.target_session_label || "Not set"} / ${row.status}`;
  importBatchCounts.set(key, (importBatchCounts.get(key) ?? 0) + 1);
}

printHeader("Import Batches By Target Session / Status");
printRows(
  [...importBatchCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `${key}: ${count}`),
  "No import batches found",
);

const previewProbe = await supabase.rpc("preview_workbook_payment_allocation", {
  p_student_id: zeroUuid,
  p_payment_date: today,
});

printHeader("Payment Preview Function");
if (previewProbe.error) {
  console.log(`Status: NOT READY`);
  console.log(`Message: ${previewProbe.error.message}`);
  console.log("Action: Apply latest Supabase migrations.");
} else {
  console.log("Status: READY");
}
