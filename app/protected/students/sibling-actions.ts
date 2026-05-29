"use server";

import { revalidatePath } from "next/cache";

import { applyThirdChildPolicyForFamilyGroup } from "@/lib/fees/conventional-discounts";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

export type LinkSiblingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  familyGroupId: string | null;
};

export const INITIAL_LINK_SIBLING_ACTION_STATE: LinkSiblingActionState = {
  status: "idle",
  message: null,
  familyGroupId: null,
};

type FamilyMemberLookupRow = {
  family_group_id: string;
  student_id: string;
};

/**
 * Manually link two students as siblings. The link is resolved across all
 * academic sessions (membership is keyed by student, not session), so once a
 * family is linked it persists into future sessions; staff can unlink anytime.
 * A membership row is still written for the current session for audit + the
 * year-scoped 3rd-child discount.
 */
export async function linkSiblingsAction(
  _previous: LinkSiblingActionState,
  formData: FormData,
): Promise<LinkSiblingActionState> {
  await requireStaffPermission("students:write");

  const studentId = (formData.get("studentId") ?? "").toString().trim();
  const siblingStudentId = (formData.get("siblingStudentId") ?? "").toString().trim();
  const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!studentId || !siblingStudentId || studentId === siblingStudentId) {
    return {
      status: "error",
      message: "Choose a different student to link as a sibling.",
      familyGroupId: null,
    };
  }
  if (!sessionLabel) {
    return {
      status: "error",
      message: "Session label is required to link siblings.",
      familyGroupId: null,
    };
  }

  const supabase = await createClient();

  const { data: studentRowsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, admission_no, full_name, father_name, primary_phone, secondary_phone")
    .in("id", [studentId, siblingStudentId]);

  if (studentsError) {
    return {
      status: "error",
      message: `Unable to load students: ${studentsError.message}`,
      familyGroupId: null,
    };
  }

  if (!studentRowsRaw || studentRowsRaw.length < 2) {
    return {
      status: "error",
      message: "Both students must exist to be linked as siblings.",
      familyGroupId: null,
    };
  }

  // Resolve any existing family membership across ALL sessions so the link
  // persists across years and re-linking reuses the same family group.
  const { data: memberRowsRaw, error: membersLookupError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id")
    .in("student_id", [studentId, siblingStudentId]);

  if (membersLookupError) {
    return {
      status: "error",
      message: `Unable to check existing family groups: ${membersLookupError.message}`,
      familyGroupId: null,
    };
  }

  const memberRows = (memberRowsRaw ?? []) as FamilyMemberLookupRow[];
  const existingByStudent = new Map<string, string>();
  for (const row of memberRows) {
    // First non-null wins; a student should only ever sit in one family group.
    if (!existingByStudent.has(row.student_id)) {
      existingByStudent.set(row.student_id, row.family_group_id);
    }
  }

  const studentFamilyId = existingByStudent.get(studentId) ?? null;
  const siblingFamilyId = existingByStudent.get(siblingStudentId) ?? null;

  if (studentFamilyId && siblingFamilyId && studentFamilyId !== siblingFamilyId) {
    return {
      status: "error",
      message:
        "Both students are already linked into different families. Unlink one of them first, then link.",
      familyGroupId: studentFamilyId,
    };
  }

  let familyGroupId = studentFamilyId ?? siblingFamilyId;
  let createdNewGroup = false;
  const studentRows = studentRowsRaw as Array<{
    id: string;
    admission_no: string;
    full_name: string;
    father_name: string | null;
    primary_phone: string | null;
    secondary_phone: string | null;
  }>;
  const guardianPhone =
    studentRows.find((row) => row.primary_phone?.trim())?.primary_phone?.trim() ??
    studentRows.find((row) => row.secondary_phone?.trim())?.secondary_phone?.trim() ??
    null;
  const guardianName =
    studentRows.find((row) => row.father_name?.trim())?.father_name?.trim() ?? null;

  if (!familyGroupId) {
    const familyLabel = `Family ${guardianPhone ?? studentId.slice(0, 6)} ${siblingStudentId.slice(0, 6)}`;
    const { data: familyGroupRaw, error: insertGroupError } = await supabase
      .from("student_family_groups")
      .insert({
        academic_session_label: sessionLabel,
        family_label: familyLabel,
        guardian_name: guardianName,
        guardian_phone: guardianPhone,
        notes: "Manually linked from student profile.",
      })
      .select("id")
      .single();

    if (insertGroupError || !familyGroupRaw) {
      return {
        status: "error",
        message: `Unable to create family group: ${insertGroupError?.message ?? "Unknown error"}`,
        familyGroupId: null,
      };
    }

    familyGroupId = (familyGroupRaw as { id: string }).id;
    createdNewGroup = true;
  }

  // Insert membership rows for the current session for whichever student is not
  // already a member. `upsert` with ignoreDuplicates keeps re-links idempotent.
  const toInsert: Array<{
    family_group_id: string;
    student_id: string;
    academic_session_label: string;
    sibling_order: number;
    is_policy_candidate: boolean;
    manual_order_override: boolean;
    notes: string;
  }> = [];

  if (!studentFamilyId) {
    toInsert.push({
      family_group_id: familyGroupId,
      student_id: studentId,
      academic_session_label: sessionLabel,
      sibling_order: 1,
      is_policy_candidate: false,
      manual_order_override: false,
      notes: "Manually linked from student profile.",
    });
  }
  if (!siblingFamilyId) {
    toInsert.push({
      family_group_id: familyGroupId,
      student_id: siblingStudentId,
      academic_session_label: sessionLabel,
      sibling_order: existingByStudent.size + toInsert.length + (studentFamilyId ? 1 : 2),
      is_policy_candidate: false,
      manual_order_override: false,
      notes: "Manually linked from student profile.",
    });
  }

  if (toInsert.length > 0) {
    const { error: insertMembersError } = await supabase
      .from("student_family_members")
      .upsert(toInsert, {
        onConflict: "family_group_id,student_id,academic_session_label",
        ignoreDuplicates: true,
      });

    if (insertMembersError) {
      return {
        status: "error",
        message: createdNewGroup
          ? `Family was created but linking failed: ${insertMembersError.message}`
          : `Unable to link sibling: ${insertMembersError.message}`,
        familyGroupId,
      };
    }
  }

  const thirdChildResult = await applyThirdChildPolicyForFamilyGroup(familyGroupId, {
    academicSessionLabel: sessionLabel,
  });
  if (thirdChildResult?.affectedStudentIds.length) {
    await prepareDuesForStudentsAutomatically({
      studentIds: thirdChildResult.affectedStudentIds,
      sessionLabel,
      reason: "Sibling linked manually",
    });
  }

  revalidatePath("/protected/students");
  revalidatePath(`/protected/students/${studentId}`);
  revalidatePath(`/protected/students/${siblingStudentId}`);

  return {
    status: "success",
    message: createdNewGroup
      ? "Family created and both students linked as siblings."
      : "Sibling added to the existing family group.",
    familyGroupId,
  };
}

/**
 * One-tap link for a phone-detected ("suspected") sibling group: links every
 * member of the student's suspected group into a single family for the session.
 * This replaces the old "confirm sibling group" page — staff confirm directly
 * from the profile. Kept explicit (a tap) rather than automatic-on-view so the
 * 3rd-child discount is never applied silently.
 */
export async function linkSuspectedSiblingsAction(
  _previous: LinkSiblingActionState,
  formData: FormData,
): Promise<LinkSiblingActionState> {
  await requireStaffPermission("students:write");

  const studentId = (formData.get("studentId") ?? "").toString().trim();
  const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!studentId || !sessionLabel) {
    return { status: "error", message: "Missing student or session for linking.", familyGroupId: null };
  }

  const supabase = await createClient();

  const { data: groupRows, error: groupError } = await supabase
    .from("v_student_sibling_groups")
    .select("student_ids, phone_match, father_name_match")
    .overlaps("student_ids", [studentId])
    .eq("session_label", sessionLabel)
    .limit(1);

  if (groupError) {
    return { status: "error", message: `Unable to load suspected siblings: ${groupError.message}`, familyGroupId: null };
  }

  const group = (groupRows ?? [])[0] as
    | { student_ids: string[] | null; phone_match: string[] | null; father_name_match: boolean | null }
    | undefined;
  const memberIds = [...new Set(group?.student_ids ?? [])].filter(Boolean);

  if (memberIds.length < 2) {
    return { status: "error", message: "No suspected siblings to link for this student.", familyGroupId: null };
  }

  // Reuse any existing family group these students already belong to (across
  // sessions), otherwise create one.
  const { data: existingRaw } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id")
    .in("student_id", memberIds);
  const existing = (existingRaw ?? []) as FamilyMemberLookupRow[];
  let familyGroupId = existing[0]?.family_group_id ?? null;

  const { data: studentRowsRaw } = await supabase
    .from("students")
    .select("id, father_name, primary_phone, secondary_phone")
    .in("id", memberIds);
  const studentRows = (studentRowsRaw ?? []) as Array<{
    id: string;
    father_name: string | null;
    primary_phone: string | null;
    secondary_phone: string | null;
  }>;
  const guardianPhone = group?.phone_match?.[0] ?? null;
  const guardianName = studentRows.find((r) => r.father_name?.trim())?.father_name?.trim() ?? null;

  if (!familyGroupId) {
    const familyLabel = `Family ${guardianPhone ?? studentId.slice(0, 8)} ${studentId.slice(0, 6)}`;
    const { data: familyGroupRaw, error: insertGroupError } = await supabase
      .from("student_family_groups")
      .insert({
        academic_session_label: sessionLabel,
        family_label: familyLabel,
        guardian_name: guardianName,
        guardian_phone: guardianPhone,
        notes: "Linked from suspected siblings on the student profile.",
      })
      .select("id")
      .single();

    if (insertGroupError || !familyGroupRaw) {
      return {
        status: "error",
        message: `Unable to create family group: ${insertGroupError?.message ?? "Unknown error"}`,
        familyGroupId: null,
      };
    }
    familyGroupId = (familyGroupRaw as { id: string }).id;
  }

  const alreadyMember = new Set(existing.map((row) => row.student_id));
  const toInsert = memberIds
    .filter((id) => !alreadyMember.has(id))
    .map((id, index) => ({
      family_group_id: familyGroupId as string,
      student_id: id,
      academic_session_label: sessionLabel,
      sibling_order: index + 1,
      is_policy_candidate: false,
      manual_order_override: false,
      notes: "Linked from suspected siblings on the student profile.",
    }));

  if (toInsert.length > 0) {
    const { error: insertMembersError } = await supabase
      .from("student_family_members")
      .upsert(toInsert, {
        onConflict: "family_group_id,student_id,academic_session_label",
        ignoreDuplicates: true,
      });
    if (insertMembersError) {
      return { status: "error", message: `Unable to link siblings: ${insertMembersError.message}`, familyGroupId };
    }
  }

  const thirdChildResult = await applyThirdChildPolicyForFamilyGroup(familyGroupId, {
    academicSessionLabel: sessionLabel,
  });
  if (thirdChildResult?.affectedStudentIds.length) {
    await prepareDuesForStudentsAutomatically({
      studentIds: thirdChildResult.affectedStudentIds,
      sessionLabel,
      reason: "Suspected siblings linked",
    });
  }

  revalidatePath("/protected/students");
  for (const id of memberIds) {
    revalidatePath(`/protected/students/${id}`);
  }

  return { status: "success", message: `Linked ${memberIds.length} students as a family.`, familyGroupId };
}

