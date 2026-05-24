/**
 * Command-palette student search.
 *
 * GET /api/command/students?q=…&session=…
 *
 * Returns up to 8 students matching the query — by full name, admission #,
 * or parent phone. Auth is gated by `requireStaffPermission("students:view")`,
 * so RLS-respecting students data clients can read this without exposing
 * anything roles can't already see in /protected/students.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getStudents } from "@/lib/students/data";
import { EMPTY_STUDENT_FILTERS } from "@/lib/students/types";
import { requireStaffPermission } from "@/lib/supabase/session";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CommandStudentHit = {
  id: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
  fatherName: string | null;
  primaryPhone: string | null;
};

export async function GET(request: NextRequest) {
  try {
    await requireStaffPermission("students:view", { onDenied: "throw" });
  } catch {
    return NextResponse.json(
      { items: [] satisfies CommandStudentHit[] },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q")?.trim() ?? "";

  if (rawQuery.length < 2) {
    return NextResponse.json({ items: [] satisfies CommandStudentHit[] });
  }

  const cookieSession = await getViewSessionCookie();
  const resolved = await resolveViewSession({ cookieSession });

  const students = await getStudents({
    ...EMPTY_STUDENT_FILTERS,
    sessionLabel: resolved.sessionLabel,
    query: rawQuery,
  });

  const items: CommandStudentHit[] = students.slice(0, 8).map((s) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    fullName: s.fullName,
    classLabel: s.classLabel,
    fatherName: null, // not on the list item; cheap secondary line only
    primaryPhone: null,
  }));

  return NextResponse.json({ items });
}
