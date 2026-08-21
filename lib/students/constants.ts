import type { StudentStatus } from "@/lib/db/types";

/** Rows per page in the Students workspace. Was hardcoded in three places. */
export const STUDENT_PAGE_SIZE = 40;

export const STUDENT_STATUSES: ReadonlyArray<{
  value: StudentStatus;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "left", label: "Left" },
  { value: "graduated", label: "Graduated" },
];

export function isPendingAdmissionNo(value: string | null | undefined) {
  return Boolean(value?.trim().toUpperCase().startsWith("PENDING-SR-"));
}
