import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import { DefaulterFilterRehydrator } from "@/components/defaulters/defaulter-filter-rehydrator";
import { MissingDuesBanner } from "@/components/shared/missing-dues-banner";
import { BulkWhatsappProvider } from "@/components/defaulters/bulk-whatsapp-provider";
import { DefaultersWorkspace } from "@/components/defaulters/defaulters-workspace";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import { type DefaulterContactSummary } from "@/lib/defaulters/cadence";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters as DefaulterFiltersType,
} from "@/lib/defaulters/types";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type DefaultersPageProps = {
  searchParams?: Promise<{
    classId?: string | string[];
    transportRouteId?: string | string[];
    overdue?: string | string[];
    minPendingAmount?: string | string[];
    page?: string | string[];
    query?: string | string[];
    session?: string | string[];
  }>;
};

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
  const rawMinPendingAmount = asString(params?.minPendingAmount).trim();
  const rawSearchQuery = asString(params?.query).trim();

  return {
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_DEFAULTER_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_DEFAULTER_FILTERS.transportRouteId,
    overdue: rawOverdue === "overdue" ? "overdue" : EMPTY_DEFAULTER_FILTERS.overdue,
    minPendingAmount:
      /^\d+$/.test(rawMinPendingAmount)
        ? rawMinPendingAmount
        : EMPTY_DEFAULTER_FILTERS.minPendingAmount,
    searchQuery: rawSearchQuery.slice(0, 80) || EMPTY_DEFAULTER_FILTERS.searchQuery,
  };
}

export default async function DefaultersPage({
  searchParams,
}: DefaultersPageProps) {
  const staff = await requireStaffPermission("defaulters:view", { onDenied: "redirect" });
  const t = await getTranslations("Defaulters");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = normalizeFilters(resolvedSearchParams);
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewPaymentHistory = hasStaffPermission(staff, "payments:view");
  const canManageNoCall = hasStaffPermission(staff, "students:write");

  const [data, whatsappTemplates] = await Promise.all([
    getDefaultersPageData(
      filters,
      viewSession.sessionLabel,
      undefined,
      { redactPaymentHistory: !canViewPaymentHistory },
    ),
    listWhatsappTemplates({ onlyActive: true }),
  ]);
  const contactSummaries = data.contactSummaries;

  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

  const contactSummariesObj: Record<string, DefaulterContactSummary> = {};
  for (const [id, summary] of contactSummaries.entries()) {
    contactSummariesObj[id] = summary;
  }

  const buildExportHref = (format: "xlsx" | "pdf") => {
    const search = new URLSearchParams();
    search.set("session", viewSession.sessionLabel);
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
    if (filters.minPendingAmount && /^\d+$/.test(filters.minPendingAmount)) {
      search.set("minPendingAmount", filters.minPendingAmount);
    }
    if (filters.searchQuery) {
      search.set("query", filters.searchQuery);
    }
    return `/protected/exports/defaulters?${search.toString()}`;
  };

  const activeFilterCount = [
    filters.searchQuery,
    filters.classId,
    filters.transportRouteId,
    filters.overdue,
    filters.minPendingAmount,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <DefaulterFilterRehydrator filters={filters} sessionLabel={viewSession.sessionLabel} />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("callQueueTitle")}
        description={t("callQueueDescription", { session: viewSession.sessionLabel })}
        actions={
          <StatusBadge
            label={t("listedCount", {
              visibleStart: data.pagination.visibleStart,
              visibleEnd: data.pagination.visibleEnd,
              totalRows: data.pagination.totalRows,
            })}
            tone="accent"
          />
        }
      />

      <OfficeNotice tone="info">{t("officeNotice")}</OfficeNotice>
      <MissingDuesBanner missingCount={data.missingDuesRows.length} />

      <details className="rounded-xl border border-border bg-card shadow-sm">
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
            classOptions={data.classOptions}
            routeOptions={data.routeOptions}
            sessionLabel={viewSession.sessionLabel}
          />
        </div>
      </details>

      <BulkWhatsappProvider
        rows={data.rows.map((row) => ({
          studentId: row.studentId,
          admissionNo: row.admissionNo,
          fullName: row.fullName,
          fatherName: row.fatherName,
          fatherPhone: row.fatherPhone,
          classLabel: row.classLabel,
          totalPending: row.totalPending,
          oldestDueDate: row.oldestDueDate,
        }))}
        templates={whatsappTemplates}
        sessionLabel={viewSession.sessionLabel}
      >
        <DefaultersWorkspace
          rows={data.rows}
          sessionLabel={viewSession.sessionLabel}
          contactSummaries={contactSummariesObj}
          canPostPayments={canPostPayments}
          canViewPaymentHistory={canViewPaymentHistory}
          canManageNoCall={canManageNoCall}
          exportHref={buildExportHref("xlsx")}
        />
      </BulkWhatsappProvider>

      {data.missingDuesRows.length > 0 ? (
        <details className="rounded-xl border border-warning/30 bg-warning-soft/40">
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
    </div>
  );
}
