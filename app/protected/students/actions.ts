"use server";

import { revalidatePath } from "next/cache";

import { generateSessionLedgersAction } from "@/lib/fees/generator";
import {
  createStudent,
  getStudentDetail,
  getStudentFormOptions,
  updateStudent,
} from "@/lib/students/data";
import {
  type StudentFormActionState,
} from "@/lib/students/types";
import { getStudentFormInput, validateStudentInput } from "@/lib/students/validation";
import { requireStaffPermission } from "@/lib/supabase/session";

function isLedgerEligibleStatus(status: "active" | "inactive" | "left" | "graduated") {
  return status === "active" || status === "inactive";
}

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
  const { classOptions, routeOptions } = await getStudentFormOptions();

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
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

    if (isLedgerEligibleStatus(validated.data.status)) {
      await requireStaffPermission("fees:write");
      const syncResult = await generateSessionLedgersAction({
        scopedStudentIds: [studentId],
      });

      syncMessage = ` Dues generated: ${syncResult.installmentsToInsert} insert, ${syncResult.installmentsToUpdate} update, ${syncResult.installmentsToCancel} cancel, ${syncResult.lockedInstallments} blocked for review.`;
    }

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${studentId}`);
    revalidatePath(`/protected/students/${studentId}/statement`);
    revalidatePath("/protected/payments");
    revalidatePath("/protected/dues");
    revalidatePath("/protected/defaulters");

    return {
      status: "success",
      message: `Student record created successfully.${syncMessage}`,
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
  const { classOptions, routeOptions } = await getStudentFormOptions();

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
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
    const feeProfileChanged =
      previousStudent.studentTypeOverride !== validated.data.studentTypeOverride ||
      previousStudent.tuitionOverride !== validated.data.tuitionOverride ||
      previousStudent.transportOverride !== validated.data.transportOverride ||
      previousStudent.discountAmount !== validated.data.discountAmount ||
      previousStudent.lateFeeWaiverAmount !== validated.data.lateFeeWaiverAmount ||
      previousStudent.otherAdjustmentHead !== validated.data.otherAdjustmentHead ||
      previousStudent.otherAdjustmentAmount !== validated.data.otherAdjustmentAmount ||
      previousStudent.overrideReason !== validated.data.feeProfileReason ||
      previousStudent.overrideNotes !== validated.data.feeProfileNotes;
    const routeOrClassChanged =
      previousStudent.transportRouteId !== validated.data.transportRouteId ||
      previousStudent.classId !== validated.data.classId;
    const remainsLedgerEligible = isLedgerEligibleStatus(validated.data.status);

    let syncMessage = "";

    if ((routeOrClassChanged || feeProfileChanged) && remainsLedgerEligible) {
      await requireStaffPermission("fees:write");
      const syncResult = await generateSessionLedgersAction({
        scopedStudentIds: [updatedStudentId],
      });

      syncMessage = ` Workbook dues sync completed: ${syncResult.installmentsToInsert} insert, ${syncResult.installmentsToUpdate} update, ${syncResult.installmentsToCancel} cancel, ${syncResult.lockedInstallments} blocked for review.`;
    }

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${updatedStudentId}`);
    revalidatePath(`/protected/students/${updatedStudentId}/statement`);
    revalidatePath("/protected/defaulters");
    revalidatePath("/protected/reports");
    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/fee-setup/generate");
    revalidatePath("/protected/payments");
    revalidatePath("/protected/dues");

    return {
      status: "success",
      message: `Student record updated successfully.${syncMessage}`,
      fieldErrors: {},
      studentId: updatedStudentId,
    };
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while updating student.",
    );
  }
}

