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
      <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-8 text-center">
        <h3 className="text-base font-semibold text-foreground">No students found</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
    <div className="rounded-xl border border-border">
      <div className="space-y-3 p-3 md:hidden">
        {students.map((student) => {
          const srNoMissing = student.status === "active" && !student.admissionNo.trim();

          return (
          <div key={student.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{student.fullName}</p>
                  {srNoMissing ? (
                    <span className="rounded-full border bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                      SR no missing
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">SR no {student.admissionNo}</p>
              </div>
              <StatusBadge
                label={student.duesStatus === "generated" ? student.statusLabel || "Prepared" : "Dues not prepared"}
                tone={student.duesStatus === "generated" ? "good" : "warning"}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>Class: {student.classLabel}</p>
              <p>Route: {student.transportRouteLabel}</p>
              <p className="col-span-2 text-sm font-semibold text-foreground">
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
          );
        })}
      </div>
      <table className="hidden min-w-full divide-y divide-border md:table">
        <thead className="bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SR no
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Student name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Class
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transport
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dues status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Outstanding
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {students.map((student) => {
            const srNoMissing = student.status === "active" && !student.admissionNo.trim();

            return (
            <tr key={student.id} className="align-top">
              <td className="px-4 py-3 text-sm text-foreground">
                <p>{student.admissionNo}</p>
                {isPendingAdmissionNo(student.admissionNo) ? (
                  <span className="mt-1 inline-flex rounded-full border bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                    SR pending
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{student.fullName}</p>
                  {srNoMissing ? (
                    <span className="rounded-full border bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                      SR no missing
                    </span>
                  ) : null}
                </div>
                {student.conventionalDiscountLabels.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {student.conventionalDiscountLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border bg-success-soft px-2 py-0.5 text-xs font-medium text-success-soft-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-sm text-foreground">{student.classLabel}</td>
              <td className="px-4 py-3 text-sm text-foreground">{student.transportRouteLabel}</td>
              <td className="px-4 py-3">
                <StatusBadge
                  label={student.duesStatus === "generated" ? student.statusLabel || "Prepared" : "Dues not prepared"}
                  tone={student.duesStatus === "generated" ? "good" : "warning"}
                />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-foreground">
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
