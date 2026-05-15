"use server";

import {
  createStudent,
  archiveStudent,
  hardDeleteStudent,
  getStudentDetail,
  getStudentFormOptions,
  getStudentDeletionSafety,
  updateStudent,
} from "@/lib/students/data";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  type StudentFormInput,
  type StudentFormActionState,
} from "@/lib/students/types";
import {
  isDuesSyncRelevantStatus,
  shouldSyncStudentDuesForChange,
} from "@/lib/students/dues-sync";
import { getStudentFormInput, validateStudentInput } from "@/lib/students/validation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import {
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
} from "@/lib/system-sync/finance-sync";

const STUDENT_SAVED_DUES_FAILED_MESSAGE =
  "Student record was saved, but dues could not be prepared automatically. Open Admin Tools \u2192 Session Health if this student does not appear in Payment Desk.";

type RecentImportRealignRpcRow = {
  moved_count: number;
  attention_count: number;
  moved_student_ids: string[] | null;
};

function getSubmittedSessionLabel(formData: FormData) {
  const raw = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!raw) {
    return null;
  }

  try {
    return parseAcademicSessionLabel(raw).normalizedLabel;
  } catch {
    return null;
  }
}

function mapWriteErrorToState(
  message: string,
  submittedValues?: StudentFormInput,
): StudentFormActionState {
  const normalizedMessage = message.toLowerCase();

  if (message.toLowerCase().includes("admission_no") || message.toLowerCase().includes("students_admission_no_key")) {
    return {
      status: "error",
      message: "SR no already exists. Please use a unique SR no.",
      fieldErrors: {
        admissionNo: "SR no already exists.",
      },
      studentId: null,
      submittedValues,
    };
  }

  if (
    normalizedMessage.includes("conventional discount") ||
    normalizedMessage.includes("3rd child") ||
    normalizedMessage.includes("sibling group")
  ) {
    return {
      status: "error",
      message,
      fieldErrors: {
        conventionalPolicyIds: message,
      },
      studentId: null,
      submittedValues,
    };
  }

  return {
    status: "error",
    message: "Unable to save student right now. Please try again.",
    fieldErrors: {},
    studentId: null,
    submittedValues,
  };
}

function conventionalDiscountSelectionChanged(
  previousPolicyIds: readonly string[] = [],
  nextPolicyIds: readonly string[] = [],
) {
  const previousKey = [...previousPolicyIds].sort().join("|");
  const nextKey = [...nextPolicyIds].sort().join("|");
  return previousKey !== nextKey;
}

export async function createStudentAction(
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  await requireStaffPermission("students:write");
  const input = getStudentFormInput(formData);
  const submittedSessionLabel = getSubmittedSessionLabel(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: submittedSessionLabel,
  });

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
    allowBlankAdmissionNo: true,
    sessionLabel: resolvedSessionLabel,
  });

  if (!validated.ok) {
    return {
      status: "error",
      message: validated.message,
      fieldErrors: validated.fieldErrors,
      studentId: null,
      submittedValues: input,
    };
  }

  let studentId: string;

  try {
    studentId = await createStudent(validated.data);
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while creating student.",
      input,
    );
  }

  let syncMessage = "";

  try {
    if (isDuesSyncRelevantStatus(validated.data.status)) {
      const duesResult = await prepareDuesForStudentsAutomatically({
        studentIds: [studentId],
        reason: "Student added",
      });

      syncMessage = buildStudentDuesMessage({
        action: "added",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        reasonSummary: duesResult.reasonSummary,
      });
    } else {
      revalidateFinanceSurfaces({ studentIds: [studentId] });
    }

    return {
      status: "success",
      message: syncMessage || "Student record created successfully.",
      fieldErrors: {},
      studentId,
    };
  } catch {
    return {
      status: "error",
      message: STUDENT_SAVED_DUES_FAILED_MESSAGE,
      fieldErrors: {},
      studentId,
      submittedValues: input,
    };
  }
}

