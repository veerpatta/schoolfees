import type { NextRequest } from "next/server";

import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SESSION_LABEL = "2026-27";

// MOHIT REBARI and NIRALI KANWAR CHUNDAWAT — orphaned 3rd-child assignments
// (no family group). The school confirmed these should not have the discount.
const TARGET_STUDENT_IDS = [
  "98d23e1f-592c-4139-830e-3b7af3f35818",
  "2d636d05-3bc5-444b-b193-8b198920a146",
];

/**
 * One-time maintenance: deactivate the 3rd-child discount for the two named
 * students and regenerate their dues so tuition returns to full. Admin-gated;
 * remove after running.
 */
export async function GET(_request: NextRequest) {
  const staff = await requireStaffPermission("students:write");
  if (staff.appRole !== "admin") {
    return new Response("Admin only.", { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: policyRow } = await supabase
    .from("conventional_discount_policies")
    .select("id")
    .eq("academic_session_label", SESSION_LABEL)
    .eq("code", "third_child")
    .maybeSingle();

  const policyId = (policyRow as { id: string } | null)?.id;
  if (!policyId) {
    return Response.json({ ok: false, error: "third_child policy not found" }, { status: 500 });
  }

  const { error: deactivateError, count } = await supabase
    .from("student_conventional_discount_assignments")
    .update({ is_active: false }, { count: "exact" })
    .eq("academic_session_label", SESSION_LABEL)
    .eq("policy_id", policyId)
    .eq("is_active", true)
    .in("student_id", TARGET_STUDENT_IDS);

  if (deactivateError) {
    return Response.json({ ok: false, error: deactivateError.message }, { status: 500 });
  }

  const results: Array<{ studentId: string; ok: boolean; error?: string }> = [];
  for (const studentId of TARGET_STUDENT_IDS) {
    try {
      await prepareDuesForStudentsAutomatically({
        studentIds: [studentId],
        sessionLabel: SESSION_LABEL,
        reason: "Remove orphaned 3rd-child discount (no family group)",
      });
      results.push({ studentId, ok: true });
    } catch (err) {
      results.push({ studentId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ ok: true, deactivated: count ?? null, results });
}
