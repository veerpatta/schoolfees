"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

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

  revalidatePath("/protected/students");
  revalidatePath("/protected/students/families");

  return {
    status: "success",
    message: "Family confirmed. The sibling pill will now link to this family.",
    familyGroupId: familyGroup.id,
  };
}
