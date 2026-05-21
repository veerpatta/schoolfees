import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import type { StudentListItem } from "@/lib/students/types";
import { cn } from "@/lib/utils";

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  returnTo: string;
};

function DuesChip({ student }: { student: StudentListItem }) {
  if (student.duesStatus !== "generated") {
    return (
      <span className="inline-flex items-center rounded-full border bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
        Dues not prepared
      </span>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <span className="inline-flex items-center rounded-full border bg-success-soft px-2 py-0.5 text-xs font-medium text-success-soft-foreground">
        {formatInr(0)} paid
      </span>
    );
  }

  if (student.statusLabel === "OVERDUE") {
    return (
      <span className="inline-flex items-center rounded-full border bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive-soft-foreground">
        {formatInr(student.outstandingAmount)} overdue
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-soft-foreground">
      {formatInr(student.outstandingAmount)} due
    </span>
  );
}

function SiblingPill({ student }: { student: StudentListItem }) {
  if (!student.siblingPill || student.siblingPill.siblingCount < 1) {
    return null;
  }

  return (
    <Link
      href={student.siblingPill.href}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Badge variant="soft">
        +{student.siblingPill.siblingCount} sibling
        {student.siblingPill.siblingCount === 1 ? "" : "s"}
      </Badge>
    </Link>
  );
}

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
          <Link href="/protected/students/new" className={cn(buttonVariants(), "mt-4")}>
            Add first student
          </Link>
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
            <Link href={`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`} className="block">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{student.fullName}</p>
                    {srNoMissing ? (
                      <span className="rounded-full border bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                        SR no missing
                      </span>
                    ) : null}
                    <SiblingPill student={student} />
                  </div>
                  <p className="text-xs text-muted-foreground">SR no {student.admissionNo}</p>
                </div>
                <DuesChip student={student} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <p>Class: {student.classLabel}</p>
                <p>Route: {student.transportRouteLabel}</p>
              </div>
            </Link>
            <div className="mt-3">
              <Link
                href={`/protected/payments?studentId=${student.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Collect
              </Link>
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
            <tr
              key={student.id}
              className="group cursor-pointer align-top"
              onClick={() => {
                window.location.href = `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              <td className="px-4 py-3 text-sm text-foreground">
                <p>{student.admissionNo}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{student.fullName}</p>
                  {srNoMissing ? (
                    <span className="rounded-full border bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                      SR no missing
                    </span>
                  ) : null}
                  <SiblingPill student={student} />
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
                <DuesChip student={student} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {canWrite ? (
                    <Link
                      href={`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                      className={buttonVariants({ size: "sm" })}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      Edit
                    </Link>
                  ) : null}
                  <Link
                    href={`/protected/payments?studentId=${student.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    Collect
                  </Link>
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
