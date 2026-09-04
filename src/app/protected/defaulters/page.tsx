import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { StatusBadge } from "@/ui/shell/status-badge";
import { OfficeNotice } from "@/ui/office/office-ui";
import { Button } from "@/ui/primitives/button";
import { Skeleton } from "@/ui/primitives/loading-skeleton";
import { DefaulterFilters } from "@/modules/defaulters/ui/defaulter-filters";
import { DefaulterFilterRehydrator } from "@/modules/defaulters/ui/defaulter-filter-rehydrator";
import { DefaultersQueueSkeleton } from "@/modules/defaulters/ui/defaulters-queue-skeleton";
import { MissingDuesBanner } from "@/ui/shared/missing-dues-banner";
import { BulkWhatsappProvider } from "@/modules/defaulters/ui/bulk-whatsapp-provider";
import { DefaultersWorkspace } from "@/modules/defaulters/ui/defaulters-workspace";
import { getDefaultersPageData } from "@/modules/defaulters/data/queries";
import { type DefaulterContactSummary } from "@/modules/defaulters/domain/cadence";
import { getWorkbookClassOptions } from "@/modules/fees/data/queries";
import { getStudentFormOptions } from "@/modules/students/data/queries";
import { listWhatsappTemplates } from "@/modules/whatsapp/data/queries";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters as DefaulterFiltersType,
} from "@/modules/defaulters/domain/types";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import { appendSessionParam } from "@/platform/navigation/session-href";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/platform/supabase/session";

type DefaultersPageProps = {
  searchParams?: Promise<{
    classId?: string | string[];
    transportRouteId?: string | string[];
    overdue?: string | string[];
    prevYearDues?: string | string[];
    minPendingAmount?: string | string[];
    page?: string | string[];
    query?: string | string[];
    session?: string | string[];
  }>;
};

type Translator = Awaited<ReturnType<typeof getTranslations<"Defaulters">>>;
type QueueData = Awaited<ReturnType<typeof getDefaultersPageData>>;
type Templates = Awaited<ReturnType<typeof listWhatsappTemplates>>;

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

function normalizeFilters(
  params: Awaited<DefaultersPageProps["searchParams"]>,
): DefaulterFiltersType {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const rawClassId = asString(params?.classId).trim();
  const rawRouteId = asString(params?.transportRouteId).trim();
  const rawOverdue = asString(params?.overdue).trim();
  const rawPrevYearDues = asString(params?.prevYearDues).trim();
  const rawMinPendingAmount = asString(params?.minPendingAmount).trim();
  const rawSearchQuery = asString(params?.query).trim();

  return {
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_DEFAULTER_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_DEFAULTER_FILTERS.transportRouteId,
    overdue: rawOverdue === "overdue" ? "overdue" : EMPTY_DEFAULTER_FILTERS.overdue,
    prevYearDues:
      rawPrevYearDues === "prevYear" ? "prevYear" : EMPTY_DEFAULTER_FILTERS.prevYearDues,
    minPendingAmount:
      /^\d+$/.test(rawMinPendingAmount)
        ? rawMinPendingAmount
        : EMPTY_DEFAULTER_FILTERS.minPendingAmount,
    searchQuery: rawSearchQuery.slice(0, 80) || EMPTY_DEFAULTER_FILTERS.searchQuery,
  };
}

/**
 * The "12-40 of 485 listed" badge in the desktop header. It needs the queue,
 * so it streams in beside the title rather than holding the title back.
 */
async function QueueCountBadge({
  t,
  dataPromise,
}: {
  t: Translator;
  dataPromise: Promise<QueueData>;
}) {
  const data = await dataPromise;

  return (
    <StatusBadge
      label={t("listedCount", {
        visibleStart: data.pagination.visibleStart,
        visibleEnd: data.pagination.visibleEnd,
        totalRows: data.pagination.totalRows,
      })}
      tone="accent"
    />
  );
}

/**
 * Everything on the page that needs the queue itself: the missing-dues
 * banner, the workspace, the missing-dues drill-down and the route summary.
 * The page awaits none of it, so the chrome above paints on the first flush
 * and this section fills in when the installment scan lands.
 */
