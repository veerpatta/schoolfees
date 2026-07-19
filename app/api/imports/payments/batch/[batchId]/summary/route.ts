import { NextResponse } from "next/server";

import { getPaymentImportBatchSummary } from "@/lib/payments/bulk/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

type RouteContext = {
  params: Promise<{ batchId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "payments:bulk")) {
    return NextResponse.json(
      { error: "You do not have permission to view bulk payment uploads." },
      { status: 403 },
    );
  }

  try {
    const { batchId } = await context.params;
    const summary = await getPaymentImportBatchSummary(batchId);
    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load the bulk payment batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
