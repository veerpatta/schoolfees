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
};

export function StudentListTable({
  students,
  hasFilters,
  canWrite,
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
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Student
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              SR no
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
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Next due
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Fee exception
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {students.map((student) => (
            <tr key={student.id} className="align-top">
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{student.fullName}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                <p>{student.admissionNo}</p>
                {isPendingAdmissionNo(student.admissionNo) ? (
                  <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    SR pending
                  </span>
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
              <td className="px-4 py-3 text-sm text-slate-700">
                <p>{student.nextDueLabel ?? "-"}</p>
                <p className="text-xs text-slate-500">
                  {student.nextDueDate ?? "-"} | {formatInr(student.nextDueAmount ?? 0)}
                </p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  label={student.feeProfileStatusLabel}
                  tone={
                    student.feeProfileStatusLabel === "Special case"
                      ? "warning"
                      : student.hasFeeProfile
                        ? "good"
                        : "accent"
                  }
                />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/protected/students/${student.id}`}>View</Link>
                  </Button>
                  {canWrite ? (
                    <Button size="sm" asChild>
                      <Link href={`/protected/students/${student.id}/edit`}>Edit</Link>
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
