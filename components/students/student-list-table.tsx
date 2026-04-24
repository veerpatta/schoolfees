import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { isPendingAdmissionNo } from "@/lib/students/constants";
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
      <table className="min-w-[1800px] divide-y divide-slate-200">
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
              DOB
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Father / phone
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Mother phone
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              New / Old
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Transport
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Fee exceptions
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Tuition
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Transport fee
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Academic fee
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Gross
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Discount
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Base total
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Installments
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Paid
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Late fee
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
              Total due
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Outstanding
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Next due
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Last payment
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Flags
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
              <td className="px-4 py-3 text-sm text-slate-700">{student.dateOfBirth ?? "-"}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.fatherPhone || "-"}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.motherPhone || "-"}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.studentStatusLabel}</td>
              <td className="px-4 py-3 text-sm text-slate-700">{student.transportRouteLabel}</td>
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
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.tuitionFee)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.transportFee)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.academicFee)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.grossBaseBeforeDiscount)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.discountAmount)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.baseTotalDue)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>I1 {formatInr(student.installment1Base)}</span>
                  <span>I2 {formatInr(student.installment2Base)}</span>
                  <span>I3 {formatInr(student.installment3Base)}</span>
                  <span>I4 {formatInr(student.installment4Base)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.totalPaid)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.lateFeeTotal)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-700">
                {formatInr(student.totalDue)}
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
                {student.statusLabel ? (
                  <StatusBadge
                    label={student.statusLabel}
                    tone={
                      student.statusLabel === "PAID"
                        ? "good"
                        : student.statusLabel === "OVERDUE"
                          ? "warning"
                          : "accent"
                    }
                  />
                ) : (
                  <StudentStatusBadge status={student.status} />
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                <p>{student.lastPaymentDate ?? "-"}</p>
                <p className="text-xs text-slate-500">
                  {formatInr(student.lastPaymentAmount)}
                </p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {student.duplicateSrFlag ? (
                    <StatusBadge label="Duplicate SR" tone="warning" />
                  ) : null}
                  {student.missingDobFlag ? (
                    <StatusBadge label="DOB missing" tone="accent" />
                  ) : null}
                  {student.missingClassFlag ? (
                    <StatusBadge label="Class missing" tone="warning" />
                  ) : null}
                  {student.missingStatusFlag ? (
                    <StatusBadge label="Status missing" tone="warning" />
                  ) : null}
                  {!student.duplicateSrFlag &&
                  !student.missingDobFlag &&
                  !student.missingClassFlag &&
                  !student.missingStatusFlag ? (
                    <span className="text-xs text-slate-500">No blocking flags</span>
                  ) : null}
                </div>
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
