"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { SectionCard } from "@/components/admin/section-card";
import { SavedViewsTabs } from "@/components/data-table/saved-views-tabs";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { isPendingAdmissionNo } from "@/lib/students/constants";
import { cn } from "@/lib/utils";
import type { SavedView } from "@/lib/data-table/saved-views";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
} from "@/lib/students/types";

import { Search, GraduationCap, Bus, UserCheck, X, SlidersHorizontal, Plus, ChevronDown } from "lucide-react";

const selectClassName =
  "appearance-none flex w-full rounded-md border border-input bg-card px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:ring-ring focus:border-ring cursor-pointer hover:border-border-strong";

const PAGE_SIZE = 40;

const STUDENT_BUILTIN_VIEWS: readonly SavedView<StudentQuickLoadFilters>[] = [
  { id: "active", label: "All active", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "active" } },
  { id: "all", label: "All students", builtIn: true, createdAt: 0, state: { query: "", classId: "", transportRouteId: "", status: "" } },
];

type StudentQuickLoadFilters = Omit<StudentListFilters, "sessionLabel">;

type StudentQuickLoadProps = {
  initialFilters: StudentListFilters;
  initialStudents: StudentListItem[];
  initialPage: number;
  initialTotalCount: number;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  canWrite: boolean;
  lastViewedByUser?: Record<string, string>;
};

