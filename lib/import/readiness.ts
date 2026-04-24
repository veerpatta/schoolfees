import "server-only";

import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/auth/roles";
import type { OfficeWorkflowGuard } from "@/lib/office/readiness";

function buildGuard(
  title: string,
  detail: string,
  actionLabel: string | null,
  actionHref: string | null,
  isReady: boolean,
): OfficeWorkflowGuard {
  return {
    key: "import_students",
    isReady,
    title,
    detail,
    actionLabel,
    actionHref,
  };
}

export async function getStudentImportWorkflowReadiness(
  role: StaffRole,
  sessionLabel?: string | null,
) {
  const masterOptions = await getMasterDataOptions();
  const resolvedSessionLabel =
    sessionLabel?.trim() || masterOptions.currentSessionLabel || "";

  if (!resolvedSessionLabel) {
    return buildGuard(
      "Select an academic session before importing students.",
      role === "admin"
        ? "Create or choose the active session first, then return to import students."
        : "Student import is waiting for admin setup. The active academic session is missing.",
      role === "admin" ? "Go to Setup" : null,
      role === "admin" ? "/protected/setup#session-policy" : null,
      false,
    );
  }

  const classOptions = masterOptions.classOptions.filter(
    (row) => row.sessionLabel === resolvedSessionLabel,
  );

  if (classOptions.length === 0) {
    return buildGuard(
      "Add classes before importing students.",
      role === "admin"
        ? `No classes are saved for ${resolvedSessionLabel}. Add classes first, then return to student import.`
        : "Student import is waiting for admin setup. Classes for the active academic session are still missing.",
      role === "admin" ? "Add classes now" : null,
      role === "admin" ? "/protected/setup#classes" : null,
      false,
    );
  }

  const supabase = await createClient();
  const classIds = classOptions.map((row) => row.id);
  const { data: feeDefaults, error } = await supabase
    .from("fee_settings")
    .select("class_id")
    .eq("is_active", true)
    .in("class_id", classIds);

  if (error) {
    throw new Error(`Unable to load fee defaults for import readiness: ${error.message}`);
  }

  if ((feeDefaults ?? []).length === 0) {
    return buildGuard(
      "Configure fee defaults before importing students.",
      role === "admin"
        ? `Fee defaults are still missing for ${resolvedSessionLabel}. Save class defaults first, then return to student import.`
        : "Student import is waiting for admin setup. Fee defaults for the active academic session are still missing.",
      role === "admin" ? "Configure fee defaults" : null,
      role === "admin" ? "/protected/fee-setup#class-defaults" : null,
      false,
    );
  }

  return buildGuard(
    "Student import is ready.",
    "Session classes and fee defaults are in place for safe import.",
    null,
    null,
    true,
  );
}
