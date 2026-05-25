"use server";

import { revalidatePath } from "next/cache";

import {
  createStudentShareLink,
  revokeStudentShareLink,
} from "@/lib/share-links/data";

export async function createStudentShareLinkAction(studentId: string) {
  const link = await createStudentShareLink({ studentId });
  revalidatePath(`/protected/students/${studentId}`);
  return link;
}

export async function revokeStudentShareLinkAction(payload: {
  linkId: string;
  studentId: string;
}) {
  await revokeStudentShareLink(payload.linkId);
  revalidatePath(`/protected/students/${payload.studentId}`);
}
