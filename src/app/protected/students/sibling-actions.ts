"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  applyThirdChildPolicyForFamilyGroup,
  deactivateAutomaticThirdChildAssignments,
  type ThirdChildPolicyApplicationResult,
} from "@/modules/fees/data/conventional-discounts";
import { prepareDuesForStudentsAutomatically } from "@/modules/system-sync/domain/finance-sync";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";
import { createClient } from "@/platform/supabase/server";
import { requireStaffPermission } from "@/platform/supabase/session";
import type {
  LinkSiblingActionState,
  UnlinkSiblingActionState,
} from "@/app/protected/students/sibling-action-state";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type FamilyMemberLookupRow = {
  family_group_id: string;
  student_id: string;
  academic_session_label: string;
  sibling_order: number | null;
};

type StudentIdentityRow = {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
};

function uniqueIds(values: Iterable<string>) {
  return Array.from(new Set([...values].map((value) => value.trim()).filter(Boolean)));
}

/**
 * Every sibling id submitted by the picker. The sheet posts one
 * `siblingStudentIds` field per selected student; `siblingStudentId` is the
 * older single-select name and is still accepted so an in-flight form (or a
 * cached client bundle mid-deploy) keeps working.
 */
function readSiblingIds(formData: FormData, studentId: string) {
  const raw = [
    ...formData.getAll("siblingStudentIds"),
    ...formData.getAll("siblingStudentId"),
  ].map((value) => value.toString());

  return uniqueIds(raw).filter((id) => id !== studentId);
}

/**
 * Resolves the one family group these students should end up in, merging any
 * groups they are spread across.
 *
 * Linking sibling #3 used to fail outright ("already linked into different
 * families") whenever staff had built the family from more than one profile —
 * the exact way a family of three or more gets entered. Membership carries no
 * money, so consolidating is the correct repair, not an error to hand back.
 * The survivor is the group with the most members (ties broken by the oldest),
 * so labels and guardian details stay with the established family.
 */
