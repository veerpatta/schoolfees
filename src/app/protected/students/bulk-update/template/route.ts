import { NextResponse } from "next/server";

import { getActiveSessionLabel } from "@/platform/session/active";
import {
  buildBulkUpdateLookups,
  loadBulkUpdateSnapshot,
} from "@/lib/students/bulk-update/data";
import { resolveBulkUpdateFields } from "@/lib/students/bulk-update/fields";
import {
  buildBulkUpdateTemplateWorkbook,
  buildBulkUpdateValidations,
  workbookToBuffer,
} from "@/lib/students/bulk-update/workbook";
import { getAuthenticatedStaff, hasStaffPermission } from "@/platform/supabase/session";

import { withDownloadToken } from "@/platform/helpers/download-token";
export const maxDuration = 60;

export async function GET(request: Request) {
  const staff = await getAuthenticatedStaff();

  if (!staff || !hasStaffPermission(staff, "students:write")) {
    return NextResponse.json(
      { error: "You do not have permission to bulk update students." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const classIds = url.searchParams.getAll("classId").filter(Boolean);
  const fieldKeys = url.searchParams.getAll("field").filter(Boolean);

  if (classIds.length === 0) {
    return NextResponse.json({ error: "Choose at least one class." }, { status: 400 });
  }

  const fields = resolveBulkUpdateFields(fieldKeys);

  if (fields.length === 0) {
    return NextResponse.json({ error: "Choose at least one field." }, { status: 400 });
  }

  try {
    const sessionLabel = await getActiveSessionLabel();
    const { classes, routes, resolver } = await buildBulkUpdateLookups(sessionLabel);

    // Query-string class ids are untrusted: keep them inside the active session
    // so a crafted link cannot export another year's students.
    const selected = classes.filter((item) => classIds.includes(item.classId));

    if (selected.length === 0) {
      return NextResponse.json(
        { error: `Those classes are not part of ${sessionLabel}.` },
        { status: 400 },
      );
    }

    const students = await loadBulkUpdateSnapshot(selected.map((item) => item.classId));

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No students were found in the selected classes." },
        { status: 400 },
      );
    }

    const selectedClassLabels = selected.map((item) => item.label);

    // Dropdowns list every class/route in the session, not just the selected
    // ones — the point is to move a student to another class without typing.
    const allClassLabels = classes.map((item) => item.label);
    const allRouteLabels = routes.map((item) => item.label);

    const workbook = await buildBulkUpdateTemplateWorkbook({
      students,
      fields,
      labels: {
        classLabelById: resolver.classLabelById,
        routeLabelById: resolver.routeLabelById,
      },
      classLabels: selectedClassLabels,
      allClassLabels,
      allRouteLabels,
    });

    const buffer = await workbookToBuffer(
      workbook,
      buildBulkUpdateValidations({
        fields,
        classCount: allClassLabels.length,
        routeCount: allRouteLabels.length,
        rowCount: students.length,
      }),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `bulk-update-${sessionLabel}-${stamp}.xlsx`;

    return withDownloadToken(
      request,
      new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to build the bulk update template.",
      },
      { status: 400 },
    );
  }
}
