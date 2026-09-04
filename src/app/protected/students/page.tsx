import { Suspense } from "react";
import {
  normalizeStudentFilters,
  readerFromRecord,
} from "@/modules/students/domain/filter-params";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { StatusBadge } from "@/ui/shell/status-badge";
import { OfficeActionBar, OfficeNotice } from "@/ui/office/office-ui";
import { StudentSessionMismatchActions } from "@/modules/students/ui/student-session-mismatch-actions";
import { DownloadAnchor } from "@/ui/primitives/download-anchor";
import { Skeleton } from "@/ui/primitives/loading-skeleton";
import { StudentBulkImportDialogTrigger } from "@/modules/students/ui/student-bulk-import-dialog";
import { StudentQuickLoad } from "@/modules/students/ui/student-quick-load";
import { StudentsListSkeleton } from "@/modules/students/ui/students-list-skeleton";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { getStudentSegmentCounts } from "@/modules/students/data/directory";
import { STUDENT_PAGE_SIZE } from "@/modules/students/domain/constants";
import { appendSessionParam } from "@/platform/navigation/session-href";
import {
  getClassOptionsForSession,
  getStudentFormOptions,
  getStudentsIdentityPage,
} from "@/modules/students/data/queries";
import {
  EMPTY_STUDENT_FILTERS,
  type StudentClassOption,
  type StudentListFilters,
  type StudentListItem,
  type StudentRouteOption,
  type StudentSessionOption,
} from "@/modules/students/domain/types";
import { countRecentImportStudentsOutsideSession } from "@/modules/students/data/session-reanchor";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import {
  hasStaffPermission,
  requireStaffPermission,
  type AuthenticatedStaffSession,
} from "@/platform/supabase/session";
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

type Translator = Awaited<ReturnType<typeof getTranslations<"Students">>>;
type FormOptions = Awaited<ReturnType<typeof getStudentFormOptions>>;
type FormOptionsResult =
  | { ok: true; formOptions: FormOptions }
  | { ok: false; error: unknown };

function normalizeFilters(
  params: Awaited<StudentsPageProps["searchParams"]>,
): StudentListFilters {
  return normalizeStudentFilters(
    readerFromRecord(params as Record<string, string | string[] | undefined> | undefined),
  );
}

/**
 * The bulk-import button needs the session list, which comes from the same
 * master-data read as the filters. It streams into the header's action bar so
 * the other three buttons do not wait for it.
 */
async function ImportDialogTrigger({
  formOptionsPromise,
  defaultSessionLabel,
}: {
  formOptionsPromise: Promise<FormOptionsResult>;
  defaultSessionLabel: string;
}) {
  const result = await formOptionsPromise;
  const sessionOptions: StudentSessionOption[] = result.ok
    ? result.formOptions.sessionOptions
    : defaultSessionLabel
      ? [{ value: defaultSessionLabel, label: defaultSessionLabel }]
      : [];

  return (
    <StudentBulkImportDialogTrigger
      sessionOptions={sessionOptions}
      defaultSessionLabel={defaultSessionLabel}
    />
  );
}

/**
 * The roll itself, with the filters above it and any warnings. The page
 * paints its header first and this fills in when the reads land.
 */
