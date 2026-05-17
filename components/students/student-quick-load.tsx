"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isPendingAdmissionNo } from "@/lib/students/constants";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
} from "@/lib/students/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PAGE_SIZE = 40;

type StudentQuickLoadFilters = Omit<StudentListFilters, "sessionLabel">;

type StudentQuickLoadProps = {
  initialFilters: StudentListFilters;
  initialStudents: StudentListItem[];
  initialPage: number;
  initialTotalCount: number;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  canWrite: boolean;
};

export function StudentQuickLoad({
  initialFilters,
  initialStudents,
  initialPage,
  initialTotalCount,
  classOptions,
  routeOptions,
  canWrite,
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
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const nextUrl = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
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
    }, 300);

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

  useEffect(() => {
    setSrBannerDismissed(false);
  }, [students]);

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
        <details className="md:hidden">
          <summary className="cursor-pointer rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground">
            Open filters
          </summary>
          <div className="mt-3 grid gap-3">
            <div>
              <Label htmlFor="query">Search</Label>
              <Input
                id="query"
                data-student-search="true"
                value={filters.query}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, query: event.target.value }));
                }}
                placeholder="Student name, SR no, or phone"
                title="Press / to focus"
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="classId-mobile">Class</Label>
                <select
                  id="classId-mobile"
                  value={filters.classId}
                  onChange={(event) => {
                    setPage(1);
                    setFilters((previous) => ({ ...previous, classId: event.target.value }));
                  }}
                  className={`${selectClassName} mt-2`}
                >
                  <option value="">All classes</option>
                  {classOptions.map((classOption) => (
                    <option key={classOption.id} value={classOption.id}>
                      {classOption.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="status-mobile">Status</Label>
                <select
                  id="status-mobile"
                  value={filters.status}
                  onChange={(event) => {
                    setPage(1);
                    setFilters((previous) => ({ ...previous, status: event.target.value as StudentListFilters["status"] }));
                  }}
                  className={`${selectClassName} mt-2`}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>
            </div>
          </div>
        </details>
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <Label htmlFor="query">Search</Label>
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
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="classId">Class</Label>
            <select
              id="classId"
              value={filters.classId}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, classId: event.target.value }));
              }}
              className={`${selectClassName} mt-2`}
            >
              <option value="">All classes</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="transportRouteId">Transport route</Label>
            <select
              id="transportRouteId"
              value={filters.transportRouteId}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, transportRouteId: event.target.value }));
              }}
              className={`${selectClassName} mt-2`}
            >
              <option value="">All routes</option>
              {routeOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={filters.status}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, status: event.target.value as StudentListFilters["status"] }));
              }}
              className={`${selectClassName} mt-2`}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          <div className="flex items-end gap-2 xl:col-span-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPage(1);
                setFilters({
                  query: "",
                  classId: "",
                  transportRouteId: "",
                  status: "",
                });
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Student list"
        description={`${totalCount} student${totalCount === 1 ? "" : "s"} found.${isLoading ? " Refreshing…" : ""}`}
      >
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

          <div className="flex items-center justify-between py-1">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                "Loading..."
              ) : filters.classId ? (
                <>
                  Showing <span className="font-medium text-foreground">{totalCount}</span> students in{" "}
                  <span className="font-medium text-foreground">
                    {classOptions.find((classOption) => classOption.id === filters.classId)?.label ?? "selected class"}
                  </span>
                </>
              ) : (
                <>
                  Showing <span className="font-medium text-foreground">{totalCount}</span> students
                </>
              )}
            </p>
          </div>

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
              students={students}
              hasFilters={Boolean(filters.query || filters.classId || filters.transportRouteId || filters.status)}
              canWrite={canWrite}
              returnTo={returnTo}
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
    </>
  );
}
