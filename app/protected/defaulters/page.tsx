import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters as DefaulterFiltersType,
} from "@/lib/defaulters/types";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { requireStaffPermission } from "@/lib/supabase/session";

type DefaultersPageProps = {
  searchParams?: Promise<{
    classId?: string;
    transportRouteId?: string;
    overdue?: string;
    minPendingAmount?: string;
  }>;
};

function normalizeFilters(
  params: Awaited<DefaultersPageProps["searchParams"]>,
): DefaulterFiltersType {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const rawClassId = params?.classId?.trim() ?? "";
  const rawRouteId = params?.transportRouteId?.trim() ?? "";
  const rawOverdue = params?.overdue?.trim() ?? "";
  const rawMinPendingAmount = params?.minPendingAmount?.trim() ?? "";

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
  };
}

export default async function DefaultersPage({
  searchParams,
}: DefaultersPageProps) {
  await requireStaffPermission("defaulters:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = normalizeFilters(resolvedSearchParams);
  const [data, policy] = await Promise.all([
    getDefaultersPageData(filters),
    getFeePolicySummary(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Defaulters"
        title="Outstanding follow-up register"
        description={`Phone-ready overdue list for ${policy.academicSessionLabel}.`}
        actions={
          <StatusBadge
            label={`${data.rows.length} row${data.rows.length === 1 ? "" : "s"} listed`}
            tone="accent"
          />
        }
      />

      <SectionCard
        title="Filters"
        description="Keep the follow-up list narrow enough for the office team to act on."
      >
        <DefaulterFilters
          filters={filters}
          classOptions={data.classOptions}
          routeOptions={data.routeOptions}
        />
      </SectionCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Students listed
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {data.metrics.totalStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Students currently matching the selected follow-up filters.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pending amount
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatInr(data.metrics.totalPending)}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Current outstanding balance across listed students.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Overdue installments
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {data.metrics.overdueInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Installments already past due date and still unpaid.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Open installments
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {data.metrics.openInstallments}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Pending, partial, and overdue installments across the listed rows.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            Dues not prepared
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-amber-950">
            {data.metrics.missingDuesStudents}
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Active students whose dues need preparation, not counted as true defaulters.
          </p>
        </div>
      </section>

      {data.missingDuesRows.length > 0 ? (
        <SectionCard
          title="Students whose dues are not prepared"
          description="These active students are not treated as defaulters yet. Prepare dues before collection or follow-up."
        >
          <div className="overflow-x-auto rounded-xl border border-amber-200">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-800">
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
                  <tr key={`missing-${row.studentId}`} className="border-t border-amber-100 text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.admissionNo}</td>
                    <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                    <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                    <td className="px-4 py-3">{row.transportRouteLabel}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-xs font-medium text-blue-700 hover:underline"
                        href={`/protected/payments?studentId=${row.studentId}`}
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
        description="Phone-ready overdue list with only the fields needed for follow-up."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Status / Next due</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No defaulters found for the selected filters.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <tr
                    key={row.studentId}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatInr(row.totalPending)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="capitalize">{row.followUpStatus}</div>
                      <div className="text-xs text-slate-500">
                        {formatShortDate(row.nextDueDate)} · {formatInr(row.nextDueAmount ?? 0)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/protected/students/${row.studentId}`}
                        className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                      >
                        View
                      </Link>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No route-wise outstanding rows for the selected filters.
                  </td>
                </tr>
              ) : (
                data.routeSummaryRows.map((row) => (
                  <tr key={`${row.routeId ?? "no-route"}-${row.routeLabel}`} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.routeLabel}</td>
                    <td className="px-4 py-3">{row.studentCount}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.totalPending)}</td>
                    <td className="px-4 py-3">{row.overdueInstallments}</td>
                    <td className="px-4 py-3">{row.openInstallments}</td>
                    <td className="px-4 py-3">{formatShortDate(row.oldestDueDate)}</td>
                    <td className="px-4 py-3">
                      {row.routeId ? (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="text-xs font-medium text-blue-700 hover:underline"
                            href={`/protected/defaulters?transportRouteId=${row.routeId}`}
                          >
                            Open defaulters
                          </Link>
                          <Link
                            className="text-xs font-medium text-blue-700 hover:underline"
                            href={`/protected/students?transportRouteId=${row.routeId}`}
                          >
                            Open students
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">No direct route filter</span>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
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
                    <tr key={`route-${row.studentId}`} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3">{row.transportRouteLabel}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                      <td className="px-4 py-3">{row.admissionNo}</td>
                      <td className="px-4 py-3">{row.classLabel}</td>
                      <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                      <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatInr(row.totalPending)}</td>
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
