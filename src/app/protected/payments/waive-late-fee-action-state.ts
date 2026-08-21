// Action-state type and initial value for the late-fee waiver action.
// Kept OUT of the "use server" action file: a "use server" module may only
// export async functions, so non-function exports (this constant) must live in
// a plain module that both the server action and the client sheet can import.
// Co-locating the const in the action file made every Payment Desk server-action
// POST throw `A "use server" file can only export async functions` (a 500 on
// /protected/payments), because Next.js loads the whole route action graph and
// rejects the non-async export.

export type WaiveLateFeeActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  newWaiverAmount: number | null;
};

export const INITIAL_WAIVE_LATE_FEE_ACTION_STATE: WaiveLateFeeActionState = {
  status: "idle",
  message: null,
  newWaiverAmount: null,
};
