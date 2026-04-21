"use server";

import { revalidatePath } from "next/cache";

import { createStudent, getStudentFormOptions, updateStudent } from "@/lib/students/data";
import {
  type StudentFormActionState,
} from "@/lib/students/types";
import { getStudentFormInput, validateStudentInput } from "@/lib/students/validation";
import { requireStaffPermission } from "@/lib/supabase/session";

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

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${studentId}`);

    return {
      status: "success",
      message: "Student record created successfully.",
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
    const updatedStudentId = await updateStudent(studentId, validated.data);

    revalidatePath("/protected/students");
    revalidatePath(`/protected/students/${updatedStudentId}`);

    return {
      status: "success",
      message: "Student record updated successfully.",
      fieldErrors: {},
      studentId: updatedStudentId,
    };
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while updating student.",
    );
  }
}

