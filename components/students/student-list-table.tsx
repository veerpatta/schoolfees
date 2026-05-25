"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, GraduationCap, ShieldAlert, ChevronRight, Phone, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { StudentListItem } from "@/lib/students/types";
import { cn } from "@/lib/utils";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  returnTo: string;
  session?: string;
};

function OutstandingCell({ student }: { student: StudentListItem }) {
  if (student.duesStatus !== "generated") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold text-muted-foreground font-mono">—</span>
        <Badge variant="outline" className="rounded-full text-[10px] py-0 px-2 font-medium border-border">
          Dues not prepared
        </Badge>
      </div>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <Badge variant="success" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
          Year Clear ✓
        </Badge>
      </div>
    );
  }

  const isOverdue = student.overdueAmount > 0;
  // Candidate late fee: if overdue and pendingLateFeeAmount is 0 (not yet materialised in view),
  // show lateFeeTotal from the workbook view as an indicator.
  const effectiveLateFee = student.pendingLateFeeAmount > 0
    ? student.pendingLateFeeAmount
    : (isOverdue && student.lateFeeTotal > 0 ? student.lateFeeTotal : 0);

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          "text-sm font-bold font-mono",
          isOverdue ? "text-destructive" : "text-warning"
        )}
      >
        {formatInr(student.outstandingAmount)}
      </span>
      <div className="flex flex-col items-end gap-0.5">
        {isOverdue ? (
          <>
            <Badge variant="danger" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
              {formatInr(student.overdueAmount)} overdue
            </Badge>
            {effectiveLateFee > 0 ? (
              <span className="text-[9px] font-semibold text-destructive/80 mt-0.5 whitespace-nowrap">
                + {formatInr(effectiveLateFee)} late fee
              </span>
            ) : student.hasLateFeeWaiver ? (
              <span className="text-[9px] font-semibold text-success-soft-foreground mt-0.5 whitespace-nowrap">
                Late fee waived
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <Badge variant="warning" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
              Pending
            </Badge>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-success-soft-foreground mt-0.5 whitespace-nowrap">
              <Clock className="h-2.5 w-2.5" />
              On track
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function discountLabelHint(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("rte")) return "RTE — tuition waived to ₹0 for this session.";
  if (normalized.includes("staff")) return "Staff Child — 50% tuition discount.";
  if (normalized.includes("3rd") || normalized.includes("third"))
    return "3rd Child Policy — tuition capped at ₹6,000.";
  return `${label} — conventional discount applied.`;
}

function SiblingPill({ student, session }: { student: StudentListItem; session?: string }) {
  if (!student.siblingPill || student.siblingPill.siblingCount < 1) {
    return null;
  }

  return (
    <Link
      href={appendSessionParam(student.siblingPill.href, session)}
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

function DataQualityFlags({ student }: { student: StudentListItem }) {
  const flags = [];
  if (student.duplicateSrFlag) {
    flags.push(
      <span key="dup-sr" title="Duplicate SR number">
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingDobFlag) {
    flags.push(
      <span key="miss-dob" title="Date of birth missing">
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingClassFlag) {
    flags.push(
      <span key="miss-class" title="Class not assigned">
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingStatusFlag) {
    flags.push(
      <span key="miss-status" title="Status not set">
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }

  if (flags.length === 0) return null;

  return <span className="flex items-center gap-1 mt-0.5">{flags}</span>;
}

const MobileStudentListItem = React.memo(function MobileStudentListItem({
  student,
  returnTo,
  session,
  canWrite,
}: {
  student: StudentListItem;
  returnTo: string;
  session?: string;
  canWrite: boolean;
}) {
  const withSession = (href: string) => appendSessionParam(href, session);
  const srNoMissing = student.status === "active" && !student.admissionNo.trim();
  const studentHref = withSession(
    `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`,
  );

  const router = useRouter();
  const handleRowOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest('[data-row-action="true"]')) return;
    router.push(studentHref);
  };
  const handleRowKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest('[data-row-action="true"]')) return;
    event.preventDefault();
    router.push(studentHref);
  };

  return (
    <li
      role="link"
      tabIndex={0}
      aria-label={`Open ${student.fullName}`}
      onClick={handleRowOpen}
      onKeyDown={handleRowKey}
      className="group relative flex cursor-pointer items-center gap-3 pl-6 pr-3 py-4 transition-all hover:bg-surface-2/50 active:bg-surface-2 border-b border-border/40 focus-visible:outline-none focus-visible:bg-surface-2"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" } as React.CSSProperties}
    >
      {/* Visual Dues Indicator Strip */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1",
        student.duesStatus !== "generated"
          ? "bg-muted-foreground/20"
          : student.outstandingAmount <= 0
          ? "bg-success"
          : student.overdueAmount > 0
          ? "bg-destructive"
          : "bg-warning"
      )} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground break-words">
            {student.fullName}
          </span>
          {srNoMissing ? (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-medium text-warning-soft-foreground flex items-center gap-0.5">
              <ShieldAlert className="h-2.5 w-2.5" />
              SR missing
            </span>
          ) : null}
          <span data-row-action="true" className="inline-flex">
            <SiblingPill student={student} session={session} />
          </span>
          <DataQualityFlags student={student} />
          {student.status !== "active" && (
            <StudentStatusBadge status={student.status} />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {student.classLabel} · SR {student.admissionNo || "Pending"}
        </p>
        {(student.fatherPhone || student.motherPhone) && (
          <p className="text-xs text-muted-foreground mt-1">
            <a
              href={`tel:${student.fatherPhone || student.motherPhone}`}
              data-row-action="true"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <Phone className="h-3 w-3" />
              <span>{student.fatherPhone || student.motherPhone}</span>
            </a>
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <OutstandingCell student={student} />
      </div>

      {canWrite && (
        <span
          data-row-action="true"
          onClick={(event) => event.stopPropagation()}
          className="shrink-0"
        >
          <StudentRowCollectButton
            studentId={student.id}
            studentLabel={student.fullName}
            classLabel={student.classLabel}
            variant="primary"
          />
        </span>
      )}

      <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" aria-hidden="true" />
    </li>
  );
});

export const StudentListTable = React.memo(function StudentListTable({
  students,
  hasFilters,
  canWrite,
  returnTo,
  session,
}: StudentListTableProps) {
  const router = useRouter();
  const withSession = (href: string) => appendSessionParam(href, session);

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
          <Link href={withSession("/protected/students/new")} className={cn(buttonVariants(), "mt-4")}>
            Add first student
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-xs">
      <ul className="divide-y divide-border/60 md:hidden bg-card">
        {students.map((student) => (
          <MobileStudentListItem
            key={student.id}
            student={student}
            returnTo={returnTo}
            session={session}
            canWrite={canWrite}
          />
        ))}
      </ul>
      <table className="hidden min-w-full divide-y divide-border/60 md:table">
        <thead className="bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6">
              SR no
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Student name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Class
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Next Due
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground pr-6">
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
                style={{ contentVisibility: "auto", containIntrinsicSize: "0 56px" } as React.CSSProperties}
                onClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  if (target && target.closest('[data-row-action="true"]')) return;
                  router.push(withSession(`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`));
                }}
              >
                <td className="relative px-4 py-3.5 text-sm font-mono text-foreground pl-6">
                  {/* Visual Dues Indicator Strip */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1",
                    student.duesStatus !== "generated"
                      ? "bg-muted-foreground/20"
                      : student.outstandingAmount <= 0
                      ? "bg-success"
                      : student.overdueAmount > 0
                      ? "bg-destructive"
                      : "bg-warning"
                  )} />
                  <p>{student.admissionNo || "—"}</p>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{student.fullName}</p>
                    {student.status !== "active" && (
                      <StudentStatusBadge status={student.status} />
                    )}
                    {srNoMissing ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        SR missing
                      </span>
                    ) : null}
                    <SiblingPill student={student} session={session} />
                  </div>
                  <DataQualityFlags student={student} />
                  {student.conventionalDiscountLabels.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {student.conventionalDiscountLabels.map((label) => (
                        <span
                          key={label}
                          title={discountLabelHint(label)}
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
                  {!student.nextDueLabel ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{student.nextDueLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {student.nextDueDate ? formatShortDate(student.nextDueDate) : ""}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right pr-6">
                  {student.outstandingAmount > 0 && student.duesStatus === "generated" ? (
                    <Link
                      href={withSession(`/protected/students/${student.id}/ledger?returnTo=${encodeURIComponent(returnTo)}`)}
                      onClick={(e) => e.stopPropagation()}
                      className="block hover:opacity-80 transition-opacity"
                    >
                      <OutstandingCell student={student} />
                    </Link>
                  ) : (
                    <OutstandingCell student={student} />
                  )}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    {canWrite && (
                      <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Link
                          href={withSession(`/protected/students/${student.id}/edit?returnTo=${encodeURIComponent(returnTo)}`)}
                          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-7 text-xs px-2.5")}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                    {canWrite && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <StudentRowCollectButton
                          studentId={student.id}
                          studentLabel={student.fullName}
                          classLabel={student.classLabel}
                          variant="primary"
                        />
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
