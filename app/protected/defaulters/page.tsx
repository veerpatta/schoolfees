import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters as DefaulterFiltersType,
} from "@/lib/defaulters/types";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { requireStaffPermission } from "@/lib/supabase/session";

type DefaultersPageProps = {
  searchParams?: Promise<{
    classId?: string | string[];
    transportRouteId?: string | string[];
    overdue?: string | string[];
    minPendingAmount?: string | string[];
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
  await requireStaffPermission("defaulters:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = normalizeFilters(resolvedSearchParams);
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const data = await getDefaultersPageData(filters, viewSession.sessionLabel);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Defaulters"
        title="Outstanding follow-up register"
        description={`Phone-ready overdue list for ${viewSession.sessionLabel}. Highest risk appears first.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={`${data.rows.length} row${data.rows.length === 1 ? "" : "s"} listed`}
              tone="accent"
            />
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/exports/defaulters">Export</Link>
            </Button>
          </div>
        }
      />

      <OfficeNotice tone="info">
        Use this screen for calls and follow-up only. Collect payments from Payment Desk.
      </OfficeNotice>

      <SectionCard
        title="Filters"
        description="Keep the follow-up list narrow enough for the office team to act on."
      >
        <DefaulterFilters
          filters={filters}
          classOptions={data.classOptions}
          routeOptions={data.routeOptions}
          sessionLabel={viewSession.sessionLabel}
        />
      </SectionCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Students listed
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.totalStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Students currently matching the selected follow-up filters.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pending amount
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {formatInr(data.metrics.totalPending)}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Current outstanding balance across listed students.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Overdue installments
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.overdueInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Installments already past due date and still unpaid.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Open installments
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {data.metrics.openInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pending, partial, and overdue installments across the listed rows.
          </p>
        </div>

        <div className="rounded-lg border bg-warning-soft p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-soft-foreground">
            Dues not prepared
          </p>
          <div className="mt-2 text-2xl font-semibold text-warning-soft-foreground">
            {data.metrics.missingDuesStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-warning-soft-foreground">
            Active students whose dues need preparation, not counted as true defaulters.
          </p>
        </div>
      </section>

      {data.missingDuesRows.length > 0 ? (
        <SectionCard
          title="Students whose dues are not prepared"
          description="These active students are not treated as defaulters yet. Prepare dues before collection or follow-up."
        >
          <div className="space-y-3 md:hidden">
            {data.missingDuesRows.map((row) => (
              <div key={`missing-mobile-${row.studentId}`} className="rounded-xl border bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning-soft-foreground">{row.fullName}</p>
                <p className="text-xs text-warning-soft-foreground">{row.classLabel} • SR {row.admissionNo}</p>
                <p className="mt-1 text-xs text-warning-soft-foreground">Phone: {row.fatherPhone ?? "-"}</p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link href={`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`}>Prepare dues</Link>
                </Button>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-warning/30 md:block">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-warning-soft text-xs uppercase tracking-wide text-warning-soft-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">SR no</th>
                  <th className="px-4 py-3">Father</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Dues</th>
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
                        href={`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`}
                      >
                        Prepare dues
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
        title="Defaulter list"
        description="Ranked by pending amount and overdue days so the highest-risk follow-ups appear first."
      >
        <div className="space-y-3 md:hidden">
          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
              No defaulters found for the selected filters.
            </p>
          ) : (
            data.rows.map((row) => (
              <div key={row.studentId} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-soft-foreground">
                    Rank #{row.rank}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatInr(row.totalPending)}</span>
                </div>
                <p className="mt-2 font-semibold text-foreground">{row.fullName}</p>
                <p className="text-xs text-muted-foreground">SR no {row.admissionNo} • {row.classLabel}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Days overdue: {row.daysOverdue}</p>
                  <p>Oldest due: {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}</p>
                  <p>Father: {row.fatherName ?? "-"}</p>
                  <p>Last payment: {row.lastPaymentDate ? formatShortDate(row.lastPaymentDate) : "-"}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.fatherPhone ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`tel:${row.fatherPhone}`}>Call</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/protected/students/${row.studentId}`}>Open Student</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/protected/payments?studentId=${row.studentId}${row.classId ? `&classId=${row.classId}` : ""}`}>Collect</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Father</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Oldest due</th>
                <th className="px-4 py-3">Days overdue</th>
                <th className="px-4 py-3">Last payment</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    No defaulters found for the selected filters.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <tr
                    key={row.studentId}
                    className="border-t border-border text-foreground"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">#{row.rank}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.fullName}</div>
                      <div className="text-xs text-muted-foreground">SR no {row.admissionNo}</div>
                    </td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                    <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatInr(row.totalPending)}
                    </td>
                    <td className="px-4 py-3">
                      {row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "-"}
                    </td>
                    <td className="px-4 py-3">{row.daysOverdue}</td>
                    <td className="px-4 py-3">
                      {row.lastPaymentDate ? formatShortDate(row.lastPaymentDate) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/protected/students/${row.studentId}`}
                          className="text-sm font-semibold text-info-soft-foreground hover:text-info-soft-foreground"
                        >
                          View
                        </Link>
                        <Link
                          href={`/protected/payments?studentId=${row.studentId}`}
                          className="text-sm font-semibold text-info-soft-foreground hover:text-info-soft-foreground"
                        >
                          Collect
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Route-wise transport outstanding"
        description="Use this view for transport follow-up and route-level reconciliation work."
      >
        <div className="space-y-3 md:hidden">
          {data.routeSummaryRows.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
              No route-wise outstanding rows for the selected filters.
            </p>
          ) : (
            data.routeSummaryRows.map((row) => (
              <div key={`route-mobile-${row.routeId ?? row.routeLabel}`} className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="font-semibold text-foreground">{row.routeLabel}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Students: {row.studentCount}</p>
                  <p>Open installments: {row.openInstallments}</p>
                  <p>Overdue installments: {row.overdueInstallments}</p>
                  <p className="font-semibold text-foreground">Pending: {formatInr(row.totalPending)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Students with dues</th>
                <th className="px-4 py-3">Pending amount</th>
                <th className="px-4 py-3">Overdue installments</th>
                <th className="px-4 py-3">Open installments</th>
                <th className="px-4 py-3">Oldest due date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.routeSummaryRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No route-wise outstanding rows for the selected filters.
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
                            href={`/protected/defaulters?transportRouteId=${row.routeId}`}
                          >
                            Open defaulters
                          </Link>
                          <Link
                            className="text-xs font-medium text-info-soft-foreground hover:underline"
                            href={`/protected/students?transportRouteId=${row.routeId}`}
                          >
                            Open students
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No direct route filter</span>
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
        title="Route-wise student list"
        description="Operational student list grouped by route for office calls and overdue follow-up."
      >
        <div className="w-full overflow-x-auto rounded-xl border border-border">
          <table className="min-w-[900px] text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">SR no</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Father</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Outstanding</th>
                <th className="px-4 py-3">Late fee</th>
                <th className="px-4 py-3">Next due</th>
                <th className="px-4 py-3">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    No route-wise students for the selected filters.
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
