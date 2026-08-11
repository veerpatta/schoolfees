"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, GraduationCap, ShieldAlert, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StudentAvatar } from "@/components/students/student-avatar";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import type { StudentListItem } from "@/lib/students/types";
import { isYearCleared } from "@/lib/fees/year-clear";
import { cn } from "@/lib/utils";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";

/**
 * Idempotent hover/focus prefetch for student-profile rows. Rows navigate via
 * `router.push` (not <Link>), so Next.js doesn't auto-prefetch the profile RSC
 * payload — without this, every row click pays a full cold server round trip.
 * Warming on first hover/focus/touch makes opening a profile feel instant.
 * Mirrors useHoverPrefetch in components/admin/sidebar-nav.tsx.
 */
function useRowPrefetch() {
  const router = useRouter();
  const warmed = React.useRef<Set<string>>(new Set());
  return React.useCallback(
    (href: string) => {
      if (warmed.current.has(href)) return;
      warmed.current.add(href);
      router.prefetch(href);
    },
    [router],
  );
}

type StudentsTranslator = ReturnType<typeof useTranslations<"Students">>;

type StudentListTableProps = {
  students: StudentListItem[];
  hasFilters: boolean;
  canWrite: boolean;
  canCollectPayments?: boolean;
  returnTo: string;
  session?: string;
  /** When provided, the table renders a multi-select checkbox column. */
  selection?: {
    selectedIds: ReadonlyArray<string>;
    onToggle: (studentId: string) => void;
    onToggleAll: (studentIds: ReadonlyArray<string>, shouldSelect: boolean) => void;
  };
};

