import type { StaffPermission } from "@/platform/auth/roles";

/**
 * Who may take a copy of a child's photograph away.
 *
 * Looking at a photo on screen is `students:view`, which every role holds
 * including view_only. Downloading one is not the same act: the file leaves the
 * school and nothing downstream can recall it. This is the pair that already
 * guards `updateStudentPhotoAction` and the student edit page, so "may change a
 * student's photo" and "may keep a copy of it" are the same answer — admin and
 * teacher.
 *
 * Deliberately NOT the page's `canEditStudent`, which is `students:write`
 * alone and is narrower than every action it fronts.
 */
export const STUDENT_PHOTO_DOWNLOAD_PERMISSIONS = [
  "students:write",
  "students:edit_basic",
] as const satisfies readonly StaffPermission[];
