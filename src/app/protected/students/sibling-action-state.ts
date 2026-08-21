// Action-state types and initial values for the sibling link/unlink actions.
// Kept OUT of the "use server" action file: a "use server" module may only
// export async functions, so non-function exports (these constants) must live
// in a plain module that both the server actions and the client components can
// import.

export type LinkSiblingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  familyGroupId: string | null;
};

export const INITIAL_LINK_SIBLING_ACTION_STATE: LinkSiblingActionState = {
  status: "idle",
  message: null,
  familyGroupId: null,
};

export type UnlinkSiblingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const INITIAL_UNLINK_SIBLING_ACTION_STATE: UnlinkSiblingActionState = {
  status: "idle",
  message: null,
};
