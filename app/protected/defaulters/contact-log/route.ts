import { NextResponse } from "next/server";

import { getStudentContactLog } from "@/lib/defaulters/contacts";
import { requireStaffPermission } from "@/lib/supabase/session";

/**
 * GET /protected/defaulters/contact-log?studentId=<uuid>&sessionLabel=<label>
 * Returns the recent contact log entries for a student in a given session.
 */
export async function GET(request: Request) {
  try {
    await requireStaffPermission("defaulters:view");
  } catch {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId")?.trim() ?? "";
  const sessionLabel = url.searchParams.get("sessionLabel")?.trim() ?? "";

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(studentId)) {
    return NextResponse.json({ error: "invalid studentId" }, { status: 400 });
  }
  if (!sessionLabel) {
    return NextResponse.json({ error: "missing sessionLabel" }, { status: 400 });
  }

  const entries = await getStudentContactLog(studentId, sessionLabel, { limit: 25 });
  return NextResponse.json({ entries });
}
