/**
 * Split out of app/protected/exports/[exportType]/route.ts, which had grown
 * to 2,182 lines around a single 1,383-line function. The route is now the
 * dispatcher it always claimed to be.
 */

import type { NextRequest } from "next/server";

import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters,
} from "@/modules/defaulters/domain/types";
export const DEFAULTER_FILTER_PARAMS = [
  "classId",
  "transportRouteId",
  "overdue",
  "prevYearDues",
  "minPendingAmount",
  "query",
] as const;

export function hasDefaulterFilterParams(request: NextRequest): boolean {
  return DEFAULTER_FILTER_PARAMS.some((name) =>
    (request.nextUrl.searchParams.get(name) ?? "").trim().length > 0,
  );
}

export function parseDefaulterFiltersFromQuery(request: NextRequest): DefaulterFilters {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const get = (key: string) => (request.nextUrl.searchParams.get(key) ?? "").trim();

  const rawClassId = get("classId");
  const rawRouteId = get("transportRouteId");
  const rawOverdue = get("overdue");
  const rawPrevYearDues = get("prevYearDues");
  const rawMinPending = get("minPendingAmount");
  const rawQuery = get("query");

  return {
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_DEFAULTER_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_DEFAULTER_FILTERS.transportRouteId,
    overdue: rawOverdue === "overdue" ? "overdue" : EMPTY_DEFAULTER_FILTERS.overdue,
    prevYearDues:
      rawPrevYearDues === "prevYear" ? "prevYear" : EMPTY_DEFAULTER_FILTERS.prevYearDues,
    minPendingAmount: /^\d+$/.test(rawMinPending)
      ? rawMinPending
      : EMPTY_DEFAULTER_FILTERS.minPendingAmount,
    searchQuery: rawQuery.slice(0, 80) || EMPTY_DEFAULTER_FILTERS.searchQuery,
  };
}