async function resolveFamilyGroupId(
  supabase: SupabaseServerClient,
  candidateGroupIds: string[],
): Promise<{ familyGroupId: string | null; mergedGroupCount: number }> {
  const groupIds = uniqueIds(candidateGroupIds);
  if (groupIds.length === 0) {
    return { familyGroupId: null, mergedGroupCount: 0 };
  }
  if (groupIds.length === 1) {
    return { familyGroupId: groupIds[0], mergedGroupCount: 0 };
  }

  const { data: allRowsRaw, error: allRowsError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id, academic_session_label, sibling_order")
    .in("family_group_id", groupIds);

  if (allRowsError) {
    throw new Error(allRowsError.message);
  }

  const rows = (allRowsRaw ?? []) as FamilyMemberLookupRow[];
  const membersByGroup = new Map<string, Set<string>>();
  for (const groupId of groupIds) {
    membersByGroup.set(groupId, new Set());
  }
  for (const row of rows) {
    membersByGroup.get(row.family_group_id)?.add(row.student_id);
  }

  const { data: groupRowsRaw, error: groupRowsError } = await supabase
    .from("student_family_groups")
    .select("id, created_at")
    .in("id", groupIds);

  if (groupRowsError) {
    throw new Error(groupRowsError.message);
  }

  const createdAtById = new Map(
    ((groupRowsRaw ?? []) as Array<{ id: string; created_at: string | null }>).map((row) => [
      row.id,
      row.created_at ?? "",
    ]),
  );

  const [primaryGroupId] = [...groupIds].sort((left, right) => {
    const sizeDelta =
      (membersByGroup.get(right)?.size ?? 0) - (membersByGroup.get(left)?.size ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
    return (createdAtById.get(left) ?? "").localeCompare(createdAtById.get(right) ?? "");
  });

  const absorbedGroupIds = groupIds.filter((groupId) => groupId !== primaryGroupId);
  const existingInPrimary = new Set(
    rows
      .filter((row) => row.family_group_id === primaryGroupId)
      .map((row) => `${row.student_id}::${row.academic_session_label}`),
  );

  const carriedRows = rows
    .filter((row) => row.family_group_id !== primaryGroupId)
    .filter((row) => !existingInPrimary.has(`${row.student_id}::${row.academic_session_label}`))
    .map((row) => ({
      family_group_id: primaryGroupId,
      student_id: row.student_id,
      academic_session_label: row.academic_session_label,
      sibling_order: row.sibling_order,
      is_policy_candidate: false,
      manual_order_override: false,
      notes: "Carried over when two family groups were merged.",
    }));

  // Discount rows point at the absorbed group; re-point them before the delete
  // turns the reference into null (the FK is `on delete set null`).
  const { error: repointError } = await supabase
    .from("student_conventional_discount_assignments")
    .update({ family_group_id: primaryGroupId })
    .in("family_group_id", absorbedGroupIds);

  if (repointError) {
    throw new Error(repointError.message);
  }

  // Delete first, insert second. `student_family_members` is unique on
  // (student_id, academic_session_label), so writing a carried row while the
  // absorbed group still holds the same (student, session) pair would collide.
  // The rows being carried are already in memory above.
  const { error: deleteError } = await supabase
    .from("student_family_groups")
    .delete()
    .in("id", absorbedGroupIds);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (carriedRows.length > 0) {
    const { error: carryError } = await supabase
      .from("student_family_members")
      .upsert(carriedRows, {
        onConflict: "family_group_id,student_id,academic_session_label",
        ignoreDuplicates: true,
      });

    if (carryError) {
      throw new Error(carryError.message);
    }
  }

  return { familyGroupId: primaryGroupId, mergedGroupCount: absorbedGroupIds.length };
}

/**
 * Guarantees a membership row in `sessionLabel` for every student in the group.
 *
 * The 3rd Child Policy and the family panel both count members, and a family
 * assembled across two academic years used to leave older members without a
 * row for the current one. Also fixes sibling_order, which was written as a
 * hard-coded 1 (and a formula that could repeat a number) — with three
 * children that produced duplicate positions inside one family.
 */
async function backfillFamilyMembershipForSession(
  supabase: SupabaseServerClient,
  payload: { familyGroupId: string; sessionLabel: string; studentIds: string[]; notes: string },
) {
  const { data: existingRaw, error: existingError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id, academic_session_label, sibling_order")
    .eq("family_group_id", payload.familyGroupId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRows = (existingRaw ?? []) as FamilyMemberLookupRow[];
  const alreadyInSession = new Set(
    existingRows
      .filter((row) => row.academic_session_label === payload.sessionLabel)
      .map((row) => row.student_id),
  );

  const everyMemberId = uniqueIds([
    ...existingRows.map((row) => row.student_id),
    ...payload.studentIds,
  ]);
  const missingIds = everyMemberId.filter((id) => !alreadyInSession.has(id));

  if (missingIds.length === 0) {
    return everyMemberId;
  }

  let nextOrder = existingRows
    .filter((row) => row.academic_session_label === payload.sessionLabel)
    .reduce((highest, row) => Math.max(highest, row.sibling_order ?? 0), 0);

  const toInsert = missingIds.map((studentId) => {
    nextOrder += 1;
    return {
      family_group_id: payload.familyGroupId,
      student_id: studentId,
      academic_session_label: payload.sessionLabel,
      sibling_order: nextOrder,
      is_policy_candidate: false,
      manual_order_override: false,
      notes: payload.notes,
    };
  });

  const { error: insertError } = await supabase
    .from("student_family_members")
    .upsert(toInsert, {
      onConflict: "family_group_id,student_id,academic_session_label",
      ignoreDuplicates: true,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return everyMemberId;
}

async function createFamilyGroup(
  supabase: SupabaseServerClient,
  payload: {
    sessionLabel: string;
    anchorStudentId: string;
    guardianName: string | null;
    guardianPhone: string | null;
    notes: string;
  },
) {
  // `student_family_groups` is unique on (session, label), and two families can
  // legitimately share a guardian phone (or have none at all), so the anchor
  // student's id keeps the generated label collision-free.
  const familyLabel = `Family ${payload.guardianPhone ?? "—"} ${payload.anchorStudentId.slice(0, 8)}`;
  const { data, error } = await supabase
    .from("student_family_groups")
    .insert({
      academic_session_label: payload.sessionLabel,
      family_label: familyLabel,
      guardian_name: payload.guardianName,
      guardian_phone: payload.guardianPhone,
      notes: payload.notes,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unknown error creating the family group");
  }

  return (data as { id: string }).id;
}

/** Staff-facing sentence describing what the 3rd Child Policy did, if anything. */
function describeThirdChildOutcome(
  result: ThirdChildPolicyApplicationResult | null,
  studentNameById: Map<string, string>,
) {
  if (!result) return "";
  if (!result.policyConfigured) {
    return " The 3rd Child Policy is not configured for this session, so no discount was applied.";
  }
  if (result.recipientStudentId) {
    const name = studentNameById.get(result.recipientStudentId);
    return name
      ? ` 3rd Child Policy applied to ${name}.`
      : " 3rd Child Policy applied to the sibling in the lowest class.";
  }
  if (result.eligibleCount < 3) {
    return ` The 3rd Child Policy needs three siblings enrolled this session (${result.eligibleCount} so far).`;
  }
  return "";
}

async function loadStudentNames(supabase: SupabaseServerClient, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("students")
    .select("id, full_name")
    .in("id", studentIds);

  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string }>).map((row) => [row.id, row.full_name]),
  );
}

/**
 * Manually link one or more students as siblings of `studentId`. The link is
 * resolved across all academic sessions (membership is keyed by student, not
 * session), so once a family is linked it persists into future sessions; staff
 * can unlink anytime. A membership row is written for the current session for
 * every member, for audit and the year-scoped 3rd-child discount.
 */
export async function linkSiblingsAction(
  _previous: LinkSiblingActionState,
  formData: FormData,
): Promise<LinkSiblingActionState> {
  await requireStaffPermission("students:write");

  const studentId = (formData.get("studentId") ?? "").toString().trim();
  const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();
  const siblingStudentIds = studentId ? readSiblingIds(formData, studentId) : [];

  if (!studentId || siblingStudentIds.length === 0) {
    return {
      status: "error",
      message: "Choose at least one other student to link as a sibling.",
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
  const participantIds = uniqueIds([studentId, ...siblingStudentIds]);

  const { data: studentRowsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, admission_no, full_name, father_name, primary_phone, secondary_phone")
    .in("id", participantIds);

  if (studentsError) {
    return {
      status: "error",
      message: `Unable to load students: ${studentsError.message}`,
      familyGroupId: null,
    };
  }

  const studentRows = (studentRowsRaw ?? []) as StudentIdentityRow[];
  if (studentRows.length !== participantIds.length) {
    return {
      status: "error",
      message: "Every student being linked must exist. Refresh the list and try again.",
      familyGroupId: null,
    };
  }

  // Resolve existing family membership across ALL sessions so the link persists
  // across years and re-linking reuses the same family group.
  const { data: memberRowsRaw, error: membersLookupError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id, academic_session_label, sibling_order")
    .in("student_id", participantIds);

  if (membersLookupError) {
    return {
      status: "error",
      message: `Unable to check existing family groups: ${membersLookupError.message}`,
      familyGroupId: null,
    };
  }

  const memberRows = (memberRowsRaw ?? []) as FamilyMemberLookupRow[];
  const guardianPhone =
    studentRows.find((row) => row.primary_phone?.trim())?.primary_phone?.trim() ??
    studentRows.find((row) => row.secondary_phone?.trim())?.secondary_phone?.trim() ??
    null;
  const guardianName =
    studentRows.find((row) => row.father_name?.trim())?.father_name?.trim() ?? null;

  let familyGroupId: string;
  let mergedGroupCount = 0;
  let createdNewGroup = false;

  try {
    const resolved = await resolveFamilyGroupId(
      supabase,
      memberRows.map((row) => row.family_group_id),
    );
    mergedGroupCount = resolved.mergedGroupCount;

    if (resolved.familyGroupId) {
      familyGroupId = resolved.familyGroupId;
    } else {
      familyGroupId = await createFamilyGroup(supabase, {
        sessionLabel,
        anchorStudentId: studentId,
        guardianName,
        guardianPhone,
        notes: "Manually linked from student profile.",
      });
      createdNewGroup = true;
    }
  } catch (error) {
    return {
      status: "error",
      message: `Unable to prepare the family group: ${(error as Error).message}`,
      familyGroupId: null,
    };
  }

  let memberIds: string[];
  try {
    memberIds = await backfillFamilyMembershipForSession(supabase, {
      familyGroupId,
      sessionLabel,
      studentIds: participantIds,
      notes: "Manually linked from student profile.",
    });
  } catch (error) {
    return {
      status: "error",
      message: createdNewGroup
        ? `Family was created but linking failed: ${(error as Error).message}`
        : `Unable to link sibling: ${(error as Error).message}`,
      familyGroupId,
    };
  }

  const thirdChildResult = await applyThirdChildPolicyForFamilyGroup(familyGroupId, {
    academicSessionLabel: sessionLabel,
  });
  const studentsToResync = uniqueIds([
    ...memberIds,
    ...(thirdChildResult?.affectedStudentIds ?? []),
  ]);
  if (studentsToResync.length > 0) {
    await prepareDuesForStudentsAutomatically({
      studentIds: studentsToResync,
      sessionLabel,
      reason: "Sibling linked manually",
    });
    // Linking siblings can trigger the 3rd Child Policy, which rewrites
    // installments. That write only enqueues a matview refresh
    // (20260726154843), so drain it or the new discount stays invisible.
    after(drainFinancialViewRefresh);
  }

  revalidatePath("/protected/students");
  for (const id of memberIds) {
    revalidatePath(`/protected/students/${id}`);
  }

  const linkedCount = siblingStudentIds.length;
  const nameById = await loadStudentNames(supabase, [
    ...(thirdChildResult?.recipientStudentId ? [thirdChildResult.recipientStudentId] : []),
  ]);
  const headline = createdNewGroup
    ? `Family created with ${memberIds.length} students.`
    : `${linkedCount === 1 ? "Sibling" : `${linkedCount} siblings`} added — this family now has ${memberIds.length} students.`;
  const mergeNote =
    mergedGroupCount > 0
      ? ` ${mergedGroupCount === 1 ? "One other family group was" : `${mergedGroupCount} other family groups were`} merged in.`
      : "";

  return {
    status: "success",
    message: `${headline}${mergeNote}${describeThirdChildOutcome(thirdChildResult, nameById)}`,
    familyGroupId,
  };
}

/**
 * Remove a student from its family group across all sessions. If fewer than
 * two distinct students remain, the now-empty family group is deleted. The
 * 3rd-child discount is withdrawn from the removed student and recomputed for
 * whoever is left.
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

  const remainingStudentIds = uniqueIds(
    ((remainingRaw ?? []) as Array<{ student_id: string }>).map((row) => row.student_id),
  );

  const affected = new Set<string>([studentId]);
  // The student who just left never qualifies on their own, so the automatic
  // 3rd Child Policy comes off immediately — `applyThirdChildPolicyForFamilyGroup`
  // below only ever touches students still inside the group.
  const withdrawnFrom = [studentId, ...(remainingStudentIds.length < 2 ? remainingStudentIds : [])];
  try {
    for (const id of await deactivateAutomaticThirdChildAssignments({
      studentIds: withdrawnFrom,
      academicSessionLabel: sessionLabel || null,
    })) {
      affected.add(id);
    }
  } catch (error) {
    return {
      status: "error",
      message: `Unlinked, but the 3rd Child Policy could not be recalculated: ${(error as Error).message}`,
    };
  }

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
    for (const id of remainingStudentIds) affected.add(id);
  }

  if (sessionLabel) {
    await prepareDuesForStudentsAutomatically({
      studentIds: [...affected],
      sessionLabel,
      reason: "Sibling unlinked manually",
    });
    // Unlinking can REMOVE a 3rd Child discount, raising dues. Same drain.
    after(drainFinancialViewRefresh);
  }

  revalidatePath("/protected/students");
  for (const id of affected) {
    revalidatePath(`/protected/students/${id}`);
  }

  return { status: "success", message: "Sibling unlinked." };
}
