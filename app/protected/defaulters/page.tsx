import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import {
  DefaulterContactActions,
  DefaulterContactActionsCompact,
} from "@/components/defaulters/defaulter-contact-actions";
import { ContactStatusChip } from "@/components/defaulters/contact-status-chip";
import { ContactLogTimelineButton } from "@/components/defaulters/contact-log-timeline";
import { TriageTabs } from "@/components/defaulters/triage-tabs";
import {
  BulkRowCheckbox,
  BulkWhatsappProvider,
} from "@/components/defaulters/bulk-whatsapp-provider";
import { CloseDueTrigger } from "@/components/students/close-due-trigger";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import { deriveCadence, tallyCadence } from "@/lib/defaulters/cadence";
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
  const canCloseBalance = hasStaffPermission(staff, "finance:write");
  const canViewPaymentHistory = hasStaffPermission(staff, "payments:view");
  const data = await getDefaultersPageData(
    filters,
    viewSession.sessionLabel,
    { page },
    { redactPaymentHistory: !canViewPaymentHistory },
  );
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const whatsappTemplates = await listWhatsappTemplates({ onlyActive: true });

  // Contact summaries & cadence (gracefully degrades when table is not yet applied)
  const studentIds = data.rows.map((r) => r.studentId);
  const contactSummaries = await getContactSummariesForStudents(
    studentIds,
    viewSession.sessionLabel,
  );
  const todayDate = new Date();
  const rowsWithCadence = data.rows.map((row) => ({
    ...row,
    cadence: deriveCadence(
      contactSummaries.get(row.studentId) ?? {
        snoozeUntil: null,
        lastContactedAt: null,
      },
      todayDate,
    ),
  }));
  const cadenceCounts = tallyCadence(
    rowsWithCadence.map((r) => ({
      snoozeUntil:
        contactSummaries.get(r.studentId)?.snoozeUntil ?? null,
      lastContactedAt:
        contactSummaries.get(r.studentId)?.lastContactedAt ?? null,
    })),
    todayDate,
  );

  const activeCadence = asString(resolvedSearchParams?.cadence) || "all";
  const visibleRows =
    activeCadence === "all"
      ? rowsWithCadence
      : rowsWithCadence.filter((r) => r.cadence === activeCadence);

  // Base params to preserve when triage tabs build hrefs
  const triageBaseParams: Record<string, string> = {};
  if (resolvedSearchParams?.session)
    triageBaseParams.session = asString(resolvedSearchParams.session);
  if (resolvedSearchParams?.classId)
    triageBaseParams.classId = asString(resolvedSearchParams.classId);
  if (resolvedSearchParams?.transportRouteId)
    triageBaseParams.transportRouteId = asString(
      resolvedSearchParams.transportRouteId,
    );
  if (resolvedSearchParams?.overdue)
    triageBaseParams.overdue = asString(resolvedSearchParams.overdue);
  if (resolvedSearchParams?.minPendingAmount)
    triageBaseParams.minPendingAmount = asString(
      resolvedSearchParams.minPendingAmount,
    );
  if (resolvedSearchParams?.query)
    triageBaseParams.query = asString(resolvedSearchParams.query);

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
              <Link href={withSession("/protected/exports/defaulters")}>{t("exportAction")}</Link>
            </Button>
          </div>
        }
      />

      <OfficeNotice tone="info">
        {t("officeNotice")}
      </OfficeNotice>

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

      <section className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4 shrink-0 w-[70vw] snap-start md:w-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("metricStudentsListed")}
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.totalStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("metricStudentsListedHint")}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shrink-0 w-[70vw] snap-start md:w-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("metricPendingAmount")}
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {formatInr(data.metrics.totalPending)}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("metricPendingAmountHint")}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shrink-0 w-[70vw] snap-start md:w-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("metricOverdueInstallments")}
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.overdueInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("metricOverdueInstallmentsHint")}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shrink-0 w-[70vw] snap-start md:w-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("metricOpenInstallments")}
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.openInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("metricOpenInstallmentsHint")}
          </p>
        </div>

        <div className="rounded-lg border bg-warning-soft p-4 shrink-0 w-[70vw] snap-start md:w-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-soft-foreground">
            {t("metricMissingDues")}
          </p>
          <div className="mt-2 text-2xl font-semibold text-warning-soft-foreground">
            {data.metrics.missingDuesStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-warning-soft-foreground">
            {t("metricMissingDuesHint")}
          </p>
        </div>
      </section>

      {data.missingDuesRows.length > 0 ? (
        <SectionCard
          title={t("missingDuesTitle")}
          description={t("missingDuesDescription")}
        >
          <div className="space-y-3 md:hidden">
            {data.missingDuesRows.map((row) => (
              <div key={`missing-mobile-${row.studentId}`} className="rounded-xl border bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning-soft-foreground">{row.fullName}</p>
                <p className="text-xs text-warning-soft-foreground">
                  {t("studentMetaLineBullet", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
                </p>
                <p className="mt-1 text-xs text-warning-soft-foreground">
                  {t("tablePhone")}: {row.fatherPhone ?? "-"}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link href={withSession(`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`)}>{t("missingDuesPrepareDues")}</Link>
                </Button>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-warning/30 md:block">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-warning-soft text-xs uppercase tracking-wide text-warning-soft-foreground">
                <tr>
                  <th className="px-4 py-3">{t("tableStudent")}</th>
                  <th className="px-4 py-3">{t("tableClass")}</th>
                  <th className="px-4 py-3">{t("tableSrNo")}</th>
                  <th className="px-4 py-3">{t("tableFather")}</th>
                  <th className="px-4 py-3">{t("tablePhone")}</th>
                  <th className="px-4 py-3">{t("tableRoute")}</th>
                  <th className="px-4 py-3">{t("tableDues")}</th>
                </tr>
              </thead>
              <tbody>
                {data.missingDuesRows.map((row) => (
                  <tr key={`missing-${row.studentId}`} className="border-t border-warning/30 text-foreground">
                    <td className="px-4 py-3 font-medium text-foreground">{row.fullName}</td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.admissionNo}</td>
                    <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                    <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                    <td className="px-4 py-3">{row.transportRouteLabel}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-xs font-medium text-info-soft-foreground hover:underline"
                        href={withSession(`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`)}
                      >
                        {t("missingDuesPrepareDues")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t("listTitle")}
        description={t("listDescription")}
      >
        <BulkWhatsappProvider
          rows={visibleRows.map((row) => ({
            studentId: row.studentId,
            fullName: row.fullName,
            fatherName: row.fatherName,
            fatherPhone: row.fatherPhone,
            classLabel: row.classLabel,
            totalPending: row.totalPending,
            oldestDueDate: row.oldestDueDate,
          }))}
          templates={whatsappTemplates}
        >
        <div className="space-y-4">
          {/* Triage cadence tabs */}
          <TriageTabs
            counts={cadenceCounts}
            activeCadence={activeCadence}
            baseParams={triageBaseParams}
          />

          {/* Quick filter chips - horizontal scroll */}
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
                    : "bg-surface-2 text-foreground border-border hover:bg-surface-3"
                )}
              >
                {t(chip.i18nKey)}
              </Link>
            ))}
          </div>

          <div className="md:hidden">
            {visibleRows.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
                {t("emptyDefaulters")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                {visibleRows.map((row) => (
                  <li key={row.studentId} className="px-4 py-3.5 hover:bg-surface-2/40">
                    {/* Name + class + outstanding */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="mt-1">
                          <BulkRowCheckbox
                            studentId={row.studentId}
                            ariaLabel={t("selectAriaLabel", { name: row.fullName })}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("studentMetaLine", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Money value={row.totalPending} size="lg" tone="warning" />
                        {row.overdueAmount > 0 ? (
                          <p className="text-[11px] font-medium text-destructive">
                            {t("overdueAmountChip", { amount: formatInr(row.overdueAmount) })}
                          </p>
                        ) : null}
                        {row.lateFee > 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t("lateFeeChip", { amount: formatInr(row.lateFee) })}
                          </p>
                        ) : null}
                        <div className="mt-1">
                          <StatusBadge label={row.followUpStatus === "overdue" ? t("overdueBadge") : row.followUpStatus} tone="warning" />
                        </div>
                      </div>
                    </div>

                    {/* Extra metadata grid */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <p>{t("daysOverdueLabel", { count: row.daysOverdue })}</p>
                      <p>{t("oldestDueLabel", { date: row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-" })}</p>
                      <p>{t("fatherLabel", { name: row.fatherName ?? "-" })}</p>
                      {canViewPaymentHistory ? (
                        <p>{t("lastPaymentLabel", { date: row.lastPaymentDate ? formatShortDate(row.lastPaymentDate) : "-" })}</p>
                      ) : null}
                    </div>

                    {/* Contact status chip */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ContactStatusChip summary={contactSummaries.get(row.studentId) ?? null} />
                      <ContactLogTimelineButton
                        studentId={row.studentId}
                        studentName={row.fullName}
                        sessionLabel={viewSession.sessionLabel}
                      />
                    </div>

                    {/* Action row */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <DefaulterContactActions
                        row={row}
                        sessionLabel={viewSession.sessionLabel}
                      />
                      <div className="ml-auto flex gap-1.5">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={withSession(`/protected/students/${row.studentId}`)}>{t("viewAction")}</Link>
                        </Button>
                        {canCloseBalance && row.totalPending > 0 ? (
                          <CloseDueTrigger
                            studentId={row.studentId}
                            studentLabel={row.fullName}
                            studentAdmissionNo={row.admissionNo}
                            classLabel={row.classLabel}
                            pendingAmount={row.totalPending}
                            currentDiscount={row.discountApplied}
                            size="sm"
                            variant="ghost"
                          />
                        ) : null}
                        {canPostPayments && (
                          <Button asChild size="sm" variant="accent" className="rounded-full">
                            <Link href={withSession(`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`)}>{t("collectAction")}</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-10"><span className="sr-only">{t("tableSelect")}</span></th>
                <th className="px-4 py-3">{t("tableRank")}</th>
                <th className="px-4 py-3">{t("tableStudent")}</th>
                <th className="px-4 py-3">{t("tableClass")}</th>
                <th className="px-4 py-3">{t("tableFather")}</th>
                <th className="px-4 py-3">{t("tablePhone")}</th>
                <th className="px-4 py-3">{t("tablePending")}</th>
                <th className="px-4 py-3">{t("tableOverdue")}</th>
                <th className="px-4 py-3">{t("tableLateFee")}</th>
                <th className="px-4 py-3">{t("tableOldestDue")}</th>
                <th className="px-4 py-3">{t("tableDaysOverdue")}</th>
                {canViewPaymentHistory ? (
                  <th className="px-4 py-3">{t("tableLastPayment")}</th>
                ) : null}
                <th className="px-4 py-3">{t("tableAction")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canViewPaymentHistory ? 13 : 12}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    {t("emptyDefaulters")}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.studentId}
                    className="border-t border-border text-foreground"
                  >
                    <td className="px-3 py-3">
                      <BulkRowCheckbox
                        studentId={row.studentId}
                        ariaLabel={t("selectAriaLabel", { name: row.fullName })}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">#{row.rank}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("tableSrNoLine", { value: row.admissionNo })}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <ContactStatusChip summary={contactSummaries.get(row.studentId) ?? null} />
                        <ContactLogTimelineButton
                          studentId={row.studentId}
                          studentName={row.fullName}
                          sessionLabel={viewSession.sessionLabel}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                    <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatInr(row.totalPending)}
                    </td>
                    <td className="px-4 py-3 font-medium text-destructive">
                      {row.overdueAmount > 0 ? formatInr(row.overdueAmount) : "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.lateFee > 0 ? formatInr(row.lateFee) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
                    </td>
                    <td className="px-4 py-3">{row.daysOverdue}</td>
                    {canViewPaymentHistory ? (
                      <td className="px-4 py-3">
                        {row.lastPaymentDate ? formatShortDate(row.lastPaymentDate) : "-"}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={withSession(`/protected/students/${row.studentId}`)}
                          className="text-sm font-semibold text-info-soft-foreground hover:text-info-soft-foreground"
                        >
                          {t("viewAction")}
                        </Link>
                        <DefaulterContactActionsCompact
                          row={row}
                          sessionLabel={viewSession.sessionLabel}
                        />
                        {canCloseBalance && row.totalPending > 0 ? (
                          <CloseDueTrigger
                            studentId={row.studentId}
                            studentLabel={row.fullName}
                            studentAdmissionNo={row.admissionNo}
                            classLabel={row.classLabel}
                            pendingAmount={row.totalPending}
                            currentDiscount={row.discountApplied}
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                          />
                        ) : null}
                        {canPostPayments && (
                          <Link
                            href={withSession(`/protected/payments?studentId=${row.studentId}`)}
                            className="text-sm font-semibold text-info-soft-foreground hover:text-info-soft-foreground"
                          >
                            {t("collectAction")}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <SummaryRow sticky={false} hint={t("summaryPageLabel", { page: data.pagination.page })}>
          <SummaryCell label={t("summaryDefaulters")} value={String(data.pagination.totalRows)} />
          <SummaryCell label={t("summaryTotalPending")} value={formatInr(data.metrics.totalPending)} />
        </SummaryRow>
        {(data.pagination.hasPreviousPage || data.pagination.hasNextPage) ? (
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

      <SectionCard
        title={t("routeTransportTitle")}
        description={t("routeTransportDescription")}
      >
        <div className="space-y-3 md:hidden">
          {data.routeSummaryRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
              {t("routeTransportEmpty")}
            </p>
          ) : (
            data.routeSummaryRows.map((row) => (
              <div key={`route-mobile-${row.routeId ?? row.routeLabel}`} className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="font-semibold text-foreground">{row.routeLabel}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>{t("routeStudentsCount", { count: row.studentCount })}</p>
                  <p>{t("routeOpenInstallmentsRow", { count: row.openInstallments })}</p>
                  <p>{t("routeOverdueInstallmentsRow", { count: row.overdueInstallments })}</p>
                  <p className="font-semibold text-foreground">{t("routePendingRow", { amount: formatInr(row.totalPending) })}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("tableRoute")}</th>
                <th className="px-4 py-3">{t("routeStudentsWithDues")}</th>
                <th className="px-4 py-3">{t("routePendingAmount")}</th>
                <th className="px-4 py-3">{t("metricOverdueInstallments")}</th>
                <th className="px-4 py-3">{t("metricOpenInstallments")}</th>
                <th className="px-4 py-3">{t("routeOldestDueDate")}</th>
                <th className="px-4 py-3">{t("tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.routeSummaryRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    {t("routeTransportEmpty")}
                  </td>
                </tr>
              ) : (
                data.routeSummaryRows.map((row) => (
                  <tr key={`${row.routeId ?? "no-route"}-${row.routeLabel}`} className="border-t border-border text-foreground">
                    <td className="px-4 py-3 font-medium text-foreground">{row.routeLabel}</td>
                    <td className="px-4 py-3">{row.studentCount}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.totalPending)}</td>
                    <td className="px-4 py-3">{row.overdueInstallments}</td>
                    <td className="px-4 py-3">{row.openInstallments}</td>
                    <td className="px-4 py-3">{formatShortDate(row.oldestDueDate)}</td>
                    <td className="px-4 py-3">
                      {row.routeId ? (
                        <div className="flex flex-wrap gap-2">
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
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("routeNoDirectFilter")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title={t("routeStudentListTitle")}
        description={t("routeStudentListDescription")}
      >
        {/* ── Mobile cards grouped by route ── */}
        <div className="space-y-3 md:hidden">
          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
              {t("routeStudentListEmpty")}
            </p>
          ) : (
            (() => {
              const sorted = [...data.rows].sort((left, right) => {
                const routeCompare = left.transportRouteLabel.localeCompare(right.transportRouteLabel);
                if (routeCompare !== 0) return routeCompare;
                return left.fullName.localeCompare(right.fullName);
              });
              const groups: { route: string; students: typeof sorted }[] = [];
              for (const row of sorted) {
                const last = groups[groups.length - 1];
                if (last && last.route === row.transportRouteLabel) {
                  last.students.push(row);
                } else {
                  groups.push({ route: row.transportRouteLabel, students: [row] });
                }
              }
              return groups.map((group) => (
                <div key={`route-group-${group.route}`} className="space-y-2">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface py-1">
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {group.route}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("routeStudentCount", { count: group.students.length })}
                    </span>
                  </div>
                  {group.students.map((row) => (
                    <div key={`route-mobile-${row.studentId}`} className="rounded-xl border border-border bg-card p-3 text-sm">
                      {/* Row 1: Name + Outstanding */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-foreground">{row.fullName}</p>
                        <span className="shrink-0 font-semibold text-foreground">{formatInr(row.totalPending)}</span>
                      </div>
                      {/* Row 2: Class + SR */}
                      <p className="text-xs text-muted-foreground">
                        {t("studentMetaLineBullet", { classLabel: row.classLabel, admissionNo: row.admissionNo })}
                      </p>
                      {/* Row 3: Details grid */}
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <p>{t("fatherLabel", { name: row.fatherName ?? "-" })}</p>
                        <p>
                          {t("phoneLabel")}{" "}
                          {row.fatherPhone ? (
                            <Link href={`tel:${row.fatherPhone}`} className="text-info-soft-foreground hover:underline">
                              {row.fatherPhone}
                            </Link>
                          ) : (
                            "-"
                          )}
                        </p>
                        <p>{t("tableLateFee")}: {formatInr(row.lateFee)}</p>
                        <p>{t("tableNextDue")}: {row.nextDueDate ? formatShortDate(row.nextDueDate) : "-"}</p>
                      </div>
                      {/* Row 4: Actions */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <DefaulterContactActions
                          row={row}
                          sessionLabel={viewSession.sessionLabel}
                        />
                        <span
                          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            row.followUpStatus === "overdue"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning-soft text-warning-soft-foreground"
                          }`}
                        >
                          {row.followUpStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()
          )}
        </div>
        {/* ── Desktop table ── */}
        <div className="hidden w-full overflow-x-auto rounded-xl border border-border md:block">
          <table className="min-w-[900px] text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("tableRoute")}</th>
                <th className="px-4 py-3">{t("tableStudent")}</th>
                <th className="px-4 py-3">{t("tableSrNo")}</th>
                <th className="px-4 py-3">{t("tableClass")}</th>
                <th className="px-4 py-3">{t("tableFather")}</th>
                <th className="px-4 py-3">{t("tablePhone")}</th>
                <th className="px-4 py-3">{t("tableOutstanding")}</th>
                <th className="px-4 py-3">{t("tableLateFee")}</th>
                <th className="px-4 py-3">{t("tableNextDue")}</th>
                <th className="px-4 py-3">{t("tableFollowUp")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    {t("routeStudentListEmpty")}
                  </td>
                </tr>
              ) : (
                [...data.rows]
                  .sort((left, right) => {
                    const routeCompare = left.transportRouteLabel.localeCompare(right.transportRouteLabel);

                    if (routeCompare !== 0) {
                      return routeCompare;
                    }

                    return left.fullName.localeCompare(right.fullName);
                  })
                  .map((row) => (
                    <tr key={`route-${row.studentId}`} className="border-t border-border text-foreground">
                      <td className="px-4 py-3">{row.transportRouteLabel}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{row.fullName}</td>
                      <td className="px-4 py-3">{row.admissionNo}</td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                      <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.totalPending)}</td>
                      <td className="px-4 py-3">{formatInr(row.lateFee)}</td>
                      <td className="px-4 py-3">
                        {row.nextDueDate ? `${formatShortDate(row.nextDueDate)} | ${formatInr(row.nextDueAmount ?? 0)}` : "-"}
                      </td>
                      <td className="px-4 py-3 capitalize">{row.followUpStatus}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
