// Action-state types and initial values for the student photo action.
// Kept OUT of the "use server" action file: a "use server" module may only
// export async functions, so non-function exports (these constants) must live
// in a plain module that both the server action and the client sheet import.

export type StudentPhotoActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  /** The saved path, so the sheet can re-render without a round trip. */
  photoPath: string | null;
};

export const INITIAL_STUDENT_PHOTO_ACTION_STATE: StudentPhotoActionState = {
  status: "idle",
  message: null,
  photoPath: null,
};
