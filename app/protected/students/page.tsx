import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeActionBar, OfficeNotice } from "@/components/office/office-ui";
import { StudentBulkImportDialogTrigger } from "@/components/students/student-bulk-import-dialog";
import { StudentQuickLoad } from "@/components/students/student-quick-load";
import { Button } from "@/components/ui/button";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import {
  getClassOptionsForSession,
  getStudentFormOptions,
  getStudentsPage,
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
    page?: string;
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
      : ("active" as StudentListFilters["status"]),
  };
}

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedFilters = normalizeFilters(resolvedSearchParams);
  let formOptions: Awaited<ReturnType<typeof getStudentFormOptions>> | null = null;
  let allClassOptions: StudentClassOption[] = [];
  let routeOptions: StudentRouteOption[] = [];
  let sessionOptions: StudentSessionOption[] = [];
  let resolvedSessionLabel = parsedFilters.sessionLabel || "";
  let formLoadWarning: string | null = null;

  try {
    formOptions = await getStudentFormOptions({
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
  const page = Math.max(1, Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1);
  let students: StudentListItem[] = [];
  let totalCount = 0;
  let studentLoadWarning: string | null = null;

  try {
    const pageData = await getStudentsPage(filters, { page, pageSize: 40 });
    students = pageData.students;
    totalCount = pageData.totalCount;
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Students"
        description="Add, search, bulk update, and review student-specific fee exceptions."
        actions={
          canWriteStudents ? (
            <OfficeActionBar className="border-0 bg-transparent p-0 shadow-none">
              <Button asChild>
                <Link href={`/protected/students/new?sessionLabel=${encodeURIComponent(filters.sessionLabel)}`}>
                  Add Student
                </Link>
              </Button>
              <StudentBulkImportDialogTrigger
                sessionOptions={sessionOptions}
                defaultSessionLabel={filters.sessionLabel}
              />
              <details className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center rounded-lg border border-input bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-accent">
                  More templates
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="grid gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/protected/imports/template?mode=add&sessionLabel=${encodeURIComponent(filters.sessionLabel)}`}>
                        Download Add Template
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/protected/imports/template?mode=update">
                        Download Update Template
                      </Link>
                    </Button>
                  </div>
                </div>
              </details>
            </OfficeActionBar>
          ) : (
            <StatusBadge label="Read-only access" tone="warning" />
          )
        }
      />

      {formOptions?.sessionMismatch ? (
        <SectionCard
          title="Working session mismatch"
            description="Fee Setup and student lists are not pointing to the same academic year."
        >
          <OfficeNotice
            tone="warning"
            action={
              <Button asChild variant="outline">
                <Link href="/protected/fee-setup">Open Fee Setup</Link>
              </Button>
            }
          >
            <p>
              Defaulting finance workflows to Fee Setup session{" "}
              <strong>{formOptions.policySessionLabel || resolvedSessionLabel}</strong>.
            </p>
          </OfficeNotice>
        </SectionCard>
      ) : null}

      {loadWarnings.length > 0 ? (
        <SectionCard
          title="Load warning"
          description="Some student workspace data could not be loaded safely. The page is still available."
        >
          <div className="space-y-2 text-sm text-amber-900">
            {loadWarnings.map((warning) => (
              <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                {warning}
              </p>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <StudentQuickLoad
        initialFilters={filters}
        initialStudents={students}
        initialPage={page}
        initialTotalCount={totalCount}
        sessionOptions={sessionOptions}
        classOptions={classOptions}
        routeOptions={routeOptions}
        canWrite={canWriteStudents}
      />

    </div>
  );
}