async function StudentDirectory({
  t,
  staff,
  formOptionsPromise,
  parsedFilters,
  requestedSessionLabel,
  page,
}: {
  t: Translator;
  staff: AuthenticatedStaffSession;
  formOptionsPromise: Promise<FormOptionsResult>;
  parsedFilters: StudentListFilters;
  requestedSessionLabel: string;
  page: number;
}) {
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const canCollectPayments = hasStaffPermission(staff, "payments:write");
  const canRealignRecentImports = hasStaffPermission(staff, "fees:write");

  // The roll used to wait for the form options before it could even start,
  // although the options only decide two things: the session label to query
  // (already known when the URL or the cookie names one) and whether a
  // classId in the URL belongs to that session. When neither is in doubt the
  // roll and the chip counts start now, alongside the options.
  const canStartEarly = Boolean(requestedSessionLabel) && !parsedFilters.classId;
  const earlyFilters = { ...parsedFilters, sessionLabel: requestedSessionLabel };
  const earlyPageData = canStartEarly
    ? getStudentsIdentityPage(earlyFilters, { page, pageSize: STUDENT_PAGE_SIZE })
        .then((pageData) => ({ ok: true as const, pageData }))
        .catch((error: unknown) => ({ ok: false as const, error }))
    : null;
  const earlySegmentCounts = canStartEarly
    ? getStudentSegmentCounts({
        sessionLabel: earlyFilters.sessionLabel,
        classId: earlyFilters.classId,
        transportRouteId: earlyFilters.transportRouteId,
        query: earlyFilters.query,
        segments: earlyFilters.segments,
      })
    : null;

  let formOptions: FormOptions | null = null;
  let allClassOptions: StudentClassOption[] = [];
  let routeOptions: StudentRouteOption[] = [];
  let sessionOptions: StudentSessionOption[] = [];
  let resolvedSessionLabel = requestedSessionLabel;
  let formLoadWarning: string | null = null;

  const formOptionsResult = await formOptionsPromise;
  if (formOptionsResult.ok) {
    formOptions = formOptionsResult.formOptions;
    allClassOptions = formOptions.allClassOptions;
    routeOptions = formOptions.routeOptions;
    sessionOptions = formOptions.sessionOptions;
    resolvedSessionLabel = formOptions.resolvedSessionLabel;
  } else {
    const error = formOptionsResult.error;
    formLoadWarning =
      error instanceof Error
        ? t("filterLoadWarning", { error: error.message })
        : t("filterLoadWarningFallback");
    sessionOptions = parsedFilters.sessionLabel
      ? [{ value: parsedFilters.sessionLabel, label: parsedFilters.sessionLabel }]
      : requestedSessionLabel
      ? [{ value: requestedSessionLabel, label: requestedSessionLabel }]
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
  const activePolicySessionLabel = formOptions?.policySessionLabel || resolvedSessionLabel;

  // Run the page load + the (conditional) recent-import count in parallel;
  // both are independent and were previously sequential.
  const [pageDataResult, recentImportStudentCount, segmentCounts] = await Promise.all([
    earlyPageData ??
      getStudentsIdentityPage(filters, { page, pageSize: STUDENT_PAGE_SIZE })
        .then((pageData) => ({ ok: true as const, pageData }))
        .catch((error: unknown) => ({ ok: false as const, error })),
    formOptions?.sessionMismatch && canRealignRecentImports
      ? countRecentImportStudentsOutsideSession(activePolicySessionLabel).catch(() => 0)
      : Promise.resolve(0),
    // Chips carry their numbers on first paint. getStudentSegmentCounts already
    // degrades to EMPTY_SEGMENT_COUNTS rather than throwing, so a counts failure
    // costs the labels, not the page.
    earlySegmentCounts ??
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

  return (
    <>
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
        initialSegmentCounts={segmentCounts}
        canViewFees={hasStaffPermission(staff, "fees:view")}
      />
    </>
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
  const requestedSessionLabel = parsedFilters.sessionLabel || viewSession.sessionLabel;
  const page = Math.max(1, Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1);
  const canWriteStudents = hasStaffPermission(staff, "students:write");
  const withSession = (href: string) => appendSessionParam(href, resolvedSearchParams?.session);

  // Started here, awaited inside the boundaries below: the header goes out
  // on the first flush while master data is still being read. The no-op catch
  // keeps a rejection from surfacing as an unhandled promise before a
  // boundary awaits it; the boundaries still see the failure.
  const formOptionsPromise: Promise<FormOptionsResult> = getStudentFormOptions({
    sessionLabel: requestedSessionLabel,
  })
    .then((formOptions) => ({ ok: true as const, formOptions }))
    .catch((error: unknown) => ({ ok: false as const, error }));

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
                <Link href={withSession(`/protected/students/new?sessionLabel=${encodeURIComponent(requestedSessionLabel)}`)}>
                  {t("addStudent")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={withSession("/protected/students/bulk-update")}>
                  {t("bulkUpdate")}
                </Link>
              </Button>
              <Suspense fallback={<Skeleton className="h-10 w-36 rounded-md" />}>
                <ImportDialogTrigger
                  formOptionsPromise={formOptionsPromise}
                  defaultSessionLabel={requestedSessionLabel}
                />
              </Suspense>
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
                      href={withSession(`/protected/imports/template?mode=add&sessionLabel=${encodeURIComponent(requestedSessionLabel)}`)}
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

      <Suspense fallback={<StudentsListSkeleton />}>
        <StudentDirectory
          t={t}
          staff={staff}
          formOptionsPromise={formOptionsPromise}
          parsedFilters={parsedFilters}
          requestedSessionLabel={requestedSessionLabel}
          page={page}
        />
      </Suspense>
    </div>
  );
}