export type UnlinkSiblingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const INITIAL_UNLINK_SIBLING_ACTION_STATE: UnlinkSiblingActionState = {
  status: "idle",
  message: null,
};

/**
 * Remove a student from its family group across all sessions. If fewer than
 * two distinct students remain, the now-empty family group is deleted. The
 * 3rd-child discount is recomputed for the remaining members.
 */
export async function unlinkSiblingAction(
  _previous: UnlinkSiblingActionState,
  formData: FormData,
): Promise<UnlinkSiblingActionState> {
  await requireStaffPermission("students:write");

  const studentId = (formData.get("studentId") ?? "").toString().trim();
  const familyGroupId = (formData.get("familyGroupId") ?? "").toString().trim();
  const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!studentId || !familyGroupId) {
    return { status: "error", message: "Missing student or family reference for unlink." };
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("student_family_members")
    .delete()
    .eq("family_group_id", familyGroupId)
    .eq("student_id", studentId);

  if (deleteError) {
    return { status: "error", message: `Unable to unlink sibling: ${deleteError.message}` };
  }

  // Determine the distinct students remaining in the group across all sessions.
  const { data: remainingRaw, error: remainingError } = await supabase
    .from("student_family_members")
    .select("student_id")
    .eq("family_group_id", familyGroupId);

  if (remainingError) {
    return { status: "error", message: `Unlinked, but cleanup check failed: ${remainingError.message}` };
  }

  const remainingStudentIds = [
    ...new Set(((remainingRaw ?? []) as Array<{ student_id: string }>).map((row) => row.student_id)),
  ];

  const affected = new Set<string>([studentId]);

  if (remainingStudentIds.length < 2) {
    // A single (or empty) group is no longer a family — remove it (membership
    // rows cascade) so no stale "family of one" lingers.
    await supabase.from("student_family_groups").delete().eq("id", familyGroupId);
    for (const id of remainingStudentIds) affected.add(id);
  } else if (sessionLabel) {
    // Recompute the 3rd-child discount for the slimmer family.
    const thirdChildResult = await applyThirdChildPolicyForFamilyGroup(familyGroupId, {
      academicSessionLabel: sessionLabel,
    });
    for (const id of thirdChildResult?.affectedStudentIds ?? []) affected.add(id);
  }

  if (sessionLabel) {
    await prepareDuesForStudentsAutomatically({
      studentIds: [...affected],
      sessionLabel,
      reason: "Sibling unlinked manually",
    });
  }

  revalidatePath("/protected/students");
  revalidatePath(`/protected/students/${studentId}`);

  return { status: "success", message: "Sibling unlinked." };
}
