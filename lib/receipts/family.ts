import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getReceiptDetail } from "@/lib/receipts/data";
import type { ReceiptDetail } from "@/lib/receipts/types";

type FamilyGroupRow = {
  id: string;
  name: string;
  academic_session_label: string;
};

type FamilyMemberRow = {
  student_id: string;
  academic_session_label: string;
};

type FamilyStudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
};

type ReceiptIdRow = {
  id: string;
  student_id: string;
  payment_date: string;
  created_at: string;
};

export type FamilyReceiptBundle = {
  familyGroup: FamilyGroupRow;
  members: Array<FamilyStudentRow & { receipts: ReceiptDetail[] }>;
  receiptCount: number;
};

const FAMILY_REPRINT_RECEIPT_LIMIT = 30;

/**
 * Loads every receipt for every member of a confirmed family group, ordered
 * chronologically. Caps at {@link FAMILY_REPRINT_RECEIPT_LIMIT} to keep
 * print payloads sane.
 */
export async function getFamilyReceiptsBundle(
  familyGroupId: string,
): Promise<FamilyReceiptBundle | null> {
  const supabase = await createClient();

  const { data: groupRaw, error: groupError } = await supabase
    .from("student_family_groups")
    .select("id, name, academic_session_label")
    .eq("id", familyGroupId)
    .maybeSingle();

  if (groupError) {
    throw new Error(`Unable to load family group: ${groupError.message}`);
  }

  if (!groupRaw) {
    return null;
  }

  const group = groupRaw as FamilyGroupRow;

  const { data: membersRaw, error: membersError } = await supabase
    .from("student_family_members")
    .select("student_id, academic_session_label")
    .eq("family_group_id", familyGroupId);

  if (membersError) {
    throw new Error(`Unable to load family members: ${membersError.message}`);
  }

  const memberIds = ((membersRaw ?? []) as FamilyMemberRow[]).map((row) => row.student_id);

  if (memberIds.length === 0) {
    return { familyGroup: group, members: [], receiptCount: 0 };
  }

  const { data: studentsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, full_name, admission_no")
    .in("id", memberIds);

  if (studentsError) {
    throw new Error(`Unable to load family student details: ${studentsError.message}`);
  }

  const { data: receiptIdsRaw, error: receiptIdsError } = await supabase
    .from("receipts")
    .select("id, student_id, payment_date, created_at")
    .in("student_id", memberIds)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(FAMILY_REPRINT_RECEIPT_LIMIT);

  if (receiptIdsError) {
    throw new Error(`Unable to load family receipts: ${receiptIdsError.message}`);
  }

  const receiptIds = ((receiptIdsRaw ?? []) as ReceiptIdRow[]).map((row) => row.id);

  const details = await Promise.all(
    receiptIds.map((id) => getReceiptDetail(id).catch(() => null)),
  );

  const byStudent = new Map<string, ReceiptDetail[]>();
  details.forEach((detail) => {
    if (!detail) return;
    const list = byStudent.get(detail.studentId) ?? [];
    list.push(detail);
    byStudent.set(detail.studentId, list);
  });

  const members = ((studentsRaw ?? []) as FamilyStudentRow[])
    .map((student) => ({
      ...student,
      receipts: byStudent.get(student.id) ?? [],
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    familyGroup: group,
    members,
    receiptCount: details.filter((d): d is ReceiptDetail => d !== null).length,
  };
}

export { FAMILY_REPRINT_RECEIPT_LIMIT };
