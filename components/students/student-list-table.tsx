import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import type { StudentListItem } from "@/lib/students/types";

import { StudentStatusBadge } from "./student-status-badge";

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
              Student status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Transport
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Record status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Outstanding
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Phones
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
              <td className="px-4 py-3 text-sm text-slate-700">{student.admissionNo}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.classLabel}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.studentStatusLabel}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.transportRouteLabel}</td>
              <td className="px-4 py-3">
                <StudentStatusBadge status={student.status} />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {formatInr(student.outstandingAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                <p>{student.fatherPhone || "-"}</p>
                <p>{student.motherPhone || "-"}</p>
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
