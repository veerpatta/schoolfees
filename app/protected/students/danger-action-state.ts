// Action-state types and initial values for the Student danger-zone actions
// (withdraw / hard delete).
//
// Kept OUT of the "use server" action file: a "use server" module may only
// export async functions, so non-function exports (these constants) must live
// in a plain module that both the server actions and the client component can
// import.

export type StudentDangerActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  /** Set once the record is gone so the client can leave the dead page. */
  deleted: boolean;
};

export const INITIAL_STUDENT_DANGER_ACTION_STATE: StudentDangerActionState = {
  status: "idle",
  message: null,
  deleted: false,
};

/**
 * Staff type the SR no from a printed list or read it off the screen, so casing
 * and stray whitespace are noise, not intent. Compare on that basis — an exact
 * `!==` used to reject "svp-001" for "SVP-001" with a message that just told
 * the user to type it exactly, which reads as the app being broken.
 */
export function matchesDeleteConfirmation(typed: string, admissionNo: string) {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

  return normalise(typed) === normalise(admissionNo) && normalise(admissionNo).length > 0;
}
