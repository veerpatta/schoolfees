import { NextResponse } from "next/server";

import { commitPaymentImportRows, getPaymentImportBatchSummary } from "@/lib/payments/bulk/data";
import { PAYMENT_IMPORT_COMMIT_CHUNK_SIZE } from "@/lib/payments/bulk/types";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { revalidateAfterPaymentPosting } from "@/lib/system-sync/finance-revalidation";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-sync";

// Sequential posting of up to PAYMENT_IMPORT_COMMIT_CHUNK_SIZE rows per
// request; the client loops chunks so large batches never hit the timeout.
export const maxDuration = 60;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type RouteContext = {
  params: Promise<{ batchId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "payments:bulk")) {
    return NextResponse.json(
      { error: "You do not have permission to post bulk payments." },
      { status: 403 },
    );
  }

  try {
    const { batchId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rowIds = toStringArray(body.rowIds).slice(0, PAYMENT_IMPORT_COMMIT_CHUNK_SIZE);
    const acknowledgedRowIds = toStringArray(body.acknowledgedRowIds);

    if (rowIds.length === 0) {
      return NextResponse.json({ error: "No rows to post." }, { status: 400 });
    }

    const result = await commitPaymentImportRows({
      batchId,
      rowIds,
      acknowledgedRowIds,
      receivedBy: (staff.email as string | undefined) ?? "Bulk upload",
    });

    if (result.posted > 0) {
      const summary = await getPaymentImportBatchSummary(batchId);
      const affectedStudentIds = [
        ...new Set(
          summary.rows
            .filter((row) => row.postedAt && row.studentId)
            .map((row) => row.studentId as string),
        ),
      ];
      revalidateSessionFinance(summary.sessionLabel, affectedStudentIds);
      revalidateAfterPaymentPosting(affectedStudentIds);
      return NextResponse.json({ result, summary });
    }

    return NextResponse.json({ result, summary: await getPaymentImportBatchSummary(batchId) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to post the bulk payment rows.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
