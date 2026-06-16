"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EMPTY_DEFAULTER_FILTERS, type DefaulterFilters } from "@/lib/defaulters/types";

const STORAGE_KEY = "vpps.defaulters.filters.v1";
const FILTER_PARAM_NAMES = [
  "classId",
  "transportRouteId",
  "overdue",
  "prevYearDues",
  "minPendingAmount",
  "query",
] as const;

type StoredFilters = {
  classId?: string;
  transportRouteId?: string;
  overdue?: string;
  prevYearDues?: string;
  minPendingAmount?: string;
  searchQuery?: string;
};

function readStored(): StoredFilters | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFilters;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(filters: DefaulterFilters) {
  try {
    const trimmed: StoredFilters = {};
    if (filters.classId) trimmed.classId = filters.classId;
    if (filters.transportRouteId) trimmed.transportRouteId = filters.transportRouteId;
    if (filters.overdue) trimmed.overdue = filters.overdue;
    if (filters.prevYearDues) trimmed.prevYearDues = filters.prevYearDues;
    if (filters.minPendingAmount) trimmed.minPendingAmount = filters.minPendingAmount;
    if (filters.searchQuery) trimmed.searchQuery = filters.searchQuery;
    if (Object.keys(trimmed).length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // sessionStorage may be unavailable in private browsing — silent no-op.
  }
}

type Props = {
  filters: DefaulterFilters;
  sessionLabel: string;
};

/**
 * Audit 1.15 — Persist the active DefaulterFilters in sessionStorage so a
 * navigation away from the Defaulters page and back rehydrates the user's
 * last set of filter chips. sessionStorage scopes the persistence to the
 * current tab, so a logout (which closes the staff session anyway) clears
 * it implicitly without an extra listener.
 *
 * Behaviour:
 *   * On mount, if the URL has zero filter params AND sessionStorage has a
 *     stored set, navigate to the same path with the stored params applied.
 *   * Whenever the server-rendered filters are non-empty, write them back to
 *     sessionStorage so subsequent visits rehydrate them.
 */
export function DefaulterFilterRehydrator({ filters, sessionLabel }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hasUrlFilters = FILTER_PARAM_NAMES.some((name) =>
      Boolean(searchParams.get(name)),
    );

    if (!hasUrlFilters) {
      const stored = readStored();
      if (!stored) return;
      const hasStored =
        Boolean(stored.classId) ||
        Boolean(stored.transportRouteId) ||
        Boolean(stored.overdue) ||
        Boolean(stored.prevYearDues) ||
        Boolean(stored.minPendingAmount) ||
        Boolean(stored.searchQuery);
      if (!hasStored) return;

      const next = new URLSearchParams();
      next.set("session", sessionLabel);
      if (stored.classId) next.set("classId", stored.classId);
      if (stored.transportRouteId) next.set("transportRouteId", stored.transportRouteId);
      if (stored.overdue) next.set("overdue", stored.overdue);
      if (stored.prevYearDues) next.set("prevYearDues", stored.prevYearDues);
      if (stored.minPendingAmount) next.set("minPendingAmount", stored.minPendingAmount);
      if (stored.searchQuery) next.set("query", stored.searchQuery);

      router.replace(`/protected/defaulters?${next.toString()}`);
      return;
    }

    // URL has filters — sync them into storage so the next bare visit can
    // rehydrate. Defaults shouldn't be persisted.
    const isAllEmpty =
      filters.classId === EMPTY_DEFAULTER_FILTERS.classId &&
      filters.transportRouteId === EMPTY_DEFAULTER_FILTERS.transportRouteId &&
      filters.overdue === EMPTY_DEFAULTER_FILTERS.overdue &&
      filters.prevYearDues === EMPTY_DEFAULTER_FILTERS.prevYearDues &&
      filters.minPendingAmount === EMPTY_DEFAULTER_FILTERS.minPendingAmount &&
      filters.searchQuery === EMPTY_DEFAULTER_FILTERS.searchQuery;
    if (isAllEmpty) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    writeStored(filters);
  }, [filters, sessionLabel, searchParams, router]);

  return null;
}