async function DefaultersQueue({
  t,
  dataPromise,
  templatesPromise,
  filters,
  sessionLabel,
  canPostPayments,
  canViewPaymentHistory,
  canManageNoCall,
}: {
  t: Translator;
  dataPromise: Promise<QueueData>;
  templatesPromise: Promise<Templates>;
  filters: DefaulterFiltersType;
  sessionLabel: string;
  canPostPayments: boolean;
  canViewPaymentHistory: boolean;
  canManageNoCall: boolean;
}) {
  const [data, whatsappTemplates] = await Promise.all([dataPromise, templatesPromise]);
  const contactSummaries = data.contactSummaries;

  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  const contactSummariesObj: Record<string, DefaulterContactSummary> = {};
  for (const [id, summary] of contactSummaries.entries()) {
    contactSummariesObj[id] = summary;
  }

  const buildExportHref = (format: "xlsx" | "pdf") => {
    const search = new URLSearchParams();
    search.set("session", sessionLabel);
    search.set("format", format);
    if (filters.classId) {
      search.set("classId", filters.classId);
    }
    if (filters.transportRouteId) {
      search.set("transportRouteId", filters.transportRouteId);
    }
    if (filters.overdue === "overdue") {
      search.set("overdue", "overdue");
    }
    if (filters.prevYearDues === "prevYear") {
      search.set("prevYearDues", "prevYear");
    }
    if (filters.minPendingAmount && /^\d+$/.test(filters.minPendingAmount)) {
      search.set("minPendingAmount", filters.minPendingAmount);
    }
    if (filters.searchQuery) {
      search.set("query", filters.searchQuery);
    }
    return `/protected/exports/defaulters?${search.toString()}`;
  };

  return (
    <>
      <MissingDuesBanner missingCount={data.missingDuesRows.length} />

      <div className="max-md:order-2">
      {/* The same array reference both components receive, deliberately.
          This used to `.map()` an eight-field projection for the provider while
          the workspace below got the full rows — two different objects per
          student, so every defaulter was serialized into the RSC payload twice
          (485 of them on the live session). BulkWhatsappRow is a structural
          subset of DefaulterSummaryRow, so passing the rows straight through
          reads the same eight fields and React's flight encoder emits the array
          once, with a back-reference for the second use. */}
      <BulkWhatsappProvider
        rows={data.rows}
        templates={whatsappTemplates}
        sessionLabel={sessionLabel}
      >
        <DefaultersWorkspace
          rows={data.rows}
          sessionLabel={sessionLabel}
          contactSummaries={contactSummariesObj}
          canPostPayments={canPostPayments}
          canViewPaymentHistory={canViewPaymentHistory}
          canManageNoCall={canManageNoCall}
          exportHref={buildExportHref("xlsx")}
        />
      </BulkWhatsappProvider>
      </div>

      {data.missingDuesRows.length > 0 ? (
        // order 4: this drill-down defaulted to 0 and rendered above the
        // workspace, re-creating the chrome-before-the-card problem.
        <details className="rounded-xl border border-warning/30 bg-warning-soft/40 max-md:order-4">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-warning-soft-foreground">
            {t("missingDuesTitle")}
          </summary>
          <div className="border-t border-warning/20 p-4">
            <p className="mb-3 text-sm text-warning-soft-foreground">
              {t("missingDuesDescription")}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.missingDuesRows.map((row) => (
                <li
                  key={`missing-${row.studentId}`}
                  className="rounded-xl border border-warning/30 bg-card p-3 text-sm"
                >
                  <p className="font-semibold text-foreground">{row.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("studentMetaLineBullet", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("tablePhone")}: {row.fatherPhone ?? "-"}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link
                      href={withSession(
                        `/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`,
                      )}
                    >
                      {t("missingDuesPrepareDues")}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      <SectionCard
        className="max-md:order-5"
        title={t("routeTransportTitle")}
        description={t("routeTransportDescription")}
      >
        {data.routeSummaryRows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
            {t("routeTransportEmpty")}
          </p>
        ) : (
          <details>
            <summary className="cursor-pointer list-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold text-foreground">
              {t("callQueueAllMatching")}
            </summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.routeSummaryRows.map((row) => (
                <li
                  key={`route-${row.routeId ?? row.routeLabel}`}
                  className="rounded-xl border border-border bg-card p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{row.routeLabel}</p>
                    <span className="font-semibold text-foreground">{formatInr(row.totalPending)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <p>{t("routeStudentsCount", { count: row.studentCount })}</p>
                    <p>{t("routeOpenInstallmentsRow", { count: row.openInstallments })}</p>
                    <p>{t("routeOverdueInstallmentsRow", { count: row.overdueInstallments })}</p>
                    <p>
                      {t("routeOldestDueDate")}: {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
                    </p>
                  </div>
                  {row.routeId ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <Link
                        className="text-xs font-medium text-info-soft-foreground hover:underline"
                        href={withSession(`/protected/defaulters?transportRouteId=${row.routeId}`)}
                      >
                        {t("routeOpenDefaulters")}
                      </Link>
                      <Link
                        className="text-xs font-medium text-info-soft-foreground hover:underline"
                        href={withSession(`/protected/students?transportRouteId=${row.routeId}`)}
                      >
                        {t("routeOpenStudents")}
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        )}
      </SectionCard>
    </>
  );
}

export default async function DefaultersPage({
  searchParams,
}: DefaultersPageProps) {
  // Nothing here depends on anything else, so it is one round of waiting
  // rather than four in a row.
  const [staff, t, resolvedSearchParams, cookieSession] = await Promise.all([
    requireStaffPermission("defaulters:view", { onDenied: "redirect" }),
    getTranslations("Defaulters"),
    searchParams ? searchParams : Promise.resolve(undefined),
    getViewSessionCookie(),
  ]);
  const filters = normalizeFilters(resolvedSearchParams);
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession,
  });
  const sessionLabel = viewSession.sessionLabel;
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewPaymentHistory = hasStaffPermission(staff, "payments:view");
  const canManageNoCall = hasStaffPermission(staff, "students:write");

  // The queue is the heavy read on this page: two full installment scans plus
  // the roll. It starts now and is awaited inside the Suspense boundary below,
  // so the header, notice and filters go out on the first flush instead of
  // waiting ten-odd round trips behind it. The no-op catch stops a rejection
  // from surfacing as an unhandled promise before the boundary awaits it; the
  // boundary still sees the error.
  const dataPromise = getDefaultersPageData(filters, sessionLabel, undefined, {
    redactPaymentHistory: !canViewPaymentHistory,
  });
  dataPromise.catch(() => undefined);
  const templatesPromise = listWhatsappTemplates({ onlyActive: true });
  templatesPromise.catch(() => undefined);

  // The filters only need the class and route lists. Both are request-cached
  // reads the queue makes anyway, so this costs no extra query.
  const [{ routeOptions }, classOptions] = await Promise.all([
    getStudentFormOptions({ sessionLabel }),
    getWorkbookClassOptions(sessionLabel),
  ]);

  const activeFilterCount = [
    filters.searchQuery,
    filters.classId,
    filters.transportRouteId,
    filters.overdue,
    filters.prevYearDues,
    filters.minPendingAmount,
  ].filter(Boolean).length;

  return (
    // Flex + order, not space-y: the phone opens on the family being called,
    // so the filters and the route summary move below the workspace. `space-y`
    // also spaces around `display:none` children, which the hidden desktop
    // header would otherwise leave as a band above the phone header.
    <div className="flex flex-col gap-5">
      <DefaulterFilterRehydrator filters={filters} sessionLabel={viewSession.sessionLabel} />
      <PageHeader
        /* The workspace carries the phone header: title, sub, calls-logged
           count and the progress bar, per the design's Calls screen. */
        hideOnMobile
        eyebrow={t("eyebrow")}
        title={t("callQueueTitle")}
        description={t("callQueueDescription", { session: sessionLabel })}
        actions={
          <Suspense fallback={<Skeleton className="h-6 w-32 rounded-full" />}>
            <QueueCountBadge t={t} dataPromise={dataPromise} />
          </Suspense>
        }
      />

      {/* Standing explanation of how the queue is ordered — desk reading, and
          a screenful on a phone before the first family. The missing-dues
          banner stays: it is actionable. */}
      <div className="hidden md:block">
        <OfficeNotice tone="info">{t("officeNotice")}</OfficeNotice>
      </div>

      <details className="rounded-xl border border-border bg-card shadow-sm max-md:order-3">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
          <span>{t("callQueueFilterTitle")}</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {activeFilterCount > 0
              ? t("filtersMobileToggleCount", { count: activeFilterCount })
              : t("callQueueFilterClosed")}
          </span>
        </summary>
        <div className="border-t border-border px-4 py-4">
          <DefaulterFilters
            filters={filters}
            classOptions={classOptions}
            routeOptions={routeOptions}
            sessionLabel={sessionLabel}
          />
        </div>
      </details>

      <Suspense fallback={<DefaultersQueueSkeleton />}>
        <DefaultersQueue
          t={t}
          dataPromise={dataPromise}
          templatesPromise={templatesPromise}
          filters={filters}
          sessionLabel={sessionLabel}
          canPostPayments={canPostPayments}
          canViewPaymentHistory={canViewPaymentHistory}
          canManageNoCall={canManageNoCall}
        />
      </Suspense>
    </div>
  );
}
