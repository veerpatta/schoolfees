import {
  normalizeStudentFilters,
  readerFromRecord,
} from "@/lib/students/filter-params";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeActionBar, OfficeNotice } from "@/components/office/office-ui";
import { StudentSessionMismatchActions } from "@/components/students/student-session-mismatch-actions";
import { DownloadAnchor } from "@/components/ui/download-anchor";
import { StudentBulkImportDialogTrigger } from "@/components/students/student-bulk-import-dialog";
import { StudentQuickLoad } from "@/components/students/student-quick-load";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStudentSegmentCounts } from "@/lib/segments/directory";
import { STUDENT_PAGE_SIZE } from "@/lib/students/constants";
import { appendSessionParam } from "@/lib/navigation/session-href";
import {
  getClassOptionsForSession,
  getStudentFormOptions,
  getStudentsIdentityPage,
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
    /**
     * Set when a student was just deleted from their profile. The delete
     * navigates here, and a toast fired mid-navigation is easy to miss, so the
     * confirmation is rendered on the destination instead.
     */
    removed?: string;
  }>;
};

function normalizeFilters(
  params: Awaited<StudentsPageProps["searchParams"]>,
): StudentListFilters {
  return normalizeStudentFilters(
    readerFromRecord(params as Record<string, string | string[] | undefined> | undefined),
  );
}

export default async function StudentsPage({ searchParams }: StudentsPageProps) {
  // Resolve everything that doesn't depend on data in parallel up front —
  // translations, staff auth, search params, the view-session cookie. These
  // were sequential awaits before, costing ~3-4 extra round trips on cold
  // navigations from /protected/dashboard.
  const [t, staff, resolvedSearchParams, cookieSession] = await Promise.all([
    getTranslations("Students"),
    requireStaffPermission("students:view", { onDenied: "redirect" }),
    searchParams ? searchParams : Promise.resolve(undefined),
    getViewSessionCookie(),
  ]);
  const parsedFilters = normalizeFilters(resolvedSearchParams);
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session ?? resolvedSearchParams?.sessionLabel,
    cookieSession,
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
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canCollectPayments = hasStaffPermission(staff, "payments:write");
  const canRealignRecentImports = hasStaffPermission(staff, "fees:write");
  const withSession = (href: string) => appendSessionParam(href, resolvedSearchParams?.session);
  const activePolicySessionLabel = formOptions?.policySessionLabel || resolvedSessionLabel;

  // Run the page load + the (conditional) recent-import count in parallel;
  // both are independent and were previously sequential.
  const [pageDataResult, recentImportStudentCount, segmentCounts] = await Promise.all([
    getStudentsIdentityPage(filters, { page, pageSize: STUDENT_PAGE_SIZE })
      .then((pageData) => ({ ok: true as const, pageData }))
      .catch((error: unknown) => ({ ok: false as const, error })),
    formOptions?.sessionMismatch && canRealignRecentImports
      ? countRecentImportStudentsOutsideSession(activePolicySessionLabel).catch(() => 0)
      : Promise.resolve(0),
    // Chips carry their numbers on first paint. getStudentSegmentCounts already
    // degrades to EMPTY_SEGMENT_COUNTS rather than throwing, so a counts failure
    // costs the labels, not the page.
    getStudentSegmentCounts({
      sessionLabel: filters.sessionLabel,
      classId: filters.classId,
      transportRouteId: filters.transportRouteId,
      query: filters.query,
      segments: filters.segments,
    }),
  ]);

  let students: StudentListItem[] = [];
  let totalCount = 0;
  let studentLoadWarning: string | null = null;
  if (pageDataResult.ok) {
    students = pageDataResult.pageData.students;
    totalCount = pageDataResult.pageData.totalCount;
  } else {
    studentLoadWarning =
      pageDataResult.error instanceof Error
        ? t("studentLoadWarning", { error: pageDataResult.error.message })
        : t("studentLoadWarningFallback");
  }
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
    // `flex flex-col gap-6`, not `space-y-6`: Tailwind's space-y selector is
    // `:not([hidden]) ~ :not([hidden])`, which skips the `hidden` *attribute*
    // but not the `hidden` *class*. With `hideOnMobile` the desktop header is
    // still a child, so space-y would push the phone's sticky search header
    // 24px down the screen. Flex `gap` ignores display:none children.
    <div className="flex flex-col gap-6">
      {resolvedSearchParams?.removed ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-success-soft px-4 py-3 text-sm font-medium text-success-soft-foreground"
        >
          {resolvedSearchParams.removed} was removed from Student Master.
        </p>
      ) : null}

      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        /* The phone opens on its own search header (mobile app v2 §STUDENTS),
           which carries the title and the live count. A second title above it
           would push the first student below the fold. */
        hideOnMobile
        actions={
          canWriteStudents ? (
            <OfficeActionBar className="border-0 bg-transparent p-0 shadow-none">
              <Button asChild>
                <Link href={withSession(`/protected/students/new?sessionLabel=${encodeURIComponent(filters.sessionLabel)}`)}>
                  {t("addStudent")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={withSession("/protected/students/bulk-update")}>
                  {t("bulkUpdate")}
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
                  {/* DownloadAnchor, not Link: these hrefs return a binary
                      attachment, and client-side navigation to a non-RSC
                      response silently no-ops. As <Link> they did nothing at
                      all — this is a bug fix, not polish. */}
                  <DropdownMenuItem asChild>
                    <DownloadAnchor
                      href={withSession(`/protected/imports/template?mode=add&sessionLabel=${encodeURIComponent(filters.sessionLabel)}`)}
                      download
                      className="flex w-full items-center gap-2"
                    >
                      {t("downloadAddTemplate")}
                    </DownloadAnchor>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <DownloadAnchor
                      href={withSession("/protected/imports/template?mode=update")}
                      download
                      className="flex w-full items-center gap-2"
                    >
                      {t("downloadUpdateTemplate")}
                    </DownloadAnchor>
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
        canCollectPayments={canCollectPayments}
        lastViewedByUser={lastViewedByUser}
        initialSegmentCounts={segmentCounts}
        canViewFees={hasStaffPermission(staff, "fees:view")}
      />

    </div>
  );
}
