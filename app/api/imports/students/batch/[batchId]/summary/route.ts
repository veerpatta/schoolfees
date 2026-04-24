import { NextResponse } from "next/server";

import { getStudentImportBatchSummary } from "@/lib/import/data";
import { getAuthenticatedStaff, hasAnyStaffPermission } from "@/lib/supabase/session";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasAnyStaffPermission(staff, ["imports:view", "students:write"])) {
    return NextResponse.json(
      { error: "You do not have permission to view import batch summaries." },
      { status: 403 },
    );
  }

  const { batchId } = await context.params;
  try {
    const summary = await getStudentImportBatchSummary(batchId);
    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load import batch summary.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
