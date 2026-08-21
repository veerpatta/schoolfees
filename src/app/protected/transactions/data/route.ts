import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import { resolveOfficeWorkbookView } from "@/lib/transactions/workbook";
import { getAuthenticatedStaff, hasStaffPermission } from "@/platform/supabase/session";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { ServerTimer } from "@/platform/observability/timing";
import { normalizePaymentModeFilter } from "@/lib/transactions/payment-modes";
import { parseSegments } from "@/lib/segments/student-segments";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: string | null) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: string | null) {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizePage(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export async function GET(request: NextRequest) {
  // Phase 0 perf instrumentation — see lib/observability/timing.ts.
  const timer = new ServerTimer("transactions/data");
  const staff = await timer.measure("auth", () => getAuthenticatedStaff());

  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = (
    hasStaffPermission(staff, "receipts:view") ||
    hasStaffPermission(staff, "defaulters:view") ||
    hasStaffPermission(staff, "reports:view") ||
    hasStaffPermission(staff, "finance:view")
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { view } = resolveOfficeWorkbookView(params.get("view"));
  const classId = normalizeUuid(params.get("classId"));
  const routeId = normalizeUuid(params.get("routeId"));
  const fromDate = normalizeDate(params.get("fromDate"));
  const toDate = normalizeDate(params.get("toDate"));
  const paymentMode = normalizePaymentModeFilter(params.get("paymentMode"));
  const page = normalizePage(params.get("page"));
  const searchQuery = (params.get("query") ?? "").trim();
  const segments = parseSegments(params.get("seg"));
  const sessionParam = (
    params.get("session") ??
    params.get("sessionLabel") ??
    ""
  ).trim();

  const sessionCookie = await getViewSessionCookie();
  const viewSession = await timer.measure("resolveViewSession", () =>
    resolveViewSession({
      searchParamSession: sessionParam,
      cookieSession: sessionCookie,
    }),
  );

  const workbook = await timer.measure("workbook", () =>
    getOfficeWorkbookData({
      view,
      classId,
      fromDate,
      paymentMode,
      page,
      routeId,
      segments,
      searchQuery,
      sessionLabel: viewSession.sessionLabel,
      toDate,
      // Skip the financial enrichment pass for display — saves one DB round-trip.
      // currentOutstanding / currentTotalPaid are only needed in CSV exports.
      skipFinancials: true,
    }),
  );

  timer.flush();

  // Server-Timing is added only when instrumentation is enabled (preview /
  // PERF_TIMING=1); production responses stay byte-for-byte unchanged.
  //
  // `no-store` meant that toggling a filter and toggling it straight back —
  // the commonest interaction on this screen — paid a full server round trip
  // every time. `private` keeps it in the staff member's own browser and out of
  // any shared cache; 15s is short enough that a payment posted at the desk
  // still shows up on the next deliberate look, and stale-while-revalidate
  // repaints instantly while the fresh copy lands.
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
  };
  const serverTiming = timer.header();
  if (serverTiming) headers["Server-Timing"] = serverTiming;

  return NextResponse.json(workbook, { headers });
}
