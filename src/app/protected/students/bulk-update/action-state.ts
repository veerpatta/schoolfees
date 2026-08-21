// Action-state shapes for the bulk update workspace. Kept out of the
// "use server" module so the client component can import the constants.

import type { BulkUpdatePreview } from "@/lib/students/bulk-update/diff";

export type BulkUpdatePreviewState = {
  status: "idle" | "success" | "error";
  message: string | null;
  preview: BulkUpdatePreview | null;
  /** Echoed back so Apply operates on exactly what was previewed. */
  token: string | null;
};

export const INITIAL_BULK_UPDATE_PREVIEW_STATE: BulkUpdatePreviewState = {
  status: "idle",
  message: null,
  preview: null,
  token: null,
};

export type BulkUpdateApplyState = {
  status: "idle" | "success" | "error";
  message: string | null;
  updatedStudentCount: number;
  failures: Array<{ admissionNo: string; message: string }>;
};

export const INITIAL_BULK_UPDATE_APPLY_STATE: BulkUpdateApplyState = {
  status: "idle",
  message: null,
  updatedStudentCount: 0,
  failures: [],
};
