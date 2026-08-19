"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useUrlFilterState } from "@/hooks/use-url-filter-state";
import { EMPTY_DEFAULTER_FILTERS, type DefaulterFilters } from "@/lib/defaulters/types";

const STORAGE_KEY = "vpps.defaulters.filters.v1";

type Props = {
  filters: DefaulterFilters;
  sessionLabel: string;
};

/**
 * Audit 1.15 — remember the follow-up filters for the tab, so leaving
 * Defaulters and coming back brings the same call list rather than the whole
 * roll.
 *
 * Defaulters is the one list here whose filters are deliberately sticky: a fee
 * collector works one class for a morning, and re-picking it after every
 * detour is the whole complaint. The other three lists are URL-only — going
 * back restores them, clicking the nav item gives a clean list — which is why
 * `sticky` is an option on the shared hook rather than its default.
 *
 * It is also the only one whose filters the SERVER reads: this screen's filter
 * bar is a form that submits, so the address bar is already right before this
 * component sees a value. Hence `commit: "none"` — there is nothing to mirror,
 * only something to remember.
 *
 * Renders nothing.
 */
export function DefaulterFilterRehydrator({ filters, sessionLabel }: Props) {
  const router = useRouter();

  const toParams = useCallback(
    (value: DefaulterFilters) => {
      const params = new URLSearchParams();
      if (sessionLabel) params.set("session", sessionLabel);
      if (value.classId) params.set("classId", value.classId);
      if (value.transportRouteId) params.set("transportRouteId", value.transportRouteId);
      if (value.overdue) params.set("overdue", value.overdue);
      if (value.prevYearDues) params.set("prevYearDues", value.prevYearDues);
      if (value.minPendingAmount) params.set("minPendingAmount", value.minPendingAmount);
      if (value.searchQuery) params.set("query", value.searchQuery);
      return params;
    },
    [sessionLabel],
  );

  const fromParams = useCallback(
    (params: URLSearchParams): DefaulterFilters => ({
      ...EMPTY_DEFAULTER_FILTERS,
      classId: params.get("classId") ?? EMPTY_DEFAULTER_FILTERS.classId,
      transportRouteId:
        params.get("transportRouteId") ?? EMPTY_DEFAULTER_FILTERS.transportRouteId,
      // Both are two-valued flags, so an unrecognised value means "off"
      // rather than passing an arbitrary string through to the query.
      overdue: params.get("overdue") === "overdue" ? "overdue" : "",
      prevYearDues: params.get("prevYearDues") === "prevYear" ? "prevYear" : "",
      minPendingAmount:
        params.get("minPendingAmount") ?? EMPTY_DEFAULTER_FILTERS.minPendingAmount,
      searchQuery: params.get("query") ?? EMPTY_DEFAULTER_FILTERS.searchQuery,
    }),
    [],
  );

  useUrlFilterState<DefaulterFilters>({
    pathname: "/protected/defaulters",
    value: filters,
    toParams,
    fromParams,
    commit: "none",
    sticky: { key: STORAGE_KEY, sessionLabel },
    onAdopt: (next, source) => {
      // Only the stored set needs an action. A URL-sourced value arrived by a
      // navigation the server has already answered.
      if (source !== "storage") return;

      const query = toParams(next).toString();
      if (!query) return;

      // `replace`, never `push`: rehydrating is restoring where the reader
      // already was, so it must not become a step the back button walks
      // through.
      router.replace(`/protected/defaulters?${query}`);
    },
  });

  return null;
}
