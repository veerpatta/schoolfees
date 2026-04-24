import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ClassTabs } from "@/components/office/office-ui";
import { StudentFilters } from "@/components/students/student-filters";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STUDENT_IMPORT_FIELDS, STUDENT_STATUSES } from "@/lib/students/constants";
import { getStudentFormOptions, getStudents } from "@/lib/students/data";
import {
  EMPTY_STUDENT_FILTERS,
  type StudentListFilters,
} from "@/lib/students/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type StudentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    classId?: string;
    transportRouteId?: string;
    status?: StudentListFilters["status"];
  }>;
};

function normalizeFilters(
  params: Awaited<StudentsPageProps["searchParams"]>,
): StudentListFilters {
  const validStatuses = new Set<string>(
    STUDENT_STATUSES.map((statusOption) => statusOption.value),
  );
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const rawClassId = params?.classId?.trim() ?? "";
  const rawRouteId = params?.transportRouteId?.trim() ?? "";
  const rawStatus = params?.status?.trim() ?? "";

  return {
    query: params?.query?.trim() ?? EMPTY_STUDENT_FILTERS.query,
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_STUDENT_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_STUDENT_FILTERS.transportRouteId,
    status: validStatuses.has(rawStatus)
      ? (rawStatus as StudentListFilters["status"])
      : EMPTY_STUDENT_FILTERS.status,
  };
}

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = normalizeFilters(resolvedSearchParams);
  const [{ classOptions, routeOptions }, students] = await Promise.all([
    getStudentFormOptions(),
    getStudents(filters),
  ]);
  const canWriteStudents = hasStaffPermission(staff, "students:write");

  const hasFilters = Boolean(
    filters.query || filters.classId || filters.transportRouteId || filters.status,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Student Master + Fee Profile"
        description="Use Students for student entry, class/route assignment, student-specific fee profiles, special cases, and spreadsheet add/update work."
        actions={
          canWriteStudents ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/protected/students/new">Add student</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/protected/imports">Bulk upload / update</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/protected/imports/template">Download template</Link>
              </Button>
            </div>
          ) : (
            <StatusBadge label="Read-only access" tone="warning" />
          )
        }
      />

      <SectionCard
        title="Student workspace boundary"
        description="Fee Setup remains the only place for school-wide defaults. Students is for student-specific records and overrides."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">Student Master</p>
            <p className="mt-1 text-emerald-800">Name, SR no, class, route, contact, notes, and record status.</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="font-semibold">Fee Profile</p>
            <p className="mt-1 text-sky-800">New/existing, student overrides, discount, waiver, and special adjustments.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Bulk Work</p>
            <p className="mt-1">CSV/XLSX uploads are staged, validated, reviewed, and linked back to import batches.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Before real data entry, use dummy students such as Test Student 001 and SR numbers like
          TEST-SR-001. Do not post test payments against real student records.
        </div>
      </SectionCard>

      <SectionCard
        title="Find students"
        description="Use class shortcuts and filters together so the list updates from one place."
      >
        <div className="space-y-4">
          <ClassTabs
            basePath="/protected/students"
            classOptions={classOptions}
            activeClassId={filters.classId}
            query={{
              query: filters.query || null,
              transportRouteId: filters.transportRouteId || null,
              status: filters.status || null,
            }}
          />
          <StudentFilters
            filters={filters}
            classOptions={classOptions}
            routeOptions={routeOptions}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Student list"
        description={`${students.length} record${students.length === 1 ? "" : "s"} found`}
      >
        <StudentListTable
          students={students}
          hasFilters={hasFilters}
          canWrite={canWriteStudents}
        />
      </SectionCard>

      <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Import-ready field map
        </summary>
        <div className="border-t border-slate-200 p-4">
          <p className="mb-4 text-sm text-slate-600">
            These normalized keys and aliases match the CSV/XLSX workbook import flow.
          </p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {STUDENT_IMPORT_FIELDS.map((field) => (
              <div key={field.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                <p className="mt-1 text-xs text-slate-600">Key: {field.key}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {field.aliases.map((alias) => (
                    <Badge key={`${field.key}-${alias}`} variant="outline" className="text-[11px]">
                      {alias}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
