"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionCard } from "@/components/admin/section-card";
import { SavedViewsTabs } from "@/components/data-table/saved-views-tabs";
import { ActiveFilterSummary } from "@/components/shared/active-filter-summary";
import { FilterDrawerButton } from "@/components/shared/filter-drawer-button";
import { SegmentFilterGroups } from "@/components/shared/segment-filter-groups";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { MobileStudentsScreen } from "@/components/students/mobile-students-screen";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  EMPTY_SEGMENT_COUNTS,
  SEGMENT_BY_ID,
  segmentsEqual,
  serializeSegments,
  type SegmentCounts,
  type SegmentId,
} from "@/lib/segments/student-segments";
import { isPendingAdmissionNo, STUDENT_PAGE_SIZE } from "@/lib/students/constants";
import { filterStudentWorkspaceRows } from "@/lib/students/list-view-model";
import { cn } from "@/lib/utils";
import { getOfficeMetricSessionKind, recordOfficeMetric } from "@/lib/quality/office-telemetry";
import type { SavedView } from "@/lib/data-table/saved-views";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentListItem,
  StudentListSort,
  StudentRouteOption,
} from "@/lib/students/types";

import { Search, GraduationCap, Bus, UserCheck, Plus, ChevronDown } from "lucide-react";

const selectClassName =
  "appearance-none flex w-full rounded-md border border-input bg-card px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:ring-ring focus:border-ring cursor-pointer hover:border-border-strong";

// Saved-view labels are translated at render time inside StudentQuickLoad so
// the SavedViewsTabs control shows them in the user's chosen locale.
const STUDENT_BUILTIN_VIEWS: readonly SavedView<StudentQuickLoadFilters>[] = [
  { id: "active", label: "All active", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "active", segments: [], sort: "name" } },
  { id: "all", label: "All students", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "", segments: [], sort: "name" } },
  // The three questions the office asks by name. Both balance views clear
  // `status`: the point of an old balance or a leaver who still owes is that
  // the default "active" roll does not show them.
  { id: "old-balance", label: "Old fees due", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "", segments: ["oldBalanceDue"], sort: "name" } },
  { id: "overdue", label: "Overdue", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "active", segments: ["overdue"], sort: "name" } },
  { id: "left-owing", label: "Left but owing", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "", segments: ["leftOwing"], sort: "name" } },
];

/** Sort options in switcher order. */
const STUDENT_SORTS: readonly { id: StudentListSort; labelKey: "sortName" | "sortClass" }[] = [
  { id: "name", labelKey: "sortName" },
  { id: "class", labelKey: "sortClass" },
];

type StudentQuickLoadFilters = Omit<StudentListFilters, "sessionLabel">;

/** Status pills read as words, not enum values. */
// Desktop-only, and only once a row is selected -- which most visits to
// Students never do. It was a static import, so every phone load paid for a
// bar it can never show.
const BulkStudentEditBar = dynamic(
  () => import("@/components/students/bulk-student-edit-bar").then((mod) => mod.BulkStudentEditBar),
  { ssr: false },
);

const STATUS_LABEL_KEY: Record<string, string> = {
  active: "statusActive",
  inactive: "statusInactive",
  left: "statusLeft",
  graduated: "statusGraduated",
};

type StudentQuickLoadProps = {
  initialFilters: StudentListFilters;
  initialStudents: StudentListItem[];
  initialPage: number;
  initialTotalCount: number;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  canWrite: boolean;
  canCollectPayments: boolean;
  initialSegmentCounts?: SegmentCounts;
  /** Fee-profile chips read student_fee_overrides, which RLS gates on fees:view. */
  canViewFees?: boolean;
};

