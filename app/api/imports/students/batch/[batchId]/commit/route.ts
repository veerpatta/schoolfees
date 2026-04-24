import { NextResponse } from "next/server";

import {
  commitStudentImportBatch,
  getStudentImportBatchSummary,
} from "@/lib/import/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { revalidateCoreFinancePaths } from "@/lib/system-sync/finance-sync";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "students:write")) {
    return NextResponse.json(
      { error: "You do not have permission to commit student imports." },
      { status: 403 },
    );
  }

  const { batchId } = await context.params;

  try {
    const result = await commitStudentImportBatch(batchId);
    const summary = await getStudentImportBatchSummary(batchId);

    revalidateCoreFinancePaths(result.affectedStudentIds ?? []);

    return NextResponse.json({
      result,
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to import approved student rows.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
