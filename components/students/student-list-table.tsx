import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { isPendingAdmissionNo } from "@/lib/students/constants";
import type { StudentListItem } from "@/lib/students/types";

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  returnTo: string;
};

export function StudentListTable({
  students,
  hasFilters,
  canWrite,
  returnTo,
}: StudentListTableProps) {
  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <h3 className="text-base font-semibold text-slate-900">No students found</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {hasFilters
            ? "No records match the selected filters. Try clearing filters or broadening the search."
            : "Start by adding the first student record for this session."}
        </p>
        {!hasFilters && canWrite ? (
          <Button className="mt-4" asChild>
            <Link href="/protected/students/new">Add first student</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="space-y-3 p-3 md:hidden">
        {students.map((student) => (
          <div key={student.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{student.fullName}</p>
                <p className="text-xs text-slate-500">SR no {student.admissionNo}</p>
              </div>
              <StatusBadge
                label={student.duesStatus === "generated" ? student.statusLabel || "Prepared" : "Dues not prepared"}
                tone={student.duesStatus === "generated" ? "good" : "warning"}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <p>Class: {student.classLabel}</p>
              <p>Route: {student.transportRouteLabel}</p>
              <p className="col-span-2 text-sm font-semibold text-slate-900">
                Outstanding: {formatInr(student.outstandingAmount)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                  View
                </Link>
              </Button>
              {canWrite ? (
                <Button size="sm" asChild>
                  <Link href={`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}>
                    Edit
                  </Link>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/protected/payments?studentId=${student.id}`}>Payment</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
      <table className="hidden min-w-full divide-y divide-slate-200 md:table">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              SR no
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Student name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Class
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Transport
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Dues status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Outstanding
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {students.map((student) => (
            <tr key={student.id} className="align-top">
              <td className="px-4 py-3 text-sm text-slate-700">
                <p>{student.admissionNo}</p>
                {isPendingAdmissionNo(student.admissionNo) ? (
                  <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    SR pending
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{student.fullName}</p>
                {student.conventionalDiscountLabels.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {student.conventionalDiscountLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.classLabel}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.transportRouteLabel}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  label={student.duesStatus === "generated" ? student.statusLabel || "Prepared" : "Dues not prepared"}
                  tone={student.duesStatus === "generated" ? "good" : "warning"}
                />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {formatInr(student.outstandingAmount)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                      View
                    </Link>
                  </Button>
                  {canWrite ? (
                    <Button size="sm" asChild>
                      <Link href={`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}>
                        Edit
                      </Link>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/protected/payments?studentId=${student.id}`}>More</Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
