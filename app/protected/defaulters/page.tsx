import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { MoneyGlossaryLink } from "@/components/ui/money-glossary";
import { cn } from "@/lib/utils";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import { DefaulterFilterRehydrator } from "@/components/defaulters/defaulter-filter-rehydrator";
import { MissingDuesBanner } from "@/components/shared/missing-dues-banner";
import { BulkWhatsappProvider } from "@/components/defaulters/bulk-whatsapp-provider";
import { DefaultersWorkspace } from "@/components/defaulters/defaulters-workspace";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import { type DefaulterContactSummary } from "@/lib/defaulters/cadence";
import { getContactSummariesForStudents } from "@/lib/defaulters/contacts";
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
    cadence?: string | string[];
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

function normalizePage(value: string | string[] | undefined) {
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function DefaultersPage({
  searchParams,
}: DefaultersPageProps) {
  const staff = await requireStaffPermission("defaulters:view", { onDenied: "redirect" });
  const t = await getTranslations("Defaulters");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = normalizeFilters(resolvedSearchParams);
  const page = normalizePage(resolvedSearchParams?.page);
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewPaymentHistory = hasStaffPermission(staff, "payments:view");

  // First load financial rows so we know which students need a contact summary
  // — then re-compute heat with summaries in hand. Two-pass keeps the heavy
  // financial query simple while letting the score reflect contact history.
  const initialData = await getDefaultersPageData(
    filters,
    viewSession.sessionLabel,
    { page },
    { redactPaymentHistory: !canViewPaymentHistory },
  );

  const studentIds = initialData.rows.map((r) => r.studentId);
  const contactSummaries = await getContactSummariesForStudents(
    studentIds,
    viewSession.sessionLabel,
  );

  // Re-rank with heat scores informed by contact history.
  const data = await getDefaultersPageData(
    filters,
    viewSession.sessionLabel,
    { page },
    { redactPaymentHistory: !canViewPaymentHistory, contactSummaries },
  );

  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const whatsappTemplates = await listWhatsappTemplates({ onlyActive: true });

  const initialCadence = asString(resolvedSearchParams?.cadence) || "now";

  // Plain-object map for client component serialization.
  const contactSummariesObj: Record<string, DefaulterContactSummary> = {};
  for (const [id, summary] of contactSummaries.entries()) {
    contactSummariesObj[id] = summary;
  }

  const buildFilterHref = (chip: { value: string }) => {
    const search = new URLSearchParams();
    if (resolvedSearchParams?.session) {
      search.set("session", asString(resolvedSearchParams.session));
    }
    if (resolvedSearchParams?.classId) {
      search.set("classId", asString(resolvedSearchParams.classId));
    }
    if (resolvedSearchParams?.transportRouteId) {
      search.set("transportRouteId", asString(resolvedSearchParams.transportRouteId));
    }
    if (resolvedSearchParams?.query) {
      search.set("query", asString(resolvedSearchParams.query));
    }
    if (resolvedSearchParams?.cadence) {
      search.set("cadence", asString(resolvedSearchParams.cadence));
    }

    if (chip.value === "overdue") {
      search.set("overdue", "overdue");
    } else if (chip.value === "5000") {
      search.set("minPendingAmount", "5000");
    } else if (chip.value === "10000") {
      search.set("minPendingAmount", "10000");
    }

    const qs = search.toString();
    return `/protected/defaulters${qs ? `?${qs}` : ""}`;
  };

  // Audit 1.7 — "Download this view" forwards the active filters so the export
  // matches exactly what's on screen.
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

  const hasActiveFilters =
    filters.classId !== EMPTY_DEFAULTER_FILTERS.classId ||
    filters.transportRouteId !== EMPTY_DEFAULTER_FILTERS.transportRouteId ||
    filters.overdue !== EMPTY_DEFAULTER_FILTERS.overdue ||
    filters.minPendingAmount !== EMPTY_DEFAULTER_FILTERS.minPendingAmount ||
    filters.searchQuery !== EMPTY_DEFAULTER_FILTERS.searchQuery;

  const buildPageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (resolvedSearchParams?.session) {
      search.set("session", asString(resolvedSearchParams.session));
    }
    if (resolvedSearchParams?.classId) {
      search.set("classId", asString(resolvedSearchParams.classId));
    }
    if (resolvedSearchParams?.transportRouteId) {
      search.set("transportRouteId", asString(resolvedSearchParams.transportRouteId));
    }
    if (resolvedSearchParams?.query) {
      search.set("query", asString(resolvedSearchParams.query));
    }
    if (resolvedSearchParams?.overdue) {
      search.set("overdue", asString(resolvedSearchParams.overdue));
    }
    if (resolvedSearchParams?.minPendingAmount) {
      search.set("minPendingAmount", asString(resolvedSearchParams.minPendingAmount));
    }
    if (resolvedSearchParams?.cadence) {
      search.set("cadence", asString(resolvedSearchParams.cadence));
    }
    if (nextPage > 1) {
      search.set("page", String(nextPage));
    }

    const qs = search.toString();
    return `/protected/defaulters${qs ? `?${qs}` : ""}`;
  };

  const isActive = (chip: { value: string }) => {
    if (chip.value === "all") {
      return !filters.overdue && !filters.minPendingAmount;
    }
    if (chip.value === "overdue") {
      return filters.overdue === "overdue";
    }
    if (chip.value === "5000") {
      return filters.minPendingAmount === "5000";
    }
    if (chip.value === "10000") {
      return filters.minPendingAmount === "10000";
    }
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Audit 1.15 — sessionStorage-backed rehydrator so cross-module
          navigation keeps the active filters in view. */}
      <DefaulterFilterRehydrator filters={filters} sessionLabel={viewSession.sessionLabel} />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description", { session: viewSession.sessionLabel })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={t("listedCount", {
                visibleStart: data.pagination.visibleStart,
                visibleEnd: data.pagination.visibleEnd,
                totalRows: data.pagination.totalRows,
              })}
              tone="accent"
            />
            <Button asChild size="sm" variant="outline">
              <Link href={buildExportHref("xlsx")}>
                {hasActiveFilters ? t("exportFilteredAction") : t("exportAction")}
              </Link>
            </Button>
            <MoneyGlossaryLink />
          </div>
        }
      />

      <OfficeNotice tone="info">{t("officeNotice")}</OfficeNotice>

      {/* Audit 1.14 — surface the missing-dues signal as a single banner above
          the list so office staff see it before scrolling. The per-student
          cards below remain for follow-up detail. */}
      <MissingDuesBanner missingCount={data.missingDuesRows.length} />


      <SectionCard
        title={t("filtersTitle")}
        description={t("filtersDescription")}
      >
        <DefaulterFilters
          filters={filters}
          classOptions={data.classOptions}
          routeOptions={data.routeOptions}
          sessionLabel={viewSession.sessionLabel}
        />
      </SectionCard>

      {/* Compact metric strip (no horizontal scroll on lg+) */}
      <section className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-5">
        <Metric
          label={t("metricStudentsListed")}
          value={String(data.metrics.totalStudents)}
          hint={t("metricStudentsListedHint")}
        />
        <Metric
          label={t("metricPendingAmount")}
          value={formatInr(data.metrics.totalPending)}
          hint={t("metricPendingAmountHint")}
        />
        <Metric
          label={t("metricOverdueInstallments")}
          value={String(data.metrics.overdueInstallments)}
          hint={t("metricOverdueInstallmentsHint")}
        />
        <Metric
          label={t("metricOpenInstallments")}
          value={String(data.metrics.openInstallments)}
          hint={t("metricOpenInstallmentsHint")}
        />
        <Metric
          label={t("metricMissingDues")}
          value={String(data.metrics.missingDuesStudents)}
          hint={t("metricMissingDuesHint")}
          tone="warning"
        />
      </section>

      {data.missingDuesRows.length > 0 ? (
        <SectionCard
          title={t("missingDuesTitle")}
          description={t("missingDuesDescription")}
        >
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.missingDuesRows.map((row) => (
              <li
                key={`missing-${row.studentId}`}
                className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm"
              >
                <p className="font-semibold text-warning-soft-foreground">{row.fullName}</p>
                <p className="text-xs text-warning-soft-foreground">
                  {t("studentMetaLineBullet", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
                </p>
                <p className="mt-1 text-xs text-warning-soft-foreground">
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
        </SectionCard>
      ) : null}

      <SectionCard
        title={t("listTitle")}
        description={t("listDescription")}
      >
        <BulkWhatsappProvider
          rows={data.rows.map((row) => ({
            studentId: row.studentId,
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
          <div className="space-y-4">
            {/* Amount filter chips remain server-driven (they affect query) */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:px-0">
              {[
                { i18nKey: "chipAll", value: "all" },
                { i18nKey: "chipOverdueOnly", value: "overdue" },
                { i18nKey: "chip5000Plus", value: "5000" },
                { i18nKey: "chip10000Plus", value: "10000" },
              ].map((chip) => (
                <Link
                  key={chip.value}
                  href={buildFilterHref(chip)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                    isActive(chip)
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface-2 text-foreground border-border hover:bg-surface-3",
                  )}
                >
                  {t(chip.i18nKey)}
                </Link>
              ))}
            </div>

            {/* Cadence tabs + worklist — both client-side now, instant filter */}
            <DefaultersWorkspace
              rows={data.rows}
              sessionLabel={viewSession.sessionLabel}
              contactSummaries={contactSummariesObj}
              initialCadence={initialCadence}
              canPostPayments={canPostPayments}
              canViewPaymentHistory={canViewPaymentHistory}
            />
          </div>

          <SummaryRow sticky={false} hint={t("summaryPageLabel", { page: data.pagination.page })}>
            <SummaryCell label={t("summaryDefaulters")} value={String(data.pagination.totalRows)} />
            <SummaryCell label={t("summaryTotalPending")} value={formatInr(data.metrics.totalPending)} />
          </SummaryRow>

          {data.pagination.hasPreviousPage || data.pagination.hasNextPage ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t("paginationShowing", {
                  start: data.pagination.visibleStart,
                  end: data.pagination.visibleEnd,
                  total: data.pagination.totalRows,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" aria-disabled={!data.pagination.hasPreviousPage}>
                  <Link
                    href={buildPageHref(Math.max(1, data.pagination.page - 1))}
                    className={!data.pagination.hasPreviousPage ? "pointer-events-none opacity-50" : undefined}
                  >
                    <ChevronLeft className="size-4" />
                    {t("previousPage")}
                  </Link>
                </Button>
                <span className="min-w-16 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("summaryPageLabel", { page: data.pagination.page })}
                </span>
                <Button asChild size="sm" variant="outline" aria-disabled={!data.pagination.hasNextPage}>
                  <Link
                    href={buildPageHref(data.pagination.page + 1)}
                    className={!data.pagination.hasNextPage ? "pointer-events-none opacity-50" : undefined}
                  >
                    {t("nextPage")}
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </BulkWhatsappProvider>
      </SectionCard>

      {/* Route summary — keep for the owner / admin view, kill horizontal scroll */}
      <SectionCard
        title={t("routeTransportTitle")}
        description={t("routeTransportDescription")}
      >
        {data.routeSummaryRows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
            {t("routeTransportEmpty")}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
        )}
      </SectionCard>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warning";
}) {
  const wrapper =
    tone === "warning"
      ? "rounded-lg border bg-warning-soft p-4 shrink-0 w-[70vw] snap-start md:w-auto"
      : "rounded-lg border border-border bg-card p-4 shrink-0 w-[70vw] snap-start md:w-auto";
  const labelCls =
    tone === "warning"
      ? "text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-soft-foreground"
      : "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  const valueCls =
    tone === "warning"
      ? "mt-2 text-2xl font-semibold text-warning-soft-foreground"
      : "mt-2 text-2xl font-semibold text-foreground";
  const hintCls =
    tone === "warning"
      ? "mt-2 text-sm leading-6 text-warning-soft-foreground"
      : "mt-2 text-sm leading-6 text-muted-foreground";
  return (
    <div className={wrapper}>
      <p className={labelCls}>{label}</p>
      <div className={valueCls}>{value}</div>
      <p className={hintCls}>{hint}</p>
    </div>
  );
}
