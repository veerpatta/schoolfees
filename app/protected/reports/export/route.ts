import type { NextRequest } from "next/server";

import {
  getReportCsvData,
  normalizeReportFilters,
  serializeCsv,
} from "@/lib/reports/data";
import {
  getAuthenticatedStaff,
  hasStaffPermission,
} from "@/lib/supabase/session";

export async function GET(request: NextRequest) {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!hasStaffPermission(staff, "reports:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const filters = normalizeReportFilters(request.nextUrl.searchParams);
  const csvData = await getReportCsvData(filters);

  return new Response(serializeCsv(csvData), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvData.filename}"`,
      "cache-control": "no-store",
    },
  });
}
