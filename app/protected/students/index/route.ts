import { NextResponse } from "next/server";

import { getPaymentDeskStudentIndex } from "@/lib/payments/data";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import { getStudentsIdentityPage, getStudentsPage } from "@/lib/students/data";
import { EMPTY_STUDENT_FILTERS, type StudentListFilters } from "@/lib/students/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function normalizeFilters(params: URLSearchParams): StudentListFilters {
  const validStatuses = new Set<string>(
    STUDENT_STATUSES.map((statusOption) => statusOption.value),
  );
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const rawClassId = params.get("classId")?.trim() ?? "";
  const rawRouteId = params.get("transportRouteId")?.trim() ?? "";
  const rawStatus = params.get("status")?.trim() ?? "";
  const rawSessionLabel =
    (params.get("session") ?? params.get("sessionLabel"))?.trim() ?? "";

  return {
    query: params.get("query")?.trim() ?? EMPTY_STUDENT_FILTERS.query,
    sessionLabel: rawSessionLabel || EMPTY_STUDENT_FILTERS.sessionLabel,
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_STUDENT_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_STUDENT_FILTERS.transportRouteId,
    status: validStatuses.has(rawStatus)
      ? (rawStatus as StudentListFilters["status"])
      : EMPTY_STUDENT_FILTERS.status,
  };
}

function normalizePage(value: string | null) {
  if (!value) return 1;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get("purpose")?.trim() ?? "";

  if (purpose === "paymentDesk") {
    await requireStaffPermission("payments:view");
    const authMs = performance.now() - startedAt;
    const dataStartedAt = performance.now();
    const students = await getPaymentDeskStudentIndex({
      sessionLabel: searchParams.get("session")?.trim() || undefined,
    });
    const dataMs = performance.now() - dataStartedAt;

    return Response.json(
      { students },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
          "Server-Timing": `auth;dur=${authMs.toFixed(1)}, index;dur=${dataMs.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
        },
      },
    );
  }

  await requireStaffPermission("students:view");
  const authMs = performance.now() - startedAt;

  const filters = normalizeFilters(searchParams);
  const page = normalizePage(searchParams.get("page"));
  const mode = searchParams.get("mode")?.trim();
  const dataStartedAt = performance.now();
  const payload = mode === "identity"
    ? await getStudentsIdentityPage(filters, { page, pageSize: 40 })
    : await getStudentsPage(filters, { page, pageSize: 40 });
  const dataMs = performance.now() - dataStartedAt;

  return NextResponse.json({
    ...payload,
    mode: mode === "identity" ? "identity" : mode === "financial" ? "financial" : "full",
  }, {
    headers: {
      "Server-Timing": `auth;dur=${authMs.toFixed(1)}, ${mode === "identity" ? "identity" : "financial"};dur=${dataMs.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
}