export async function updateStudentAction(
  studentId: string,
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  await requireStaffPermission("students:write");
  const input = getStudentFormInput(formData);
  const submittedSessionLabel = getSubmittedSessionLabel(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: submittedSessionLabel,
  });

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
    sessionLabel: resolvedSessionLabel,
  });

  if (!validated.ok) {
    return {
      status: "error",
      message: validated.message,
      fieldErrors: validated.fieldErrors,
      studentId: null,
      submittedValues: input,
    };
  }

  try {
    const previousStudent = await getStudentDetail(studentId);

    if (!previousStudent) {
      return {
        status: "error",
        message: "Student record was not found.",
        fieldErrors: {},
        studentId: null,
        submittedValues: input,
      };
    }

    const updatedStudentId = await updateStudent(studentId, validated.data);
    const shouldSyncDues =
      shouldSyncStudentDuesForChange(previousStudent, validated.data) ||
      conventionalDiscountSelectionChanged(
        previousStudent.conventionalDiscountPolicyIds,
        validated.data.conventionalPolicyIds,
      );

    let syncMessage = "";

    if (shouldSyncDues) {
      const duesResult = await prepareDuesForStudentsAutomatically({
        studentIds: [updatedStudentId],
        reason: "Student updated",
      });

      syncMessage = ` ${buildStudentDuesMessage({
        action: "updated",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        reasonSummary: duesResult.reasonSummary,
      })}`;
    } else {
      revalidateFinanceSurfaces({ studentIds: [updatedStudentId] });
    }

    return {
      status: "success",
      message: syncMessage ? `Student record updated successfully.${syncMessage}` : "Student record updated successfully.",
      fieldErrors: {},
      studentId: updatedStudentId,
    };
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while updating student.",
      input,
    );
  }
}

function buildStudentDuesMessage(payload: {
  action: "added" | "updated";
  readyForPaymentCount: number;
  duesNeedAttentionCount: number;
  reasonSummary: string | null;
}) {
  if (payload.duesNeedAttentionCount === 0 && payload.readyForPaymentCount > 0) {
    return payload.action === "added"
      ? "Student added and dues prepared. Open Payment Desk to collect payment."
      : "Student updated and fee records updated.";
  }

  const savedVerb = payload.action === "added" ? "saved" : "updated";
  return `Student ${savedVerb}, but dues could not be prepared. ${
    payload.reasonSummary ?? "Check Fee Setup for this class and year."
  }`;
}

export async function archiveStudentAction(formData: FormData) {
  await requireStaffPermission("students:write");
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    throw new Error("Student is required.");
  }

  await archiveStudent(studentId);
  await prepareDuesForStudentsAutomatically({
    studentIds: [studentId],
    reason: "Student withdrawn",
  });
  revalidateFinanceSurfaces({ studentIds: [studentId] });
}

export async function hardDeleteStudentAction(formData: FormData) {
  await requireStaffPermission("students:write");
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    throw new Error("Student is required.");
  }

  const safety = await getStudentDeletionSafety(studentId);

  if (!safety) {
    throw new Error("Student record was not found.");
  }

  const confirmation = (formData.get("confirmDelete") ?? "").toString().trim();
  if (confirmation !== safety.admissionNo) {
    throw new Error("Type the student's SR no exactly before deleting this record.");
  }

  const forceTestRecord = formData.get("forceTestRecord") === "yes";
  await hardDeleteStudent(studentId, { forceTestRecord });
  revalidateFinanceSurfaces({ studentIds: [studentId] });
}

export async function realignRecentImportsToActiveSessionAction(): Promise<{
  movedCount: number;
  preparedCount: number;
  attentionCount: number;
}> {
  const staff = await requireStaffPermission("fees:write");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "realign_recent_import_students_to_active_session",
    {
      p_run_by: staff.id ?? null,
    },
  );

  if (error) {
    throw new Error(`Unable to move recent import students: ${error.message}`);
  }

  const rpcRow = Array.isArray(data)
    ? ((data[0] ?? null) as RecentImportRealignRpcRow | null)
    : ((data ?? null) as RecentImportRealignRpcRow | null);
  const movedStudentIds = rpcRow?.moved_student_ids ?? [];
  const movedCount = rpcRow?.moved_count ?? movedStudentIds.length;
  const attentionCount = rpcRow?.attention_count ?? 0;

  if (movedStudentIds.length === 0) {
    return {
      movedCount,
      preparedCount: 0,
      attentionCount,
    };
  }

  const duesResult = await prepareDuesForStudentsAutomatically({
    studentIds: movedStudentIds,
    reason: "Recent import session realign",
  });

  revalidateFinanceSurfaces({ studentIds: movedStudentIds });

  return {
    movedCount,
    preparedCount: duesResult.readyForPaymentCount,
    attentionCount: attentionCount + duesResult.duesNeedAttentionCount,
  };
}

