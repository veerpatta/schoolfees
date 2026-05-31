import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import { resolveOfficeWorkbookView } from "@/lib/transactions/workbook";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { ServerTimer } from "@/lib/observability/timing";

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

function normalizePaymentMode(value: string | null) {
  const normalized = (value ?? "").trim();
  return ["cash", "upi", "bank_transfer", "cheque"].includes(normalized)
    ? normalized
    : "";
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
  const paymentMode = normalizePaymentMode(params.get("paymentMode"));
  const page = normalizePage(params.get("page"));
  const searchQuery = (params.get("query") ?? "").trim();
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
      searchQuery,
      sessionLabel: viewSession.sessionLabel,
      toDate,
      // Skip the financial enrichment pass for display — saves one DB round-trip.
      // currentOutstanding / currentTotalPaid are only needed in CSV exports.
      skipFinancials: true,
    }),
  );

  timer.flush();

  return NextResponse.json(workbook, {
    headers: {
      "cache-control": "no-store",
      "Server-Timing": timer.header(),
    },
  });
}
