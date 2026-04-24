import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ClassTabs } from "@/components/office/office-ui";
import { StudentBulkImportDialogTrigger } from "@/components/students/student-bulk-import-dialog";
import { StudentFilters } from "@/components/students/student-filters";
import { StudentListTable } from "@/components/students/student-list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STUDENT_IMPORT_FIELDS, STUDENT_STATUSES } from "@/lib/students/constants";
import {
  getClassOptionsForSession,
  getStudentFormOptions,
  getStudents,
} from "@/lib/students/data";
import {
  EMPTY_STUDENT_FILTERS,
  type StudentClassOption,
  type StudentListFilters,
  type StudentListItem,
  type StudentRouteOption,
  type StudentSessionOption,
} from "@/lib/students/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type StudentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    sessionLabel?: string;
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
  const rawSessionLabel = params?.sessionLabel?.trim() ?? "";

  return {
    query: params?.query?.trim() ?? EMPTY_STUDENT_FILTERS.query,
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

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedFilters = normalizeFilters(resolvedSearchParams);
  let allClassOptions: StudentClassOption[] = [];
  let routeOptions: StudentRouteOption[] = [];
  let sessionOptions: StudentSessionOption[] = [];
  let resolvedSessionLabel = parsedFilters.sessionLabel || "";
  let formLoadWarning: string | null = null;

  try {
    const formOptions = await getStudentFormOptions({
      sessionLabel: parsedFilters.sessionLabel || null,
    });

    allClassOptions = formOptions.allClassOptions;
    routeOptions = formOptions.routeOptions;
    sessionOptions = formOptions.sessionOptions;
    resolvedSessionLabel = formOptions.resolvedSessionLabel;
  } catch (error) {
    formLoadWarning =
      error instanceof Error
        ? `Student filters could not be loaded safely: ${error.message}`
        : "Student filters could not be loaded safely.";
    sessionOptions = parsedFilters.sessionLabel
      ? [{ value: parsedFilters.sessionLabel, label: parsedFilters.sessionLabel }]
      : [];
  }

  const filters = {
    ...parsedFilters,
    sessionLabel:
      parsedFilters.sessionLabel || resolvedSessionLabel || sessionOptions[0]?.value || "",
  };
  const classOptions = getClassOptionsForSession(allClassOptions, filters.sessionLabel);
  const validClassIdSet = new Set(classOptions.map((row) => row.id));
  if (filters.classId && !validClassIdSet.has(filters.classId)) {
    filters.classId = EMPTY_STUDENT_FILTERS.classId;
  }
  let students: StudentListItem[] = [];
  let studentLoadWarning: string | null = null;

  try {
    students = await getStudents(filters);
  } catch (error) {
    studentLoadWarning =
      error instanceof Error
        ? `Students could not be loaded safely: ${error.message}`
        : "Students could not be loaded safely.";
  }
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const loadWarnings = [formLoadWarning, studentLoadWarning].filter(
    (value): value is string => Boolean(value),
  );

  const hasFilters = Boolean(
    filters.query ||
      filters.classId ||
      filters.transportRouteId ||
      filters.status ||
      Boolean(
        filters.sessionLabel &&
          resolvedSessionLabel &&
          filters.sessionLabel !== resolvedSessionLabel,
      ),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Students"
        description="Add students, manage student details, assign class/transport, and handle student-specific fee exceptions."
        actions={
          canWriteStudents ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/protected/students/new?sessionLabel=${encodeURIComponent(filters.sessionLabel)}`}>
                  Add Student
                </Link>
              </Button>
              <StudentBulkImportDialogTrigger
                sessionOptions={sessionOptions}
                defaultSessionLabel={filters.sessionLabel}
              />
              <Button asChild variant="outline">
                <Link href="/protected/imports?mode=add">Open Advanced Import History</Link>
              </Button>
            </div>
          ) : (
            <StatusBadge label="Read-only access" tone="warning" />
          )
        }
      />

      <SectionCard
        title="Find students"
        description="Search by student name, SR no, or phone, then narrow by class, route, or status."
      >
        <div className="space-y-4">
          <ClassTabs
            basePath="/protected/students"
            classOptions={classOptions}
            activeClassId={filters.classId}
            query={{
              query: filters.query || null,
              sessionLabel: filters.sessionLabel || null,
              transportRouteId: filters.transportRouteId || null,
              status: filters.status || null,
            }}
          />
          <StudentFilters
            filters={filters}
            sessionOptions={sessionOptions}
            classOptions={classOptions}
            routeOptions={routeOptions}
          />
        </div>
      </SectionCard>

      {loadWarnings.length > 0 ? (
        <SectionCard
          title="Load warning"
          description="Some student workspace data could not be loaded safely. The page is still available."
        >
          <div className="space-y-2 text-sm text-amber-900">
            {loadWarnings.map((warning) => (
              <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                {warning}
              </p>
            ))}
          </div>
        </SectionCard>
      ) : null}

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
          Advanced import field map
        </summary>
        <div className="border-t border-slate-200 p-4">
          <p className="mb-4 text-sm text-slate-600">
            These technical keys are kept only for troubleshooting old spreadsheets.
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