export function StudentQuickLoad({
  initialFilters,
  initialStudents,
  initialPage,
  initialTotalCount,
  classOptions,
  routeOptions,
  canWrite,
  canCollectPayments,
  initialSegmentCounts,
  canViewFees = true,
}: StudentQuickLoadProps) {
  const t = useTranslations("Students");
  const tSegments = useTranslations("Segments");
  const [filters, setFilters] = useState<StudentQuickLoadFilters>({
    query: initialFilters.query,
    classId: initialFilters.classId,
    transportRouteId: initialFilters.transportRouteId,
    status: initialFilters.status,
    segments: initialFilters.segments,
    sort: initialFilters.sort,
  });
  const [students, setStudents] = useState(initialStudents);
  const [segmentCounts, setSegmentCounts] = useState<SegmentCounts>(
    initialSegmentCounts ?? EMPTY_SEGMENT_COUNTS,
  );
  // The "Only with dues ✕" chip is now the `hasDues` segment rather than a
  // second, client-only filter. It used to be exactly that, which is why
  // switching it on hid rows while the header kept reporting the unfiltered
  // total. The local pass below survives only as an optimistic mirror.
  const onlyWithDues = filters.segments.includes("hasDues");
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [srBannerDismissed, setSrBannerDismissed] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Bulk-select is a desktop/office workflow only. On mobile the checkboxes
  // and the floating bulk-edit bar are hidden (they overlapped the FAB and
  // crowded the row), so selection is gated behind a desktop media query.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelection = useCallback((studentId: string) => {
    setSelectedIds((previous) =>
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId],
    );
  }, []);
  const toggleAllSelection = useCallback(
    (studentIds: ReadonlyArray<string>, shouldSelect: boolean) => {
      setSelectedIds((previous) => {
        if (shouldSelect) {
          const merged = new Set(previous);
          for (const id of studentIds) merged.add(id);
          return [...merged];
        }

        const toRemove = new Set(studentIds);
        return previous.filter((id) => !toRemove.has(id));
      });
    },
    [],
  );
  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);
  const defaultStatusIsActive = filters.status === "active";
  const hasVisibleFilters = Boolean(
    filters.query ||
      filters.classId ||
      filters.transportRouteId ||
      filters.segments.length > 0 ||
      (filters.status && !defaultStatusIsActive),
  );

  const toggleSegment = useCallback((id: SegmentId) => {
    setPage(1);
    setFilters((previous) => ({
      ...previous,
      segments: previous.segments.includes(id)
        ? previous.segments.filter((value) => value !== id)
        : [...previous.segments, id],
    }));
  }, []);

  function resetFilters() {
    setPage(1);
    setFilters({
      query: "",
      classId: "",
      transportRouteId: "",
      status: "active",
      segments: [],
      sort: "name",
    });
  }

  const setSort = useCallback((sort: StudentListSort) => {
    setPage(1);
    setFilters((previous) => ({ ...previous, sort }));
  }, []);

  const activeFilterCount = useMemo(() => {
    return (
      (filters.query ? 1 : 0) +
      (filters.classId ? 1 : 0) +
      (filters.transportRouteId ? 1 : 0) +
      (filters.status && filters.status !== "active" ? 1 : 0) +
      filters.segments.length
    );
  }, [filters]);

  // The desktop badge counts only what the drawer exclusively owns. Route and
  // status sit in the toolbar at that width and already show as pills, so
  // counting them here would report the same filter twice. The phone button
  // keeps using activeFilterCount, because its header carries only search and
  // class — everything else really is behind the drawer there.
  const drawerFilterCount = filters.segments.length;

  const activeSavedViewId = useMemo<string | null>(() => {
    for (const view of STUDENT_BUILTIN_VIEWS) {
      if (
        filters.query === view.state.query &&
        filters.classId === view.state.classId &&
        filters.transportRouteId === view.state.transportRouteId &&
        filters.status === view.state.status &&
        // `?? []` — states saved before segments existed must still apply.
        segmentsEqual(filters.segments, view.state.segments ?? [])
      ) {
        return view.id;
      }
    }
    return null;
  }, [filters]);

  function applyStudentView(view: SavedView<StudentQuickLoadFilters>) {
    setPage(1);
    // Sort is a reading preference, not part of what a view asks for — none of
    // the built-in views is about ordering — so picking one keeps whatever
    // order the reader had chosen.
    setFilters((previous) => ({
      ...view.state,
      segments: view.state.segments ?? [],
      sort: previous.sort,
    }));
  }

  const withSession = (href: string) => {
    return appendSessionParam(href, initialFilters.sessionLabel);
  };

  const params = useMemo(() => {
    const searchParams = new URLSearchParams();
    if (filters.query) searchParams.set("query", filters.query);
    if (initialFilters.sessionLabel) searchParams.set("session", initialFilters.sessionLabel);
    if (filters.classId) searchParams.set("classId", filters.classId);
    if (filters.transportRouteId) searchParams.set("transportRouteId", filters.transportRouteId);
    // "" (every status) must survive the round trip as an explicit "all":
    // omitted, the server normalizes it back to "active", which is how the
    // "All students" and "Left but owing" views silently narrowed to the roll.
    if (filters.status !== "active") searchParams.set("status", filters.status || "all");
    if (filters.segments.length > 0) searchParams.set("seg", serializeSegments(filters.segments));
    if (filters.sort !== "name") searchParams.set("sort", filters.sort);
    if (page > 1) searchParams.set("page", String(page));
    return searchParams;
  }, [filters, initialFilters.sessionLabel, page]);

  // Client-side instant filter on top of whatever the server has loaded so
  // typing in the search box never blocks on a network round-trip. The server
  // fetch (60 ms debounce above) replaces the underlying list shortly after.
  const displayedStudents = useMemo(() => {
    return filterStudentWorkspaceRows({
      students,
      query: filters.query,
      onlyWithDues,
    });
  }, [students, filters.query, onlyWithDues]);

  useEffect(() => {
    const nextUrl = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [params]);

  useEffect(() => {
    const isInitialHydration = isFirstRender.current;
    isFirstRender.current = false;
    if (isInitialHydration && !initialStudents.some((student) => student.financialLoading)) {
      return;
    }
    const controller = new AbortController();
    // Tight debounce so the list keeps up with typing without blocking each
    // keystroke on a network roundtrip. The previous 300 ms was perceptibly
    // laggy compared to the Payment Desk search.
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      setLoadError(null);
      let identitiesLoaded = isInitialHydration;
      try {
        const loadMode = async (mode: "identity" | "financial") => {
          const startedAt = performance.now();
          const requestParams = new URLSearchParams(params);
          requestParams.set("mode", mode);
          const response = await fetch(`/protected/students/index?${requestParams.toString()}`, {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });

          if (!response.ok) throw new Error(`Unable to load student ${mode} data.`);
          const payload = (await response.json()) as {
            students: StudentListItem[];
            totalCount: number;
            page: number;
            segmentCounts?: SegmentCounts;
          };
          recordOfficeMetric({
            area: "students",
            name: "students_filter_completed",
            durationMs: performance.now() - startedAt,
            outcome: "success",
            surface: mode === "identity" ? "student-identities" : "student-financials",
            sessionKind: getOfficeMetricSessionKind(initialFilters.sessionLabel),
            metadata: { resultCount: payload.students.length },
          });
          return payload;
        };

        // Both passes are independent requests over the same params, so they
        // go out together. They used to be awaited in series — identity, then
        // financial — which meant the final numbers landed two round trips
        // after every filter change instead of one. Identity still paints
        // first, because it is the faster query and it resolves first; the
        // financial pass then overwrites it with the enriched rows.
        const identityRequest = isInitialHydration ? null : loadMode("identity");
        const financialRequest = loadMode("financial");

        // Nothing must reject before both are attached, or the loser becomes an
        // unhandled rejection when the AbortController tears the pair down.
        if (identityRequest) financialRequest.catch(() => {});

        if (identityRequest) {
          const identityPayload = await identityRequest;
          identitiesLoaded = true;
          if (identityPayload.segmentCounts) setSegmentCounts(identityPayload.segmentCounts);
          setStudents(identityPayload.students);
          setTotalCount(identityPayload.totalCount);
          setPage(identityPayload.page);
        }

        const financialPayload = await financialRequest;
        setStudents(financialPayload.students);
        setTotalCount(financialPayload.totalCount);
        setPage(financialPayload.page);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error(error);
          if (!identitiesLoaded) {
            setStudents([]);
            setTotalCount(0);
          }
          setLoadError(t("studentLoadError"));
          recordOfficeMetric({
            area: "students",
            name: "students_filter_completed",
            outcome: "error",
            surface: identitiesLoaded ? "student-financials" : "student-identities",
            sessionKind: getOfficeMetricSessionKind(initialFilters.sessionLabel),
          });
        }
      } finally {
        setIsLoading(false);
      }
    }, isInitialHydration ? 0 : 60);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [initialFilters.sessionLabel, initialStudents, params, t]);

  useEffect(() => {
    function handleSlash(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        event.preventDefault();
        const searchInputs = Array.from(
          document.querySelectorAll<HTMLInputElement>("[data-student-search='true']"),
        );
        const visibleSearchInput = searchInputs.find((input) => input.offsetParent !== null);
        (visibleSearchInput ?? searchRef.current)?.focus();
      }
    }

    document.addEventListener("keydown", handleSlash);
    return () => document.removeEventListener("keydown", handleSlash);
  }, []);

  const pendingSrCount = useMemo(
    () => students.filter((student) => isPendingAdmissionNo(student.admissionNo)).length,
    [students],
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / STUDENT_PAGE_SIZE));
  const returnTo = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;

  // One pill per applied filter, restated in one line. Class and route
  // resolve to their labels rather than their ids — a uuid in a pill is not
  // a filter anyone can read.
  const filterPills = useMemo(() => {
    const pills: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (filters.query) {
      pills.push({
        key: "query",
        label: filters.query,
        onRemove: () => setFilters((previous) => ({ ...previous, query: "" })),
      });
    }
    if (filters.classId) {
      pills.push({
        key: "class",
        label: classOptions.find((option) => option.id === filters.classId)?.label ?? filters.classId,
        onRemove: () => setFilters((previous) => ({ ...previous, classId: "" })),
      });
    }
    if (filters.transportRouteId) {
      pills.push({
        key: "route",
        label: routeOptions.find((option) => option.id === filters.transportRouteId)?.label ?? filters.transportRouteId,
        onRemove: () => setFilters((previous) => ({ ...previous, transportRouteId: "" })),
      });
    }
    if (filters.status && filters.status !== "active") {
      pills.push({
        key: "status",
        label: STATUS_LABEL_KEY[filters.status]
          ? t(STATUS_LABEL_KEY[filters.status])
          : filters.status,
        onRemove: () => setFilters((previous) => ({ ...previous, status: "active" })),
      });
    }
    for (const id of filters.segments) {
      pills.push({
        key: `seg:${id}`,
        label: tSegments(SEGMENT_BY_ID[id].i18nKey),
        onRemove: () => toggleSegment(id),
      });
    }

    return pills;
  }, [classOptions, filters, routeOptions, t, tSegments, toggleSegment]);

  const activeFilterSummary = (
    <ActiveFilterSummary
      pills={filterPills}
      onClearAll={resetFilters}
      clearAllLabel={t("filterClearFilters")}
      removeAriaLabel={(label) => t("filterRemoveAria", { label })}
    />
  );

  const segmentGroups = (layout: "scroll" | "wrap") => (
    <SegmentFilterGroups
      selected={filters.segments}
      counts={segmentCounts}
      onToggle={toggleSegment}
      canViewFees={canViewFees}
      layout={layout}
    />
  );

  return (
    <>
      {/* ── Phone (mobile app v2 §STUDENTS) ────────────────────────────
          A search-first screen, not the desktop page narrowed. The state
          above is shared with the desktop twin, so there is one fetch, one
          filter set and one URL. */}
      <div className="md:hidden" data-mobile-student-search>
        <MobileStudentsScreen
          searchRef={searchRef}
          query={filters.query}
          onQueryChange={(value) => {
            setPage(1);
            setFilters((previous) => ({ ...previous, query: value }));
          }}
          classOptions={classOptions}
          classId={filters.classId}
          onClassChange={(nextClassId) => {
            setPage(1);
            setFilters((previous) => ({ ...previous, classId: nextClassId }));
          }}
          onlyWithDues={onlyWithDues}
          onToggleDues={() => toggleSegment("hasDues")}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFilterSheetOpen(true)}
          totalCount={totalCount}
          isLoading={isLoading}
          loadError={loadError}
          students={displayedStudents}
          hasFilters={hasVisibleFilters}
          canWrite={canWrite}
          canCollectPayments={canCollectPayments}
          returnTo={returnTo}
          session={initialFilters.sessionLabel}
          page={page}
          pageCount={pageCount}
          onPrevPage={() => setPage((value) => Math.max(1, value - 1))}
          onNextPage={() => setPage((value) => Math.min(pageCount, value + 1))}
          segmentRow={
            <SegmentFilterGroups
              selected={filters.segments}
              counts={segmentCounts}
              onToggle={toggleSegment}
              families={["money"]}
              canViewFees={canViewFees}
              layout="scroll"
              hideFamilyLabels
            />
          }
          activeFilterSummary={activeFilterSummary}
        />
      </div>

      <div className="hidden space-y-6 md:block">
      <SectionCard
        title={t("findStudentsTitle")}
        description={t("findStudentsDescription")}
      >
        {/* One toolbar row. The four controls used to sit in a 5-column grid,
            each with a <Label> stacked above it, and the 24 segment chips were
            expanded below a divider — together ~300px of chrome before a single
            student appeared. The labels are gone because every control already
            says what it is: the search placeholder, and the "All classes" /
            "All routes" / "All statuses" zero-option on each select. Screen
            readers get the same text through aria-label. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="query"
              ref={searchRef}
              data-student-search="true"
              aria-label={t("searchLabel")}
              value={filters.query}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, query: event.target.value }));
              }}
              placeholder={t("searchPlaceholder")}
              title={t("searchFocusHint")}
              className="peer h-9 pl-9 pr-8"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity peer-placeholder-shown:opacity-100 peer-focus:opacity-0">
              /
            </kbd>
          </div>

          <div className="relative">
            <GraduationCap className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="classId"
              aria-label={t("classLabel")}
              value={filters.classId}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, classId: event.target.value }));
              }}
              className={`${selectClassName} h-9 w-auto min-w-[9rem] pl-9`}
            >
              <option value="">{t("classAll")}</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          <div className="relative">
            <Bus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="transportRouteId"
              aria-label={t("transportRouteLabel")}
              value={filters.transportRouteId}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, transportRouteId: event.target.value }));
              }}
              className={`${selectClassName} h-9 w-auto min-w-[9rem] pl-9`}
            >
              <option value="">{t("transportRouteAll")}</option>
              {routeOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.routeCode
                    ? t("transportRouteWithCode", { label: route.label, code: route.routeCode })
                    : route.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          <div className="relative">
            <UserCheck className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="status"
              aria-label={t("statusLabel")}
              value={filters.status}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, status: event.target.value as StudentListFilters["status"] }));
              }}
              className={`${selectClassName} h-9 w-auto min-w-[8rem] pl-9`}
            >
              <option value="">{t("statusAll")}</option>
              <option value="active">{t("statusActive")}</option>
              <option value="inactive">{t("statusInactive")}</option>
              <option value="left">{t("statusLeft")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Opens the same sheet the phone's filter button drives, so there is
              one drawer and one filter set across both widths. */}
          <FilterDrawerButton
            onClick={() => setFilterSheetOpen(true)}
            expanded={filterSheetOpen}
            activeCount={drawerFilterCount}
            label={t("filterMoreFilters")}
          />
        </div>

        {hasVisibleFilters && (
          <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {activeFilterSummary}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("studentListTitle")}
        description={t("studentListDescription", {
          count: totalCount,
          refreshing: isLoading ? t("refreshingSuffix") : "",
        })}
      >
        <SavedViewsTabs
          tableKey="vpps.students.views"
          builtIns={STUDENT_BUILTIN_VIEWS}
          activeId={activeSavedViewId}
          onApply={applyStudentView}
          currentState={filters}
          className="mb-4 -mt-1"
        />
        <div className="space-y-4">
          {pendingSrCount > 0 && !srBannerDismissed ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              <span>{t("pendingSrNotice", { count: pendingSrCount })}</span>
              <button
                type="button"
                onClick={() => setSrBannerDismissed(true)}
                className="ml-auto shrink-0 text-xs underline hover:no-underline"
                aria-label={t("pendingSrDismissAria")}
              >
                {t("pendingSrDismiss")}
              </button>
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              {loadError}
            </div>
          ) : null}

          <SummaryRow sticky={false} hint={t("summaryPageOf", { page, pageCount })}>
            <SummaryCell label={t("summaryStudents")} value={isLoading ? "…" : String(totalCount)} />
            {filters.classId ? (
              <SummaryCell
                label={t("summaryClass")}
                value={classOptions.find((c) => c.id === filters.classId)?.label ?? ""}
              />
            ) : null}
          </SummaryRow>

          {isLoading ? (
            <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-3 w-16 anim-shimmer rounded bg-surface-2" />
                  <div className="h-3 w-32 anim-shimmer rounded bg-surface-2" />
                  <div className="h-3 w-12 anim-shimmer rounded bg-surface-2" />
                  <div className="ml-auto h-3 w-20 anim-shimmer rounded bg-surface-2" />
                </div>
              ))}
            </div>
          ) : (
            <StudentListTable
              students={displayedStudents}
              hasFilters={hasVisibleFilters}
              canWrite={canWrite}
              canCollectPayments={canCollectPayments}
              returnTo={returnTo}
              session={initialFilters.sessionLabel}
              selection={canWrite && isDesktop ? {
                selectedIds,
                onToggle: toggleSelection,
                onToggleAll: toggleAllSelection,
              } : undefined}
            />
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>{t("pageOf", { page, pageCount })}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {t("previous")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                {t("next")}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      </div>

      {/* Shared by both widths — the phone opens it from the header's filter
          button, the desktop from the same state. Mounted outside the
          `hidden md:block` twin, or `display:none` would swallow it. */}
          <Sheet
            open={filterSheetOpen}
            onClose={() => setFilterSheetOpen(false)}
            title={t("filterMoreFilters")}
            // A bottom sheet is the right shape on a phone and the wrong one on
            // a desk, where it would cover the list it is filtering. Same sheet,
            // same state, same content — only the edge it enters from changes.
            side={isDesktop ? "right" : "bottom"}
            size="md"
            // Instant-apply needs a live answer. The old sheet ended in
            // "Apply filters", which implied the list behind it was waiting on
            // a decision it had in fact already acted on; this one carries the
            // count the list is currently showing, and says so underneath.
            footer={
              <>
                <Button
                  type="button"
                  variant="primary"
                  className="h-[52px] w-full rounded-[15px] text-sm font-extrabold"
                  onClick={() => setFilterSheetOpen(false)}
                >
                  {t("filterShowNStudents", { count: isLoading ? "…" : totalCount })}
                </Button>
                <p className="mt-2 text-center text-[10.5px] font-semibold text-muted-foreground">
                  {t("filterInstantApplyHint")}
                </p>
              </>
            }
          >
            <div className="space-y-4 pt-2">
              {/* Sort first: it is the one control here that changes the order
                  rather than the contents, so it belongs above the filters
                  rather than lost among them. */}
              <div>
                <Label>{t("filterSortBy")}</Label>
                <div className="mt-2 flex gap-1 rounded-[14px] bg-surface-2 p-1">
                  {STUDENT_SORTS.map((option) => {
                    const active = filters.sort === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSort(option.id)}
                        className={cn(
                          "h-[38px] flex-1 rounded-[10px] text-xs font-extrabold transition-colors",
                          active
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Class as a grid, not a scrolling row. The header's chip row
                  shows one class at a time and hides the rest off-screen; four
                  across shows the whole school at once. Same `filters.classId`
                  the header writes, so the two stay in step for free. */}
              <div>
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />
                  <Label>{t("classLabel")}</Label>
                </span>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[{ id: "", label: t("classAll") }, ...classOptions].map((option) => {
                    const selected = filters.classId === option.id;
                    return (
                      <button
                        key={option.id || "all"}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setPage(1);
                          setFilters((previous) => ({
                            ...previous,
                            classId: previous.classId === option.id ? "" : option.id,
                          }));
                        }}
                        className={cn(
                          "grid h-[42px] place-items-center rounded-xl border-[1.5px] px-1 text-center text-[12.5px] font-extrabold leading-tight transition-colors",
                          selected
                            ? "border-accent bg-accent-soft text-accent-soft-foreground"
                            : "border-border bg-card text-foreground hover:bg-surface-2",
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Segments next: they answer the questions that brought the
                  user to the sheet. Route and status stay below, unchanged. */}
              {segmentGroups("wrap")}

              {/* Route browsing as chips, matching the class row above (mobile
                  v2). A native picker hides the other routes behind a tap and
                  gives no sense of how many there are; a scrolling pill row
                  shows the whole set and takes one tap to switch. Same client
                  filter state as the class chips — one source of truth. */}
              <div>
                <span className="flex items-center gap-1.5">
                  <Bus className="size-4 text-muted-foreground" aria-hidden="true" />
                  <Label>{t("transportRouteLabel")}</Label>
                </span>
                <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
                  <button
                    type="button"
                    aria-pressed={filters.transportRouteId === ""}
                    onClick={() => {
                      setPage(1);
                      setFilters((previous) => ({ ...previous, transportRouteId: "" }));
                    }}
                    className={cn(
                      "h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
                      filters.transportRouteId === ""
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground hover:bg-surface-2",
                    )}
                  >
                    {t("transportRouteAll")}
                  </button>
                  {routeOptions.map((route) => {
                    const selected = filters.transportRouteId === route.id;
                    return (
                      <button
                        key={route.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setPage(1);
                          setFilters((previous) => ({
                            ...previous,
                            transportRouteId: route.id,
                          }));
                        }}
                        className={cn(
                          "h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-card text-foreground hover:bg-surface-2",
                        )}
                      >
                        {route.routeCode
                          ? t("transportRouteWithCode", { label: route.label, code: route.routeCode })
                          : route.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="flex items-center gap-1.5">
                  <UserCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                  <Label>{t("statusLabel")}</Label>
                </span>
                {/* Four fixed options — chips rather than a picker, matching the
                    class and route rows so the whole sheet reads one way. */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["", t("statusAll")],
                      ["active", t("statusActive")],
                      ["inactive", t("statusInactive")],
                      ["left", t("statusLeft")],
                    ] as Array<[StudentListFilters["status"], string]>
                  ).map(([value, label]) => {
                    const selected = filters.status === value;
                    return (
                      <button
                        key={value || "all"}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setPage(1);
                          setFilters((previous) => ({ ...previous, status: value }));
                        }}
                        className={cn(
                          "h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-card text-foreground hover:bg-surface-2",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reset lives in the body, not beside the footer button: the
                  footer is the one thing a thumb reaches for at the end of a
                  long sheet, and a destructive control next to it is a misfire
                  waiting to happen. */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full rounded-xl text-xs font-extrabold text-accent"
                  onClick={resetFilters}
                >
                  {t("filterReset")}
                </Button>
              </div>
            </div>
          </Sheet>

      {canWrite && selectedIds.length === 0 && (
        <Link
          href={withSession(`/protected/students/new?sessionLabel=${encodeURIComponent(initialFilters.sessionLabel || "")}`)}
          /* Token-based clearance: bottom-24 was hardcoded against a 68px nav
             and overlapped it on notched devices (nav + safe-area > 96px). */
          className="fixed bottom-[calc(var(--mobile-bottom-nav-offset,0px)+0.75rem)] right-4 z-40 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 active:scale-95 transition-all md:hidden"
          aria-label={t("addNewStudentAria")}
        >
          <Plus className="size-6" />
        </Link>
      )}

      {canWrite && isDesktop && selectedIds.length > 0 ? (
        <BulkStudentEditBar
          selectedIds={selectedIds}
          classOptions={classOptions}
          routeOptions={routeOptions}
          onClearSelection={clearSelection}
        />
      ) : null}
    </>
  );
}
