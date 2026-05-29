"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, GraduationCap, ShieldAlert, ChevronRight, Phone, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StudentAvatar } from "@/components/students/student-avatar";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { timeAgoShort } from "@/lib/helpers/time-ago";
import type { StudentListItem } from "@/lib/students/types";
import { cn } from "@/lib/utils";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";

type StudentsTranslator = ReturnType<typeof useTranslations<"Students">>;

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  returnTo: string;
  session?: string;
  /** Map of studentId → last student_view event ISO timestamp by current user. */
  lastViewedByUser?: Record<string, string>;
  /** When provided, the table renders a multi-select checkbox column. */
  selection?: {
    selectedIds: ReadonlyArray<string>;
    onToggle: (studentId: string) => void;
    onToggleAll: (studentIds: ReadonlyArray<string>, shouldSelect: boolean) => void;
  };
};

function OutstandingCell({ student, t }: { student: StudentListItem; t: StudentsTranslator }) {
  if (student.duesStatus !== "generated") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold text-muted-foreground font-mono">—</span>
        <Badge variant="outline" className="rounded-full text-[10px] py-0 px-2 font-medium border-border">
          {t("duesNotPrepared")}
        </Badge>
      </div>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <Badge variant="success" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
          {t("yearClear")}
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
              {t("overdueBadge", { amount: formatInr(student.overdueAmount) })}
            </Badge>
            {effectiveLateFee > 0 ? (
              <span className="text-[9px] font-semibold text-destructive/80 mt-0.5 whitespace-nowrap">
                {t("lateFeeSuffix", { amount: formatInr(effectiveLateFee) })}
              </span>
            ) : student.hasLateFeeWaiver ? (
              <span className="text-[9px] font-semibold text-success-soft-foreground mt-0.5 whitespace-nowrap">
                {t("lateFeeWaived")}
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <Badge variant="warning" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
              {t("pendingBadge")}
            </Badge>
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-success-soft-foreground mt-0.5 whitespace-nowrap">
              <Clock className="h-2.5 w-2.5" />
              {t("onTrackHint")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function discountLabelHint(label: string, t: StudentsTranslator) {
  const normalized = label.toLowerCase();
  if (normalized.includes("rte")) return t("discountHintRte");
  if (normalized.includes("staff")) return t("discountHintStaff");
  if (normalized.includes("3rd") || normalized.includes("third"))
    return t("discountHintThird");
  return t("discountHintGeneric", { label });
}

function SiblingPill({ student, t }: { student: StudentListItem; session?: string; t: StudentsTranslator }) {
  if (!student.siblingPill || student.siblingPill.siblingCount < 1) {
    return null;
  }

  // Informational only — the row itself opens the profile, where siblings are
  // viewed and managed. (Previously this linked to the removed Families page,
  // which caused taps to navigate away from the student profile.)
  return (
    <Badge variant="soft" className="flex items-center gap-1 bg-info-soft text-info-soft-foreground border-none px-2 py-0.5 text-[11px] font-medium rounded-full">
      <Users className="h-3 w-3" />
      {t("siblingPillSuffix", { count: student.siblingPill.siblingCount })}
    </Badge>
  );
}

function DataQualityFlags({ student, t }: { student: StudentListItem; t: StudentsTranslator }) {
  const flags = [];
  if (student.duplicateSrFlag) {
    flags.push(
      <span key="dup-sr" title={t("flagDuplicateSr")}>
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingDobFlag) {
    flags.push(
      <span key="miss-dob" title={t("flagMissingDob")}>
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingClassFlag) {
    flags.push(
      <span key="miss-class" title={t("flagMissingClass")}>
        <AlertTriangle className="h-3 w-3 text-warning inline-block" />
      </span>
    );
  }
  if (student.missingStatusFlag) {
    flags.push(
      <span key="miss-status" title={t("flagMissingStatus")}>
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
  lastViewedAt,
  t,
}: {
  student: StudentListItem;
  returnTo: string;
  session?: string;
  canWrite: boolean;
  lastViewedAt?: string | null;
  t: StudentsTranslator;
}) {
  const withSession = (href: string) => appendSessionParam(href, session);
  const srNoMissing = student.status === "active" && !student.admissionNo.trim();
  const studentHref = withSession(
    `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`,
  );
  const contactPhone = student.fatherPhone || student.motherPhone;
  const showCollect = canWrite && student.status === "active" && student.outstandingAmount > 0 && student.duesStatus === "generated";

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
      aria-label={t("openStudentAria", { name: student.fullName })}
      onClick={handleRowOpen}
      onKeyDown={handleRowKey}
      className="group relative flex cursor-pointer flex-col gap-2 pl-6 pr-3 py-3.5 transition-all hover:bg-surface-2/50 active:bg-surface-2 border-b border-border/40 focus-visible:outline-none focus-visible:bg-surface-2"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 96px" } as React.CSSProperties}
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

      {/* Top tier: identity (left) + outstanding (right) */}
      <div className="flex items-start gap-3">
        <StudentAvatar photoPath={student.photoPath} fullName={student.fullName} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {student.fullName}
            </span>
            {student.status !== "active" && (
              <StudentStatusBadge status={student.status} />
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {srNoMissing ? (
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[9px] font-medium text-warning-soft-foreground flex items-center gap-0.5">
                <ShieldAlert className="h-2.5 w-2.5" />
                {t("srMissingBadge")}
              </span>
            ) : null}
            <SiblingPill student={student} session={session} t={t} />
            <DataQualityFlags student={student} t={t} />
          </div>

          <p className="text-xs text-muted-foreground mt-1 truncate">
            {t("classLineWithSr", { class: student.classLabel, sr: student.admissionNo || t("tableSrPending") })}
          </p>
          {lastViewedAt ? (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
              {t("lastViewedByYou", { when: timeAgoShort(lastViewedAt) ?? t("lastViewedFallback") })}
            </p>
          ) : null}
          {contactPhone ? (
            <p className="text-xs text-muted-foreground mt-1">
              <a
                href={`tel:${contactPhone}`}
                data-row-action="true"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Phone className="h-3 w-3" />
                <span>{contactPhone}</span>
              </a>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-1 text-right">
          <OutstandingCell student={student} t={t} />
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" aria-hidden="true" />
        </div>
      </div>

      {/* Action tier: Collect sits on its own row so it never crowds the name */}
      {showCollect ? (
        <div
          data-row-action="true"
          onClick={(event) => event.stopPropagation()}
          className="flex justify-end"
        >
          <StudentRowCollectButton
            studentId={student.id}
            studentLabel={student.fullName}
            classLabel={student.classLabel}
            variant="primary"
            size="sm"
          />
        </div>
      ) : null}
    </li>
  );
});

export const StudentListTable = React.memo(function StudentListTable({
  students,
  hasFilters,
  canWrite,
  returnTo,
  session,
  lastViewedByUser,
  selection,
}: StudentListTableProps) {
  const t = useTranslations("Students");
  const router = useRouter();
  const withSession = (href: string) => appendSessionParam(href, session);
  const selectedIdSet = React.useMemo(
    () => new Set(selection?.selectedIds ?? []),
    [selection?.selectedIds],
  );
  const visibleStudentIds = React.useMemo(
    () => students.map((student) => student.id),
    [students],
  );
  const allVisibleSelected =
    selection !== undefined &&
    visibleStudentIds.length > 0 &&
    visibleStudentIds.every((id) => selectedIdSet.has(id));
  const someVisibleSelected =
    selection !== undefined && visibleStudentIds.some((id) => selectedIdSet.has(id));

  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 p-8 text-center">
        <h3 className="text-base font-semibold text-foreground">{t("emptyTitle")}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {hasFilters ? t("emptyFiltered") : t("emptyFresh")}
        </p>
        {!hasFilters && canWrite ? (
          <Link href={withSession("/protected/students/new")} className={cn(buttonVariants(), "mt-4")}>
            {t("addFirstStudent")}
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
            lastViewedAt={lastViewedByUser?.[student.id] ?? null}
            t={t}
          />
        ))}
      </ul>
      <table className="hidden min-w-full divide-y divide-border/60 md:table">
        <thead className="bg-surface-2">
          <tr>
            {selection && canWrite ? (
              <th className="w-10 px-3 py-3 text-left">
                <input
                  type="checkbox"
                  aria-label={allVisibleSelected ? t("deselectAllVisible") : t("selectAllVisible")}
                  checked={allVisibleSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  onChange={() => selection.onToggleAll(visibleStudentIds, !allVisibleSelected)}
                  className="size-4 accent-primary"
                />
              </th>
            ) : null}
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-6">
              {t("tableSrNo")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tableStudentName")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tableClass")}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tableNextDue")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground pr-6">
              {t("tableOutstanding")}
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("tableActions")}
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
                {selection && canWrite ? (
                  <td className="w-10 px-3 py-3.5" data-row-action="true" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={t("selectStudentAria", { name: student.fullName })}
                      checked={selectedIdSet.has(student.id)}
                      onChange={() => selection.onToggle(student.id)}
                      className="size-4 accent-primary"
                    />
                  </td>
                ) : null}
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
                    <StudentAvatar photoPath={student.photoPath} fullName={student.fullName} size="sm" />
                    <p className="text-sm font-semibold text-foreground">{student.fullName}</p>
                    {student.status !== "active" && (
                      <StudentStatusBadge status={student.status} />
                    )}
                    {srNoMissing ? (
                      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-soft-foreground flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        {t("srMissingBadge")}
                      </span>
                    ) : null}
                    <SiblingPill student={student} session={session} t={t} />
                  </div>
                  <DataQualityFlags student={student} t={t} />
                  {student.conventionalDiscountLabels.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {student.conventionalDiscountLabels.map((label) => (
                        <span
                          key={label}
                          title={discountLabelHint(label, t)}
                          className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-soft-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {lastViewedByUser?.[student.id] ? (
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {t("lastViewedByYou", { when: timeAgoShort(lastViewedByUser[student.id]) ?? t("lastViewedFallback") })}
                    </p>
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
                      <OutstandingCell student={student} t={t} />
                    </Link>
                  ) : (
                    <OutstandingCell student={student} t={t} />
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
                          {t("tableEdit")}
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
