import Link from "next/link";
import { Users, GraduationCap, Bus, ShieldAlert, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import type { StudentListItem } from "@/lib/students/types";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";
import { appendSessionParam } from "@/lib/navigation/session-href";

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  returnTo: string;
  session?: string;
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
  session,
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

  const withSession = (href: string) => appendSessionParam(href, session);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <ul className="divide-y divide-border/60 md:hidden bg-card">
        {students.map((student) => {
          const srNoMissing = student.status === "active" && !student.admissionNo.trim();

          return (
            <li key={student.id} className="group relative">
              <Link
                href={withSession(`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`)}
                className="flex items-center gap-3 px-4 py-4 transition-all hover:bg-surface-2/50 active:bg-surface-2"
              >
                {/* Status dot */}
                <span className={cn(
                  "size-2.5 shrink-0 rounded-full mt-0.5",
                  student.status === "active" ? "bg-success" : "bg-muted-foreground/30"
                )} />

                {/* Name + class + admission */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-foreground truncate text-sm">{student.fullName}</p>
                    {srNoMissing ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-medium text-warning-soft-foreground flex items-center gap-0.5">
                        <ShieldAlert className="h-2.5 w-2.5" />
                        SR missing
                      </span>
                    ) : null}
                    <SiblingPill student={student} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {student.classLabel} · SR {student.admissionNo || "Pending"}
                  </p>
                </div>

                {/* Pending amount if any */}
                {student.outstandingAmount > 0 ? (
                  <div className="shrink-0 text-right">
                    <Money value={student.outstandingAmount} size="sm" tone="warning" />
                    <p className="text-[10px] text-muted-foreground">pending</p>
                  </div>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground">
                      Paid
                    </span>
                  </div>
                )}

                <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
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
