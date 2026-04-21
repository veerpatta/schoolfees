import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { DefaulterFilters } from "@/components/defaulters/defaulter-filters";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters as DefaulterFiltersType,
} from "@/lib/defaulters/types";
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
  const data = await getDefaultersPageData(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Defaulters"
        title="Outstanding follow-up register"
        description="Filter class-wise and route-wise defaulters, keep overdue follow-up visible, and use a flat table that is easy to export."
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      </section>

      <SectionCard
        title="Defaulter list"
        description="The table stays flat so staff can copy or export it to spreadsheet formats without rework."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">SR no</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Pending amount</th>
                <th className="px-4 py-3">Overdue installments</th>
                <th className="px-4 py-3">Open installments</th>
                <th className="px-4 py-3">Oldest due date</th>
                <th className="px-4 py-3">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
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
                    <td className="px-4 py-3">{row.admissionNo}</td>
                    <td className="px-4 py-3">{row.classLabel}</td>
                    <td className="px-4 py-3">{row.transportRouteLabel}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatInr(row.totalPending)}
                    </td>
                    <td className="px-4 py-3">{row.overdueInstallments}</td>
                    <td className="px-4 py-3">{row.openInstallments}</td>
                    <td className="px-4 py-3">{formatShortDate(row.oldestDueDate)}</td>
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
