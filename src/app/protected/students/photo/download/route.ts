import { after } from "next/server";

import { recordActivity } from "@/modules/activity/data/events";
import { getStudentPhotoIdentity } from "@/modules/students/data/queries";
import { studentPhotoFileName } from "@/modules/students/domain/photo-file-name";
import { STUDENT_PHOTO_DOWNLOAD_PERMISSIONS } from "@/modules/students/domain/photo-permissions";
import { attachmentDisposition } from "@/platform/helpers/content-disposition";
import { createClient } from "@/platform/supabase/server";
import { getAuthenticatedStaff, hasAnyStaffPermission } from "@/platform/supabase/session";

/**
 * Hands a staff member a copy of a student's photograph.
 *
 * A SEPARATE route from ../route.ts, which serves the same bucket, and the
 * separation is the point:
 *
 *  - **One file, one guard.** The viewer route opens with
 *    `students:view`. Folding an attachment mode into it would make that guard
 *    conditional on a parsed query parameter, which is the shape that fails
 *    open the day a third mode arrives or a parse is reordered.
 *  - **A caller never names a path.** The viewer route takes `?path=` and signs
 *    whatever object it names. This one takes a student and reads the path from
 *    the record — the rule the MCP worker already writes down, because a
 *    general read_storage_object(bucket, path) is an arbitrary-file-read
 *    primitive wearing a tool's clothes.
 *  - **Different cache and different side effects.** A thumbnail is cached for
 *    a week; an attachment carrying a child's name is `no-store` and writes an
 *    audit row.
 *
 * No `withDownloadToken`. That machinery exists for exports that "can
 * legitimately take tens of seconds" and earns its spinner there; this is one
 * indexed row read plus a ~53 KB object, and the nonce, the cookie and the
 * 250ms poll would buy a server-rendered header a client boundary to say
 * nothing.
 */

const BUCKET = "student-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  // getAuthenticatedStaff + an explicit check, not requireAnyStaffPermission:
  // the require* guards redirect(), which would turn a failed download into a
  // 307 to the login page rather than a status the caller can read. The
  // isActive check is ours to make — getAuthenticatedStaff does not.
  const staff = await getAuthenticatedStaff();
  if (!staff || !staff.isActive) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasAnyStaffPermission(staff, STUDENT_PHOTO_DOWNLOAD_PERMISSIONS)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId")?.trim() ?? "";
  if (!UUID.test(studentId)) {
    return new Response("Bad request", { status: 400 });
  }

  const student = await getStudentPhotoIdentity(studentId);
  const photoPath = student?.photoPath;
  if (!student || !photoPath) {
    // A student without a photograph is ordinary, not an error.
    return new Response(null, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(photoPath);

  if (error || !data) {
    return new Response(null, { status: 404 });
  }

  const fileName = studentPhotoFileName({
    admissionNo: student.admissionNo,
    fullName: student.fullName,
    photoPath,
  });
  const via = url.searchParams.get("via") === "share" ? "share" : "save";

  // after(), not a bare `void`: a fire-and-forget promise in a route handler
  // can be cut off the moment the response is flushed, and an audit row that
  // silently never lands is worse than no audit at all.
  after(() => {
    void recordActivity({
      userId: staff.id,
      kind: "student_photo_downloaded",
      refId: student.id,
      payload: {
        admissionNo: student.admissionNo,
        studentName: student.fullName,
        fileName,
        via,
      },
    });
  });

  return new Response(data.stream(), {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      "Content-Disposition": attachmentDisposition(fileName),
      // The share path reads the name back off this header rather than
      // formatting its own, so a saved file and a shared file can never
      // disagree. Percent-encoded because a raw header value cannot carry
      // Devanagari.
      "X-Download-Filename": encodeURIComponent(fileName),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
