import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeActionBar, OfficeNotice } from "@/components/office/office-ui";
import { StudentSessionMismatchActions } from "@/components/students/student-session-mismatch-actions";
import { StudentBulkImportDialogTrigger } from "@/components/students/student-bulk-import-dialog";
import { StudentQuickLoad } from "@/components/students/student-quick-load";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import { appendSessionParam } from "@/lib/navigation/session-href";
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
import { countRecentImportStudentsOutsideSession } from "@/lib/students/session-reanchor";
import { getLastEventByRef } from "@/lib/activity/events";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";
import Link from "next/link";

type StudentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    session?: string;
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
  const rawSessionLabel = (params?.session ?? params?.sessionLabel)?.trim() ?? "";

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
  const t = await getTranslations("Students");
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedFilters = normalizeFilters(resolvedSearchParams);
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session ?? resolvedSearchParams?.sessionLabel,
    cookieSession: await getViewSessionCookie(),
  });
  let formOptions: Awaited<ReturnType<typeof getStudentFormOptions>> | null = null;
  let allClassOptions: StudentClassOption[] = [];
  let routeOptions: StudentRouteOption[] = [];
  let sessionOptions: StudentSessionOption[] = [];
  let resolvedSessionLabel = viewSession.sessionLabel;
  let formLoadWarning: string | null = null;

  try {
    formOptions = await getStudentFormOptions({
      sessionLabel: parsedFilters.sessionLabel || viewSession.sessionLabel,
    });

    allClassOptions = formOptions.allClassOptions;
    routeOptions = formOptions.routeOptions;
    sessionOptions = formOptions.sessionOptions;
    resolvedSessionLabel = formOptions.resolvedSessionLabel;
  } catch (error) {
    formLoadWarning =
      error instanceof Error
        ? t("filterLoadWarning", { error: error.message })
        : t("filterLoadWarningFallback");
    sessionOptions = parsedFilters.sessionLabel
      ? [{ value: parsedFilters.sessionLabel, label: parsedFilters.sessionLabel }]
      : viewSession.sessionLabel
      ? [{ value: viewSession.sessionLabel, label: viewSession.sessionLabel }]
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
        ? t("studentLoadWarning", { error: error.message })
        : t("studentLoadWarningFallback");
  }
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canRealignRecentImports = hasStaffPermission(staff, "fees:write");
  const withSession = (href: string) => appendSessionParam(href, resolvedSearchParams?.session);
  const activePolicySessionLabel = formOptions?.policySessionLabel || resolvedSessionLabel;
  const recentImportStudentCount =
    formOptions?.sessionMismatch && canRealignRecentImports
      ? await countRecentImportStudentsOutsideSession(activePolicySessionLabel).catch(() => 0)
      : 0;
  const loadWarnings = [formLoadWarning, studentLoadWarning].filter(
    (value): value is string => Boolean(value),
  );

  let lastViewedByUser: Record<string, string> = {};
  if (staff?.id && students.length > 0) {
    try {
      const map = await getLastEventByRef(
        staff.id as string,
        "student_view",
        students.map((row) => row.id),
      );
      lastViewedByUser = Object.fromEntries(map);
    } catch {
      lastViewedByUser = {};
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          canWriteStudents ? (
            <OfficeActionBar className="border-0 bg-transparent p-0 shadow-none">
              <Button asChild>
                <Link href={withSession(`/protected/students/new?sessionLabel=${encodeURIComponent(filters.sessionLabel)}`)}>
                  {t("addStudent")}
                </Link>
              </Button>
              <StudentBulkImportDialogTrigger
                sessionOptions={sessionOptions}
                defaultSessionLabel={filters.sessionLabel}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label={t("templatesMenuAria")}>
                    {t("templatesMenuLabel")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem asChild>
                    <Link href={withSession(`/protected/imports/template?mode=add&sessionLabel=${encodeURIComponent(filters.sessionLabel)}`)}>
                      {t("downloadAddTemplate")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={withSession("/protected/imports/template?mode=update")}>
                      {t("downloadUpdateTemplate")}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </OfficeActionBar>
          ) : (
            <StatusBadge label={t("readOnlyAccess")} tone="warning" />
          )
        }
      />

      {formOptions?.sessionMismatch ? (
        <SectionCard
          title={t("sessionMismatchTitle")}
            description={t("sessionMismatchDescription")}
        >
          <OfficeNotice
            tone="warning"
            action={
              <StudentSessionMismatchActions
                activePolicySessionLabel={activePolicySessionLabel}
                canRealignRecentImports={canRealignRecentImports}
                recentImportStudentCount={recentImportStudentCount}
              />
            }
          >
            <p>
              {t("sessionMismatchBodyPrefix")}
              <strong>{formOptions.policySessionLabel || resolvedSessionLabel}</strong>.
            </p>
          </OfficeNotice>
        </SectionCard>
      ) : null}

      {loadWarnings.length > 0 ? (
        <SectionCard
          title={t("loadWarningTitle")}
          description={t("loadWarningDescription")}
        >
          <div className="space-y-2 text-sm text-warning-soft-foreground">
            {loadWarnings.map((warning) => (
              <p key={warning} className="rounded-lg border bg-warning-soft px-3 py-2">
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
        classOptions={classOptions}
        routeOptions={routeOptions}
        canWrite={canWriteStudents}
        lastViewedByUser={lastViewedByUser}
      />

    </div>
  );
}