export function StudentQuickLoad({
  initialFilters,
  initialStudents,
  initialPage,
  initialTotalCount,
  classOptions,
  routeOptions,
  canWrite,
  lastViewedByUser,
}: StudentQuickLoadProps) {
  const [filters, setFilters] = useState<StudentQuickLoadFilters>({
    query: initialFilters.query,
    classId: initialFilters.classId,
    transportRouteId: initialFilters.transportRouteId,
    status: initialFilters.status,
  });
  const [students, setStudents] = useState(initialStudents);
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [srBannerDismissed, setSrBannerDismissed] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);
  const defaultStatusIsActive = filters.status === "active";
  const hasVisibleFilters = Boolean(
    filters.query ||
      filters.classId ||
      filters.transportRouteId ||
      (filters.status && !defaultStatusIsActive),
  );

  function resetFilters() {
    setPage(1);
    setFilters({
      query: "",
      classId: "",
      transportRouteId: "",
      status: "active",
    });
  }

  const activeFilterCount = useMemo(() => {
    return (
      (filters.query ? 1 : 0) +
      (filters.classId ? 1 : 0) +
      (filters.transportRouteId ? 1 : 0) +
      (filters.status && filters.status !== "active" ? 1 : 0)
    );
  }, [filters]);

  const activeSavedViewId = useMemo<string | null>(() => {
    for (const view of STUDENT_BUILTIN_VIEWS) {
      if (
        filters.query === view.state.query &&
        filters.classId === view.state.classId &&
        filters.transportRouteId === view.state.transportRouteId &&
        filters.status === view.state.status
      ) {
        return view.id;
      }
    }
    return null;
  }, [filters]);

  function applyStudentView(view: SavedView<StudentQuickLoadFilters>) {
    setPage(1);
    setFilters(view.state);
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
    if (filters.status) searchParams.set("status", filters.status);
    if (page > 1) searchParams.set("page", String(page));
    return searchParams;
  }, [filters, initialFilters.sessionLabel, page]);

  // Client-side instant filter on top of whatever the server has loaded so
  // typing in the search box never blocks on a network round-trip. The server
  // fetch (60 ms debounce above) replaces the underlying list shortly after.
  const displayedStudents = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const haystack = `${student.fullName} ${student.admissionNo} ${student.classLabel} ${student.fatherPhone ?? ""} ${student.motherPhone ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [students, filters.query]);

  useEffect(() => {
    const nextUrl = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [params]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const controller = new AbortController();
    // Tight debounce so the list keeps up with typing without blocking each
    // keystroke on a network roundtrip. The previous 300 ms was perceptibly
    // laggy compared to the Payment Desk search.
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/protected/students/index?${params.toString()}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Unable to load students.");
        }

        const payload = (await response.json()) as {
          students: StudentListItem[];
          totalCount: number;
          page: number;
        };

        setStudents(payload.students);
        setTotalCount(payload.totalCount);
        setPage(payload.page);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error(error);
          setStudents([]);
          setTotalCount(0);
          setLoadError("Students could not be loaded for this filter. Try clearing filters or selecting another class.");
        }
      } finally {
        setIsLoading(false);
      }
    }, 60);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [params]);

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
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const returnTo = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <>
      <SectionCard
        title="Find students"
        description="Search by student name, SR no, or phone, then narrow by class, route, or status."
      >
        <div className="md:hidden space-y-3" data-mobile-student-search>
          <div>
            <Label htmlFor="query-mobile-inline">Search</Label>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                id="query-mobile-inline"
                ref={searchRef}
                data-student-search="true"
                value={filters.query}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, query: event.target.value }));
                }}
                placeholder="Student name, SR no, or phone"
                title="Press / to focus"
                className="h-11 pl-9"
              />
            </div>
          </div>

          {/* Quick filter chips — one-tap focus on common subsets. */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "has-overdue", label: "Has overdue" },
              { key: "missing-phone", label: "Missing phone" },
              { key: "left", label: "Withdrawn" },
              { key: "new", label: "New this year" },
            ].map((chip) => {
              const isActive =
                (chip.key === "left" && filters.status === "left") ||
                (chip.key === "new" && filters.status === "active" && filters.query.toLowerCase().includes("new")) ||
                false;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    if (chip.key === "left") {
                      setFilters((previous) => ({
                        ...previous,
                        status: filters.status === "left" ? "active" : "left",
                      }));
                    } else if (chip.key === "has-overdue") {
                      // Client filter via search box — server-side text search
                      // still kicks in; the chip seeds a known token recognised
                      // by the row renderer when we expand server filters.
                      setFilters((previous) => ({ ...previous, query: "overdue" }));
                    } else if (chip.key === "missing-phone") {
                      setFilters((previous) => ({ ...previous, query: "missing phone" }));
                    } else if (chip.key === "new") {
                      setFilters((previous) => ({
                        ...previous,
                        status: "active",
                        query: previous.query.includes("new") ? previous.query : `${previous.query} new`.trim(),
                      }));
                    }
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-surface-2",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div data-mobile-class-filter>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="classId-mobile-inline">Class</Label>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline underline-offset-2"
                onClick={() => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, classId: "" }));
                }}
              >
                All classes
              </button>
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {classOptions.slice(0, 10).map((classOption) => {
                const selected = filters.classId === classOption.id;

                return (
                  <button
                    key={classOption.id}
                    type="button"
                    className={cn(
                      "h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors",
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:bg-surface-2",
                    )}
                    onClick={() => {
                      setPage(1);
                      setFilters((previous) => ({
                        ...previous,
                        classId: selected ? "" : classOption.id,
                      }));
                    }}
                  >
                    {classOption.label}
                  </button>
                );
              })}
            </div>
            {classOptions.length > 10 ? (
              <div className="relative mt-2">
                <GraduationCap className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  id="classId-mobile-inline"
                  value={filters.classId}
                  onChange={(event) => {
                    setPage(1);
                    setFilters((previous) => ({ ...previous, classId: event.target.value }));
                  }}
                  className={`${selectClassName} h-10 pl-9`}
                >
                  <option value="">All classes</option>
                  {classOptions.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 flex-1 justify-center gap-2 rounded-lg font-medium"
              onClick={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal className="size-4" />
              Route and status
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {hasVisibleFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 px-3 hover:bg-surface-2 shrink-0"
              onClick={resetFilters}
            >
              Clear
            </Button>
            ) : null}
          </div>
        </div>

        <Sheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          title="Route and status"
          size="md"
        >
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="transportRouteId-mobile">Transport route</Label>
              <div className="relative mt-2">
                <Bus className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  id="transportRouteId-mobile"
                  value={filters.transportRouteId}
                  onChange={(event) => {
                    setPage(1);
                    setFilters((previous) => ({ ...previous, transportRouteId: event.target.value }));
                  }}
                  className={`${selectClassName} pl-9 h-11`}
                >
                  <option value="">All routes</option>
                  {routeOptions.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              <Label htmlFor="status-mobile">Status</Label>
              <div className="relative mt-2">
                <UserCheck className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  id="status-mobile"
                  value={filters.status}
                  onChange={(event) => {
                    setPage(1);
                    setFilters((previous) => ({ ...previous, status: event.target.value as StudentListFilters["status"] }));
                  }}
                  className={`${selectClassName} pl-9 h-11`}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="left">Withdrawn</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="pt-4 flex gap-2">
              <Button
                type="button"
                className="flex-1 h-12 text-sm font-semibold rounded-xl"
                onClick={() => setFilterSheetOpen(false)}
              >
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 px-4 text-sm font-medium rounded-xl"
                onClick={resetFilters}
              >
                Reset
              </Button>
            </div>
          </div>
        </Sheet>
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <Label htmlFor="query">Search</Label>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                id="query"
                ref={searchRef}
                data-student-search="true"
                value={filters.query}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, query: event.target.value }));
                }}
                placeholder="Student name, SR no, or phone"
                title="Press / to focus"
                className="pl-9 pr-8 h-9 peer"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground transition-opacity opacity-0 peer-placeholder-shown:opacity-100 peer-focus:opacity-0">
                /
              </kbd>
            </div>
          </div>

          <div>
            <Label htmlFor="classId">Class</Label>
            <div className="relative mt-2">
              <GraduationCap className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                id="classId"
                value={filters.classId}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, classId: event.target.value }));
                }}
                className={`${selectClassName} pl-9 h-9`}
              >
                <option value="">All classes</option>
                {classOptions.map((classOption) => (
                  <option key={classOption.id} value={classOption.id}>
                    {classOption.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <Label htmlFor="transportRouteId">Transport route</Label>
            <div className="relative mt-2">
              <Bus className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                id="transportRouteId"
                value={filters.transportRouteId}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, transportRouteId: event.target.value }));
                }}
                className={`${selectClassName} pl-9 h-9`}
              >
                <option value="">All routes</option>
                {routeOptions.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <div className="relative mt-2">
              <UserCheck className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                id="status"
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, status: event.target.value as StudentListFilters["status"] }));
                }}
                className={`${selectClassName} pl-9 h-9`}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="left">Withdrawn</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {hasVisibleFilters && (
            <div className="flex items-end gap-2 xl:col-span-5 mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 flex items-center gap-1.5 hover:bg-surface-2 border-dashed border-accent/40 text-accent hover:border-accent hover:bg-accent-soft/20 transition-all font-medium"
                onClick={() => {
                  resetFilters();
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Student list"
        description={`${totalCount} student${totalCount === 1 ? "" : "s"} found.${isLoading ? " Refreshing…" : ""}`}
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
              <span>
                {pendingSrCount} student{pendingSrCount === 1 ? "" : "s"} still have temporary SR numbers - assign
                permanent SR nos before fee collection.
              </span>
              <button
                type="button"
                onClick={() => setSrBannerDismissed(true)}
                className="ml-auto shrink-0 text-xs underline hover:no-underline"
                aria-label="Dismiss SR pending notice"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {loadError ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              {loadError}
            </div>
          ) : null}

          <SummaryRow sticky={false} hint={`Page ${page} of ${pageCount}`}>
            <SummaryCell label="Students" value={isLoading ? "…" : String(totalCount)} />
            {filters.classId ? (
              <SummaryCell
                label="Class"
                value={classOptions.find((c) => c.id === filters.classId)?.label ?? ""}
              />
            ) : null}
          </SummaryRow>

          {isLoading ? (
            <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
                  <div className="ml-auto h-3 w-20 animate-pulse rounded bg-surface-2" />
                </div>
              ))}
            </div>
          ) : (
            <StudentListTable
              students={displayedStudents}
              hasFilters={hasVisibleFilters}
              canWrite={canWrite}
              returnTo={returnTo}
              session={initialFilters.sessionLabel}
              lastViewedByUser={lastViewedByUser}
            />
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {canWrite && (
        <Link
          href={withSession(`/protected/students/new?sessionLabel=${encodeURIComponent(initialFilters.sessionLabel || "")}`)}
          className="fixed bottom-24 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 active:scale-95 transition-all md:hidden"
          aria-label="Add new student"
        >
          <Plus className="size-6" />
        </Link>
      )}
    </>
  );
}
