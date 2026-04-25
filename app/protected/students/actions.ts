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
import {
  type StudentFormActionState,
} from "@/lib/students/types";
import {
  isDuesSyncRelevantStatus,
  shouldSyncStudentDuesForChange,
} from "@/lib/students/dues-sync";
import { getStudentFormInput, validateStudentInput } from "@/lib/students/validation";
import { requireStaffPermission } from "@/lib/supabase/session";
import {
  hasPreparedDues,
  syncAfterStudentChange,
  revalidateFinanceSurfaces,
  summarizeDuesPreparationIssues,
} from "@/lib/system-sync/finance-sync";

function mapWriteErrorToState(message: string): StudentFormActionState {
  if (message.toLowerCase().includes("admission_no") || message.toLowerCase().includes("students_admission_no_key")) {
    return {
      status: "error",
      message: "SR no already exists. Please use a unique SR no.",
      fieldErrors: {
        admissionNo: "SR no already exists.",
      },
      studentId: null,
    };
  }

  return {
    status: "error",
    message: "Unable to save student right now. Please try again.",
    fieldErrors: {},
    studentId: null,
  };
}

export async function createStudentAction(
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  await requireStaffPermission("students:write");
  const input = getStudentFormInput(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions();

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
    };
  }

  try {
    const studentId = await createStudent(validated.data);
    let syncMessage = "";

    if (isDuesSyncRelevantStatus(validated.data.status)) {
      const syncResult = await syncAfterStudentChange(studentId);
      const issueSummary = summarizeDuesPreparationIssues(syncResult.skippedStudents);

      if (hasPreparedDues(syncResult) && syncResult.skippedStudents.length === 0) {
        syncMessage = "Student added and dues prepared.";
      } else if (issueSummary) {
        syncMessage = `Student saved, but dues could not be prepared. ${issueSummary}`;
      } else {
        syncMessage =
          "Student saved, but dues could not be prepared. Check Fee Setup for this class and year.";
      }
    } else {
      revalidateFinanceSurfaces({ studentIds: [studentId] });
    }

    return {
      status: "success",
      message: syncMessage || "Student record created successfully.",
      fieldErrors: {},
      studentId,
    };
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while creating student.",
    );
  }
}

export async function updateStudentAction(
  studentId: string,
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  await requireStaffPermission("students:write");
  const input = getStudentFormInput(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions();

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
      };
    }

    const updatedStudentId = await updateStudent(studentId, validated.data);
    const shouldSyncDues = shouldSyncStudentDuesForChange(previousStudent, validated.data);

    let syncMessage = "";

    if (shouldSyncDues) {
      const syncResult = await syncAfterStudentChange(updatedStudentId);
      const issueSummary = summarizeDuesPreparationIssues(syncResult.skippedStudents);

      if (hasPreparedDues(syncResult) && syncResult.skippedStudents.length === 0) {
        syncMessage = " Fee records updated.";
      } else if (issueSummary) {
        syncMessage = ` Student saved, but dues could not be prepared. ${issueSummary}`;
      } else {
        syncMessage =
          " Student saved, but dues could not be prepared. Check Fee Setup for this class and year.";
      }
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
    );
  }
}

export async function archiveStudentAction(formData: FormData) {
  await requireStaffPermission("students:write");
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    throw new Error("Student is required.");
  }

  await archiveStudent(studentId);
  await syncAfterStudentChange(studentId);
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

