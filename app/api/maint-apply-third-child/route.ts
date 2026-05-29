import type { NextRequest } from "next/server";

import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SESSION_LABEL = "2026-27";

/**
 * One-time maintenance: regenerate dues for current 3rd-child recipients so the
 * conventional discount reflects in their installments. Processes each student
 * individually so one failure doesn't abort the rest, and reports per-student
 * errors. Admin-gated; remove after running.
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

  const { data: assignmentsRaw, error } = await supabase
    .from("student_conventional_discount_assignments")
    .select("student_id")
    .eq("academic_session_label", SESSION_LABEL)
    .eq("policy_id", policyId)
    .eq("is_active", true);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const studentIds = [
    ...new Set((assignmentsRaw ?? []).map((row) => (row as { student_id: string }).student_id)),
  ];

  const succeeded: string[] = [];
  const failed: Array<{ studentId: string; error: string }> = [];

  for (const studentId of studentIds) {
    try {
      await prepareDuesForStudentsAutomatically({
        studentIds: [studentId],
        sessionLabel: SESSION_LABEL,
        reason: "Backfill: regenerate dues for 3rd-child recipient",
      });
      succeeded.push(studentId);
    } catch (err) {
      failed.push({ studentId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({
    ok: failed.length === 0,
    total: studentIds.length,
    succeeded: succeeded.length,
    failedCount: failed.length,
    failed,
  });
}
