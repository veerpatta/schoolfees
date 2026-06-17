import type { NextRequest } from "next/server";

import {
  buildFinanceDayBookFilename,
  getFinanceDayBookCsvData,
  normalizeFinanceDateFilter,
  serializeFinanceDayBookCsv,
} from "@/lib/finance-controls/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { resolveViewSession } from "@/lib/session/resolver";

export async function GET(request: NextRequest) {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!hasStaffPermission(staff, "finance:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const selectedDate = normalizeFinanceDateFilter(request.nextUrl.searchParams.get("date"));
  const urlSession = request.nextUrl.searchParams.get("session");
  const cookieSession = request.cookies.get("vpps_view_session")?.value;
  const viewSession = await resolveViewSession({
    searchParamSession: urlSession,
    cookieSession,
  });
  const csvData = await getFinanceDayBookCsvData(selectedDate, viewSession.sessionLabel);

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
