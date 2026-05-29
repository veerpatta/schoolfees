import type { NextRequest } from "next/server";

import { applyThirdChildPolicyForFamilyGroup } from "@/lib/fees/conventional-discounts";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_LABEL = "2026-27";

/**
 * One-time maintenance: re-run the 3rd-child policy for every family group in
 * the active session. The SQL backfill of suspected siblings created the family
 * groups but did not apply the year-scoped 3rd-child discount; this brings the
 * already-linked 3+ families in line with what link/unlink now do automatically.
 * Admin-gated; remove after running.
 */
export async function GET(_request: NextRequest) {
  const staff = await requireStaffPermission("students:write");
  if (staff.appRole !== "admin") {
    return new Response("Admin only.", { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: groupsRaw, error } = await supabase
    .from("student_family_groups")
    .select("id")
    .eq("academic_session_label", SESSION_LABEL);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const groupIds = (groupsRaw ?? []).map((row) => (row as { id: string }).id);
  const results: Array<{ familyGroupId: string; recipientStudentId: string | null; affected: number }> = [];
  const studentsToReprice = new Set<string>();

  for (const familyGroupId of groupIds) {
    try {
      const result = await applyThirdChildPolicyForFamilyGroup(familyGroupId, {
        academicSessionLabel: SESSION_LABEL,
      });
      if (result) {
        results.push({
          familyGroupId,
          recipientStudentId: result.recipientStudentId,
          affected: result.affectedStudentIds.length,
        });
        // Only families that actually got a recipient (3+) change fees; still
        // reprice affected members so removals/re-applies settle correctly.
        if (result.recipientStudentId) {
          for (const id of result.affectedStudentIds) studentsToReprice.add(id);
        }
      }
    } catch (err) {
      results.push({ familyGroupId, recipientStudentId: null, affected: -1 });
      console.error("[maint-apply-third-child] failed for", familyGroupId, err);
    }
  }

  if (studentsToReprice.size > 0) {
    await prepareDuesForStudentsAutomatically({
      studentIds: [...studentsToReprice],
      sessionLabel: SESSION_LABEL,
      reason: "Backfill: apply 3rd-child policy to linked families",
    });
  }

  const recipients = results.filter((r) => r.recipientStudentId).length;
  return Response.json({
    ok: true,
    familyGroupsProcessed: groupIds.length,
    familiesWithThirdChildRecipient: recipients,
    studentsRepriced: studentsToReprice.size,
    results,
  });
}
