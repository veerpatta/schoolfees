import { NextResponse } from "next/server";

import {
  createStudentImportBatch,
  getStudentImportBatchSummary,
} from "@/lib/import/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

function getImportMode(value: FormDataEntryValue | null) {
  return value === "update" ? "update" : "add";
}

export async function POST(request: Request) {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "students:write")) {
    return NextResponse.json(
      { error: "You do not have permission to upload student imports." },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("importFile");
    const mode = getImportMode(formData.get("mode"));
    const sessionLabelRaw = formData.get("sessionLabel");
    const sessionLabel =
      typeof sessionLabelRaw === "string" && sessionLabelRaw.trim()
        ? sessionLabelRaw.trim()
        : null;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please choose a CSV or XLSX file to upload." },
        { status: 400 },
      );
    }

    const batch = await createStudentImportBatch(file, mode, sessionLabel);
    const summary = await getStudentImportBatchSummary(batch.batchId);

    return NextResponse.json({
      batchId: batch.batchId,
      autoValidated: batch.autoValidated,
      targetSessionLabel: batch.targetSessionLabel,
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload student import file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
