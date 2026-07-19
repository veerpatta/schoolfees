import { NextResponse } from "next/server";

import { createPaymentImportBatch } from "@/lib/payments/bulk/data";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

export const maxDuration = 60;

export async function POST(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "payments:bulk")) {
    return NextResponse.json(
      { error: "You do not have permission to upload bulk payments." },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("importFile");
    const sessionLabelRaw = formData.get("sessionLabel");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please choose a CSV or XLSX file to upload." },
        { status: 400 },
      );
    }
    if (typeof sessionLabelRaw !== "string" || !sessionLabelRaw.trim()) {
      return NextResponse.json({ error: "Academic session is required." }, { status: 400 });
    }

    const sessionLabel = parseAcademicSessionLabel(sessionLabelRaw.trim()).normalizedLabel;
    const summary = await createPaymentImportBatch(file, sessionLabel);

    return NextResponse.json({ batchId: summary.batchId, summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload the bulk payment file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