function OutstandingCell({ student, t }: { student: StudentListItem; t: StudentsTranslator }) {
  if (student.financialLoading) {
    return (
      <div className="flex flex-col items-end gap-1" aria-live="polite">
        <span className="h-4 w-16 anim-shimmer rounded bg-surface-2" aria-hidden="true" />
        <Badge variant="outline" className="rounded-full text-[10px] py-0 px-2 font-medium border-border">
          {t("feePositionLoading")}
        </Badge>
      </div>
    );
  }

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

  // Shared with the profile's Fee snapshot so the list and the student page can
  // never disagree. `outstandingAmount <= 0` alone used to stamp a student whose
  // dues had simply never been prepared.
  if (isYearCleared({
    outstandingAmount: student.outstandingAmount,
    totalPaid: student.totalPaid,
    discountClosedAmount: student.discountClosedAmount,
  })) {
    return (
      <div className="flex flex-col items-end gap-1">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <Badge variant="success" dot className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap">
          {t("yearClear")}
        </Badge>
      </div>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold text-muted-foreground font-mono">—</span>
        <Badge variant="outline" className="rounded-full text-[10px] py-0 px-2 font-medium border-border">
          {t("nothingDueYet")}
        </Badge>
      </div>
    );
  }

  const isOverdue = student.overdueAmount > 0;
  // pendingLateFeeAmount comes straight off the workbook view now that both
  // engines charge an overdue installment its flat late fee; lateFeeTotal is
  // only a degraded fallback for when installment balances failed to load.
  const effectiveLateFee = student.pendingLateFeeAmount > 0
    ? student.pendingLateFeeAmount
    : (isOverdue && student.lateFeeTotal > 0 ? student.lateFeeTotal : 0);

  // "Overdue" deliberately means BASE fees past their due date, never late fee
  // (see lib/money/glossary.ts). That is the right rule, but it left a student
  // who had cleared every rupee of fee and still owed a Rs 1,000 late fee
  // rendering as "Pending - On track", which reads as nothing to do. Now that an
  // overdue installment always carries its fee, that state is common enough to
  // name.
  const isLateFeeOnly = !isOverdue && effectiveLateFee > 0;

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
            <Badge
              variant="warning"
              dot
              className="rounded-full text-[10px] py-0 px-2 font-semibold whitespace-nowrap"
            >
              {isLateFeeOnly ? t("lateFeeOnlyBadge") : t("pendingBadge")}
            </Badge>
            {isLateFeeOnly ? (
              <span className="text-[9px] font-semibold text-destructive/80 mt-0.5 whitespace-nowrap">
                {t("lateFeeSuffix", { amount: formatInr(effectiveLateFee) })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-success-soft-foreground mt-0.5 whitespace-nowrap">
                <Clock className="h-2.5 w-2.5" />
                {t("onTrackHint")}
              </span>
            )}
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

/**
 * Phone-card money cell. Deliberately terser than `OutstandingCell`: the design
 * gives this one line and one chip, so the badges, the late-fee suffix and the
 * "on track" hint stay on the desktop table and on the profile.
 *
 * Tone comes from the real signal (`overdueAmount`), not from the design's
 * ₹10,000 threshold — a ₹2,000 overdue is the one the office chases.
 */
function MobileOutstanding({
  student,
  t,
}: {
  student: StudentListItem;
  t: StudentsTranslator;
}) {
  if (student.financialLoading) {
    return (
      <span
        className="block h-4 w-16 anim-shimmer rounded bg-surface-2"
        aria-label={t("feePositionLoading")}
      />
    );
  }

  if (student.duesStatus !== "generated") {
    return (
      <span className="tabular text-[11px] font-semibold text-muted-foreground">
        {t("duesNotPrepared")}
      </span>
    );
  }

  if (isYearCleared({
    outstandingAmount: student.outstandingAmount,
    totalPaid: student.totalPaid,
    discountClosedAmount: student.discountClosedAmount,
  })) {
    return (
      <span className="text-[12.5px] font-extrabold text-success">{t("yearClear")}</span>
    );
  }

  if (student.outstandingAmount <= 0) {
    return (
      <span className="tabular text-[11px] font-semibold text-muted-foreground">
        {t("nothingDueYet")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "tabular text-[14px] font-extrabold",
        student.overdueAmount > 0 ? "text-destructive" : "text-warning",
      )}
    >
      {formatInr(student.outstandingAmount)}
    </span>
  );
}

/**
 * Compacting the row to the design's single card drops the SR-missing badge and
 * the four data-quality flags from the phone. They are still live office
 * signals, so they collapse into one dot on the avatar and stay spelled out on
 * the desktop table and the student's About tab.
 */
function hasDataQualityWarning(student: StudentListItem) {
  return (
    (student.status === "active" && !student.admissionNo.trim()) ||
    student.duplicateSrFlag ||
    student.missingDobFlag ||
    student.missingClassFlag ||
    student.missingStatusFlag
  );
}

const MobileStudentListItem = React.memo(function MobileStudentListItem({
  student,
  returnTo,
  session,
  canCollectPayments,
  t,
}: {
  student: StudentListItem;
  returnTo: string;
  session?: string;
  canCollectPayments: boolean;
  t: StudentsTranslator;
}) {
  const withSession = (href: string) => appendSessionParam(href, session);
  const studentHref = withSession(
    `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`,
  );
  const showCollect =
    canCollectPayments &&
    student.status === "active" &&
    student.outstandingAmount > 0 &&
    student.duesStatus === "generated";

  const router = useRouter();
  const warmRow = useRowPrefetch();
  const prefetchRow = () => warmRow(studentHref);
  const handleRowOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest('[data-row-action="true"]')) return;
    router.push(studentHref);
  };
  return (
    <li
      onClick={handleRowOpen}
      onMouseEnter={prefetchRow}
      onTouchStart={prefetchRow}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors active:bg-surface-2"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 66px" } as React.CSSProperties}
    >
      <span className="relative shrink-0">
        <StudentAvatar photoPath={student.photoPath} fullName={student.fullName} size="md" />
        {hasDataQualityWarning(student) ? (
          <span
            title={t("flagDuplicateSr")}
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-warning"
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Link
            href={studentHref}
            onFocus={prefetchRow}
            className="focus-ring min-w-0 truncate rounded-sm text-[14.5px] font-extrabold leading-tight text-foreground"
          >
            {student.fullName}
          </Link>
          {student.status !== "active" ? <StudentStatusBadge status={student.status} /> : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-medium text-muted-foreground">
            {t("classLineWithSr", {
              class: student.classLabel,
              sr: student.admissionNo || t("tableSrPending"),
            })}
          </span>
          <SiblingPill student={student} session={session} t={t} />
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
        <MobileOutstanding student={student} t={t} />
        {showCollect ? (
          <span data-row-action="true" onClick={(event) => event.stopPropagation()}>
            <StudentRowCollectButton
              studentId={student.id}
              studentLabel={student.fullName}
              classLabel={student.classLabel}
              returnTo={returnTo}
              variant="primary"
              className="h-8 rounded-[10px] border border-accent/35 bg-accent-soft px-3 text-[11.5px] font-extrabold text-accent-soft-foreground hover:bg-accent-soft"
            />
          </span>
        ) : null}
      </span>
    </li>
  );
});

/**
 * The phone list (mobile app v2, §STUDENTS): a flat stack of cards, no table,
 * no surrounding card chrome. It ships separately from `StudentListTable` so a
 * phone never renders the 40-row desktop `<table>` DOM alongside it.
 */
export const MobileStudentList = React.memo(function MobileStudentList({
  students,
  hasFilters,
  canWrite,
  canCollectPayments = canWrite,
  returnTo,
  session,
}: Omit<StudentListTableProps, "selection">) {
  const t = useTranslations("Students");
  const withSession = (href: string) => appendSessionParam(href, session);

  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-10 text-center">
        <p className="text-[13px] font-extrabold text-foreground">{t("emptyTitle")}</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-[11.5px] leading-relaxed text-muted-foreground">
          {hasFilters ? t("emptyFiltered") : t("emptyFresh")}
        </p>
        {!hasFilters && canWrite ? (
          <Link
            href={withSession("/protected/students/new")}
            className={cn(buttonVariants({ size: "mobile" }), "mt-4")}
          >
            {t("addFirstStudent")}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {students.map((student) => (
        <MobileStudentListItem
          key={student.id}
          student={student}
          returnTo={returnTo}
          session={session}
          canCollectPayments={canCollectPayments}
          t={t}
        />
      ))}
    </ul>
  );
});

export const StudentListTable = React.memo(function StudentListTable({
  students,
  hasFilters,
  canWrite,
  canCollectPayments = canWrite,
  returnTo,
  session,
  selection,
}: StudentListTableProps) {
  const t = useTranslations("Students");
  const router = useRouter();
  const warmRow = useRowPrefetch();
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
      <div className="hidden rounded-xl border border-dashed border-border-strong bg-surface-2 p-8 text-center md:block">
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
    // Desktop only. The phone renders <MobileStudentList> instead — a narrower
    // table inside a horizontal scroller is not the same screen.
    <div className="hidden rounded-xl border border-border overflow-hidden bg-card shadow-xs md:block">
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
                onMouseEnter={() =>
                  warmRow(withSession(`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`))
                }
                onFocus={() =>
                  warmRow(withSession(`/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`))
                }
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
                      href={withSession(`/protected/ledger?studentId=${student.id}&returnTo=${encodeURIComponent(returnTo)}`)}
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
                    {canCollectPayments && (
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
