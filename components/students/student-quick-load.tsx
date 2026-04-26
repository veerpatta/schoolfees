"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
  StudentSessionOption,
} from "@/lib/students/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PAGE_SIZE = 40;

type StudentQuickLoadProps = {
  initialFilters: StudentListFilters;
  initialStudents: StudentListItem[];
  initialPage: number;
  initialTotalCount: number;
  sessionOptions: StudentSessionOption[];
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  canWrite: boolean;
};

export function StudentQuickLoad({
  initialFilters,
  initialStudents,
  initialPage,
  initialTotalCount,
  sessionOptions,
  classOptions,
  routeOptions,
  canWrite,
}: StudentQuickLoadProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [students, setStudents] = useState(initialStudents);
  const [page, setPage] = useState(initialPage);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);

  const params = useMemo(() => {
    const searchParams = new URLSearchParams();
    if (filters.query) searchParams.set("query", filters.query);
    if (filters.sessionLabel) searchParams.set("sessionLabel", filters.sessionLabel);
    if (filters.classId) searchParams.set("classId", filters.classId);
    if (filters.transportRouteId) searchParams.set("transportRouteId", filters.transportRouteId);
    if (filters.status) searchParams.set("status", filters.status);
    if (page > 1) searchParams.set("page", String(page));
    return searchParams;
  }, [filters, page]);

  useEffect(() => {
    const nextUrl = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
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

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const returnTo = `/protected/students${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <>
      <SectionCard
        title="Find students"
        description="Search by student name, SR no, or phone, then narrow by class, route, or status."
      >
        <details className="md:hidden">
          <summary className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            Open filters
          </summary>
          <div className="mt-3 grid gap-3">
            <div>
              <Label htmlFor="query">Search</Label>
              <Input
                id="query"
                value={filters.query}
                onChange={(event) => {
                  setPage(1);
                  setFilters((previous) => ({ ...previous, query: event.target.value }));
                }}
                placeholder="Student name, SR no, or phone"
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
        <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Label htmlFor="query">Search</Label>
            <Input
              id="query"
              value={filters.query}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, query: event.target.value }));
              }}
              placeholder="Student name, SR no, or phone"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="sessionLabel">Academic year</Label>
            <select
              id="sessionLabel"
              value={filters.sessionLabel}
              onChange={(event) => {
                setPage(1);
                setFilters((previous) => ({ ...previous, sessionLabel: event.target.value, classId: "" }));
              }}
              className={`${selectClassName} mt-2`}
            >
              {sessionOptions.map((sessionOption) => (
                <option key={sessionOption.value} value={sessionOption.value}>
                  {sessionOption.label}
                </option>
              ))}
            </select>
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

          <div className="flex items-end gap-2 xl:col-span-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPage(1);
                setFilters({
                  query: "",
                  sessionLabel: sessionOptions[0]?.value ?? "",
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
          <StudentListTable
            students={students}
            hasFilters={Boolean(filters.query || filters.classId || filters.transportRouteId || filters.status)}
            canWrite={canWrite}
            returnTo={returnTo}
          />

          <div className="flex items-center justify-between text-sm text-slate-600">
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
