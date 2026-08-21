import {
  normalizeStudentFilters,
  readerFromSearchParams,
} from "@/modules/students/domain/filter-params";
import { NextResponse } from "next/server";

import { getPaymentDeskStudentIndex } from "@/modules/payments/data/queries";
import { getStudentSegmentCounts } from "@/modules/students/data/directory";
import { STUDENT_PAGE_SIZE } from "@/modules/students/domain/constants";
import { getStudentsIdentityPage, getStudentsPage } from "@/modules/students/data/queries";
import type { StudentListFilters } from "@/modules/students/domain/types";
import { requireStaffPermission } from "@/platform/supabase/session";

function normalizeFilters(params: URLSearchParams): StudentListFilters {
  return normalizeStudentFilters(readerFromSearchParams(params));
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
  // Counts ride along with the identity pass — the same round of filter changes
  // that re-pages the list is the one that moves every chip's number, and the
  // identity pass is the one the user is already waiting on.
  const [payload, segmentCounts] = await Promise.all([
    mode === "identity"
      ? getStudentsIdentityPage(filters, { page, pageSize: STUDENT_PAGE_SIZE })
      : getStudentsPage(filters, { page, pageSize: STUDENT_PAGE_SIZE }),
    mode === "financial"
      ? Promise.resolve(null)
      : getStudentSegmentCounts({
          sessionLabel: filters.sessionLabel,
          classId: filters.classId,
          transportRouteId: filters.transportRouteId,
          query: filters.query,
          segments: filters.segments,
        }),
  ]);
  const dataMs = performance.now() - dataStartedAt;

  return NextResponse.json({
    ...payload,
    ...(segmentCounts ? { segmentCounts } : {}),
    mode: mode === "identity" ? "identity" : mode === "financial" ? "financial" : "full",
  }, {
    headers: {
      // The paymentDesk branch above has always been cacheable; the list modes
      // sent nothing, so flipping a filter off and back on — which the roll
      // screen does constantly — always paid a full round trip. `private` keeps
      // student data in the staff member's own browser and out of any shared
      // cache. 15s is short enough that a payment posted at the desk shows on
      // the next deliberate look, and stale-while-revalidate repaints instantly
      // while the fresh copy lands.
      "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      "Server-Timing": `auth;dur=${authMs.toFixed(1)}, ${mode === "identity" ? "identity" : "financial"};dur=${dataMs.toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
}
