import type { NextRequest } from "next/server";

import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { requireStaffPermission } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await params;
  try {
    await requireStaffPermission("students:view");

    const workspace = await getStudentWorkspaceData(studentId, { skipCache: true });
    // Dynamic import so any module-init failure surfaces here (caught below)
    // instead of crashing the function at load time with an opaque 500.
    const { renderFeeStatementPdf, toFeePdfStudent } = await import(
      "@/lib/students/fee-statement-pdf"
    );
    const pdfStudent = toFeePdfStudent(workspace);

    if (!pdfStudent) {
      return new Response("Fee statement is not available for this student yet.", { status: 404 });
    }

    const sessionLabel = workspace.financialSnapshot?.policy.academicSessionLabel ?? "";
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
    console.error("[fee-pdf] failed for student", studentId, error);
    return new Response("Could not generate the fee PDF. Please try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
