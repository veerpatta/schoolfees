import { NextResponse } from "next/server";

import { getStudentFeeBreakdown } from "@/lib/defaulters/fee-breakdown";
import { requireStaffPermission } from "@/lib/supabase/session";

/**
 * GET /protected/defaulters/fee-breakdown?studentId=<uuid>&sessionLabel=<label>
 * Returns the per-student fee breakdown (installments + recent receipts +
 * headline totals) for the Worklist Drawer panel.
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

  try {
    const breakdown = await getStudentFeeBreakdown(studentId, sessionLabel);
    if (!breakdown) {
      return NextResponse.json({ breakdown: null });
    }
    return NextResponse.json({ breakdown });
  } catch (caught) {
    // Audit 1.28 — surface enough context for the Worklist Drawer to render
    // an actionable error rather than a generic "Could not load…". When
    // Phase 2's lib/observability/log lands on main, swap console.error for
    // logError("defaulters.fee_breakdown.failed", { studentId, cause: caught }).
    console.error("[fee-breakdown] route failed", { studentId, caught });
    return NextResponse.json(
      {
        error: "Could not load fee breakdown",
        studentId,
        errorCode: "FEE_BREAKDOWN_FAILED",
      },
      { status: 500 },
    );
  }
}
