// Action-state types and initial values for the student information action.
// Kept OUT of the "use server" action file: a "use server" module may only
// export async functions, so non-function exports (these constants) must live
// in a plain module that both the server action and the client sheet import.

import type { StudentInfoErrors } from "@/modules/students/domain/info-fields";

export type StudentInfoActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors: StudentInfoErrors;
};

export const INITIAL_STUDENT_INFO_ACTION_STATE: StudentInfoActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};
