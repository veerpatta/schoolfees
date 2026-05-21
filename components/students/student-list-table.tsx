import Link from "next/link";
import { Users, GraduationCap, Bus, ShieldAlert } from "lucide-react";

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
      <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
        Dues not prepared
      </span>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success-soft-foreground">
        Paid
      </span>
    );
  }

  if (student.statusLabel === "OVERDUE") {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive-soft px-2.5 py-0.5 text-xs font-semibold text-destructive-soft-foreground">
        {formatInr(student.outstandingAmount)} overdue
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-soft-foreground">
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
      <Badge variant="soft" className="flex items-center gap-1 bg-info-soft text-info-soft-foreground border-none px-2 py-0.5 text-[11px] font-medium rounded-full">
        <Users className="h-3 w-3" />
        +{student.siblingPill.siblingCount} sibling{student.siblingPill.siblingCount === 1 ? "" : "s"}
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
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="space-y-3 p-3 md:hidden">
        {students.map((student) => {
          const srNoMissing = student.status === "active" && !student.admissionNo.trim();

          return (
            <div
              key={student.id}
              className="rounded-xl border border-border bg-card p-4 transition-all hover:shadow-xs cursor-pointer"
              onClick={() => {
                window.location.href = `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`;
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-foreground text-base">{student.fullName}</p>
                    {srNoMissing ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        SR missing
                      </span>
                    ) : null}
                    <SiblingPill student={student} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-foreground">SR: {student.admissionNo}</span>
                  </p>
                </div>
                <div className="shrink-0">
                  <DuesChip student={student} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground border-t border-border/40 pt-2">
                <p className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-subtle-foreground" />
                  Class: {student.classLabel}
                </p>
                <p className="flex items-center gap-1.5">
                  <Bus className="h-3.5 w-3.5 text-subtle-foreground" />
                  Route: {student.transportRouteLabel}
                </p>
              </div>
              <div className="mt-3 flex justify-between items-center border-t border-border/40 pt-2">
                {student.conventionalDiscountLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {student.conventionalDiscountLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : <div />}
                <div className="flex items-center gap-2">
                  {canWrite ? (
                    <Link
                      href={`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      Edit
                    </Link>
                  ) : null}
                  <Link
                    href={`/protected/payments?studentId=${student.id}`}
                    className={cn(buttonVariants({ variant: "accent", size: "sm" }), "h-8 text-xs font-semibold")}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    Collect
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <table className="hidden min-w-full divide-y divide-border/60 md:table">
        <thead className="bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SR no
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Student name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Class
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Transport
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Outstanding
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                className="group cursor-pointer align-top even:bg-surface-2/30 hover:bg-surface-2 transition-colors border-b border-border/40"
                onClick={() => {
                  window.location.href = `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`;
                }}
              >
                <td className="px-4 py-3.5 text-sm font-mono text-foreground">
                  <p>{student.admissionNo}</p>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{student.fullName}</p>
                    {srNoMissing ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        SR missing
                      </span>
                    ) : null}
                    <SiblingPill student={student} />
                  </div>
                  {student.conventionalDiscountLabels.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {student.conventionalDiscountLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground">
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span>{student.classLabel}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground">
                  <div className="flex items-center gap-1.5">
                    <Bus className="h-4 w-4 text-muted-foreground" />
                    <span>{student.transportRouteLabel}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <DuesChip student={student} />
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {canWrite ? (
                      <Link
                        href={`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-7 text-xs px-2.5")}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        Edit
                      </Link>
                    ) : null}
                    <Link
                      href={`/protected/payments?studentId=${student.id}`}
                      className={cn(buttonVariants({ variant: "accent", size: "sm" }), "h-7 text-xs px-2.5 font-semibold")}
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
