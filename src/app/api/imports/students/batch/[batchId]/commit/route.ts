import { NextResponse } from "next/server";

import {
  commitStudentImportBatch,
  getStudentImportBatchSummary,
} from "@/modules/imports/data/queries";
import { getAuthenticatedStaff, hasStaffPermission } from "@/platform/supabase/session";
import {
  revalidateCoreFinancePaths,
  revalidateSessionFinance,
} from "@/modules/system-sync/domain/finance-sync";

// Commits at most STUDENT_IMPORT_COMMIT_CHUNK_SIZE approved rows per request
// and reports what is left, so a large file is many short requests rather than
// one that runs until the platform kills it. This export was missing entirely,
// which is how a 531-row commit ran to the 300s ceiling and died.
export const maxDuration = 60;

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
    // Committing an import adds students AND prepares their dues, so both the
    // student count and the expected-fees total on the dashboard move.
    // revalidateCoreFinancePaths busts paths and student tags but not
    // `session:{label}`, and a revalidatePath does not evict an unstable_cache
    // entry — only its tag does.
    if (summary.targetSessionLabel) {
      revalidateSessionFinance(summary.targetSessionLabel, result.affectedStudentIds ?? []);
    }

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
