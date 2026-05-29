import type { NextRequest } from "next/server";

import { renderFeeStatementPdf, toFeePdfStudent } from "@/lib/students/fee-statement-pdf";
import { getFamilyWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ familyGroupId: string }> },
) {
  await requireStaffPermission("students:view");
  const { familyGroupId } = await params;

  const { familyGroup, students } = await getFamilyWorkspaceData(familyGroupId);
  const pdfStudents = students
    .map((workspace) => toFeePdfStudent(workspace))
    .filter((student): student is NonNullable<typeof student> => student !== null);

  if (pdfStudents.length === 0) {
    return new Response("No printable fee data for this family.", { status: 404 });
  }

  const sessionLabel = familyGroup.academic_session_label ?? "";

  try {
    const buffer = await renderFeeStatementPdf({
      students: pdfStudents,
      sessionLabel,
      title: "Family fee statement",
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="family-fee-statement-${familyGroupId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[family-fee-pdf] render failed for family", familyGroupId, error);
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Could not generate the family fee PDF: ${detail}`, { status: 500 });
  }
}
