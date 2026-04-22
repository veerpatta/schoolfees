import type { NextRequest } from "next/server";

import {
  buildFinanceDayBookFilename,
  getFinanceDayBookCsvData,
  normalizeFinanceDateFilter,
  serializeFinanceDayBookCsv,
} from "@/lib/finance-controls/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

export async function GET(request: NextRequest) {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!hasStaffPermission(staff, "finance:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const selectedDate = normalizeFinanceDateFilter(request.nextUrl.searchParams.get("date"));
  const csvData = await getFinanceDayBookCsvData(selectedDate);

  return new Response(
    serializeFinanceDayBookCsv({
      headers: csvData.headers,
      rows: csvData.rows,
    }),
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${buildFinanceDayBookFilename(selectedDate)}"`,
        "cache-control": "no-store",
      },
    },
  );
}
