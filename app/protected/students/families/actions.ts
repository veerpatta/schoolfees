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

  const { data: memberRowsRaw, error: membersLookupError } = await supabase
    .from("student_family_members")
    .select("family_group_id, student_id")
    .in("student_id", [studentId, siblingStudentId])
    .eq("academic_session_label", sessionLabel);

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
    existingByStudent.set(row.student_id, row.family_group_id);
  }

  const studentFamilyId = existingByStudent.get(studentId) ?? null;
  const siblingFamilyId = existingByStudent.get(siblingStudentId) ?? null;

  if (studentFamilyId && siblingFamilyId && studentFamilyId !== siblingFamilyId) {
    return {
      status: "error",
      message:
        "Both students are already in different confirmed family groups. Open Students > Families to merge them.",
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
      .insert(toInsert);

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
  revalidatePath("/protected/students/families");
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

export type ConfirmSiblingGroupActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  familyGroupId: string | null;
};

export const INITIAL_CONFIRM_SIBLING_GROUP_ACTION_STATE: ConfirmSiblingGroupActionState = {
  status: "idle",
  message: null,
  familyGroupId: null,
};

type SiblingGroupViewRow = {
  group_key: string;
  session_label: string;
  student_ids: string[] | null;
  student_count: number;
  phone_match: string[] | null;
  father_name_match: boolean | null;
  confidence: "confirmed" | "suspected";
  existing_family_group_id: string | null;
};

type FamilyStudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
};

export async function confirmSiblingGroupAction(
  _previous: ConfirmSiblingGroupActionState,
  formData: FormData,
): Promise<ConfirmSiblingGroupActionState> {
  await requireStaffPermission("students:write");

  const groupKey = (formData.get("groupKey") ?? "").toString().trim();
  const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!groupKey) {
    return {
      status: "error",
      message: "Select a sibling group before confirming.",
      familyGroupId: null,
    };
  }

  const supabase = await createClient();
  let groupQuery = supabase
    .from("v_student_sibling_groups")
    .select(
      "group_key, session_label, student_ids, student_count, phone_match, father_name_match, confidence, existing_family_group_id",
    )
    .eq("group_key", groupKey);

  if (sessionLabel) {
    groupQuery = groupQuery.eq("session_label", sessionLabel);
  }

  const { data: groupRowRaw, error: groupError } = await groupQuery.maybeSingle();

  if (groupError) {
    return {
      status: "error",
      message: `Unable to confirm this family: ${groupError.message}`,
      familyGroupId: null,
    };
  }

  const groupRow = (groupRowRaw ?? null) as SiblingGroupViewRow | null;
  const studentIds = groupRow?.student_ids ?? [];

  if (!groupRow || groupRow.student_count < 2 || studentIds.length < 2) {
    return {
      status: "error",
      message: "This sibling group is no longer available.",
      familyGroupId: null,
    };
  }

  if (groupRow.existing_family_group_id) {
    return {
      status: "success",
      message: "This family was already confirmed.",
      familyGroupId: groupRow.existing_family_group_id,
    };
  }

  const { data: studentRowsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, admission_no, full_name, father_name")
    .in("id", studentIds);

  if (studentsError) {
    return {
      status: "error",
      message: `Unable to load children before confirming: ${studentsError.message}`,
      familyGroupId: null,
    };
  }

  const studentRows = (studentRowsRaw ?? []) as FamilyStudentRow[];
  const guardianName = groupRow.father_name_match
    ? (studentRows.find((row) => row.father_name?.trim())?.father_name ?? null)
    : null;
  const guardianPhone = groupRow.phone_match?.[0] ?? null;
  const familyLabel = `Family ${guardianPhone ?? groupRow.group_key.slice(0, 8)} ${groupRow.group_key.slice(0, 6)}`;

  const { data: familyGroupRaw, error: insertGroupError } = await supabase
    .from("student_family_groups")
    .insert({
      academic_session_label: groupRow.session_label,
      family_label: familyLabel,
      guardian_name: guardianName,
      guardian_phone: guardianPhone,
      notes: "Confirmed from Students > Families sibling detection.",
    })
    .select("id")
    .single();

  if (insertGroupError) {
    return {
      status: "error",
      message: `Unable to save the family group: ${insertGroupError.message}`,
      familyGroupId: null,
    };
  }

  const familyGroup = familyGroupRaw as { id: string };
  const { error: insertMembersError } = await supabase.from("student_family_members").insert(
    studentIds.map((studentId, index) => ({
      family_group_id: familyGroup.id,
      student_id: studentId,
      academic_session_label: groupRow.session_label,
      sibling_order: index + 1,
      is_policy_candidate: false,
      manual_order_override: false,
      notes: "Confirmed from sibling phone detection.",
    })),
  );

  if (insertMembersError) {
    return {
      status: "error",
      message: `Family group was created, but children could not be linked: ${insertMembersError.message}`,
      familyGroupId: familyGroup.id,
    };
  }

  const thirdChildResult = await applyThirdChildPolicyForFamilyGroup(familyGroup.id, {
    academicSessionLabel: groupRow.session_label,
  });
  if (thirdChildResult?.affectedStudentIds.length) {
    await prepareDuesForStudentsAutomatically({
      studentIds: thirdChildResult.affectedStudentIds,
      sessionLabel: groupRow.session_label,
      reason: "Sibling policy updated",
    });
  }

  revalidatePath("/protected/students");
  revalidatePath("/protected/students/families");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/defaulters");

  return {
    status: "success",
    message: "Family confirmed. The sibling pill will now link to this family.",
    familyGroupId: familyGroup.id,
  };
}
