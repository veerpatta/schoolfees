import { NextResponse } from "next/server";

import { STUDENT_STATUSES } from "@/lib/students/constants";
import { getStudentsPage } from "@/lib/students/data";
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
  const rawSessionLabel = params.get("sessionLabel")?.trim() ?? "";

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
  await requireStaffPermission("students:view");

  const { searchParams } = new URL(request.url);
  const filters = normalizeFilters(searchParams);
  const page = normalizePage(searchParams.get("page"));
  const payload = await getStudentsPage(filters, { page, pageSize: 40 });

  return NextResponse.json(payload);
}
