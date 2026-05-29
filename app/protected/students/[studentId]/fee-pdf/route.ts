import type { NextRequest } from "next/server";

import { renderFeeStatementPdf, toFeePdfStudent } from "@/lib/students/fee-statement-pdf";
import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  await requireStaffPermission("students:view");
  const { studentId } = await params;

  const workspace = await getStudentWorkspaceData(studentId);
  const pdfStudent = toFeePdfStudent(workspace);

  if (!pdfStudent) {
    return new Response("Fee statement is not available for this student yet.", { status: 404 });
  }

  const sessionLabel = workspace.financialSnapshot?.policy.academicSessionLabel ?? "";

  try {
    const buffer = await renderFeeStatementPdf({
      students: [pdfStudent],
      sessionLabel,
      title: `Fee statement: ${pdfStudent.fullName}`,
    });

    const fileName = `fee-statement-${(pdfStudent.admissionNo || studentId).replace(/[^a-z0-9-]/gi, "_")}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[fee-pdf] render failed for student", studentId, error);
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Could not generate the fee PDF: ${detail}`, { status: 500 });
  }
}
