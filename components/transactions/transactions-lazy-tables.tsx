"use client";

import { Fragment, useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  FileText,
  MoreHorizontal,
  Phone,
  Printer,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/components/ui/money";
import { ValueStatePill } from "@/components/office/office-ui";
import { CloseDueTrigger } from "@/components/students/close-due-trigger";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { OfficeWorkbookStudentRow } from "@/lib/transactions/dues";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatOptionalDate(value: string | null | undefined) {
  return value ? formatShortDate(value) : "-";
}

function getStatusTone(status: OfficeWorkbookStudentRow["statusLabel"]) {
  switch (status) {
    case "PAID":
      return "locked" as const;
    case "OVERDUE":
      return "review" as const;
    case "PARTLY PAID":
      return "editable" as const;
    case "NOT STARTED":
      return "policy" as const;
    default:
      return "calculated" as const;
  }
}

function daysBetween(dateIso: string | null | undefined, todayIso: string) {
  if (!dateIso) return null;
  const a = new Date(dateIso + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function formatRelativeDue(date: string | null | undefined) {
  if (!date) return { text: "—", tone: "muted" as const };
  const today = todayIsoUtc();
  const days = daysBetween(date, today);
  if (days === null) return { text: "—", tone: "muted" as const };
  if (days > 0) return { text: `${days} day${days === 1 ? "" : "s"} overdue`, tone: "danger" as const };
  if (days === 0) return { text: "Due today", tone: "warning" as const };
  return { text: `Due in ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, tone: "muted" as const };
}

function useExpandedRows() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded]);
  return { isExpanded, toggle };
}

function ChevronToggle({
  expanded,
  label,
  onClick,
}: {
  expanded: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight
        className={cn(
          "size-4 transition-transform duration-150",
          expanded && "rotate-90",
        )}
      />
    </button>
  );
}

type RowAction =
  | { type: "link"; href: string; label: string; icon?: ReactNode; external?: boolean }
  | { type: "button"; onClick: () => void; label: string; icon?: ReactNode }
  | { type: "node"; node: ReactNode };

function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          className="size-8 p-0 hover:bg-surface-2"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action, index) => {
          if (action.type === "node") {
            return (
              <div key={index} className="px-1 py-0.5" onClick={(event) => event.stopPropagation()}>
                {action.node}
              </div>
            );
          }
          if (action.type === "link") {
            return (
              <DropdownMenuItem key={index} asChild>
                <Link
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className="flex items-center gap-2"
                >
                  {action.icon}
                  {action.label}
                </Link>
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem
              key={index}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
              }}
              className="flex items-center gap-2"
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function PhoneLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1 text-foreground hover:text-accent"
      onClick={(event) => event.stopPropagation()}
    >
      <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
      {phone}
    </a>
  );
}

function InstallmentChips({
  values,
  paidCount,
}: {
  values: [number, number, number, number];
  paidCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {values.map((pending, idx) => {
        const isPending = pending > 0;
        const isPaid = idx < paidCount && !isPending;
        return (
          <span
            key={idx}
            title={
              isPending
                ? `Installment ${idx + 1}: ${formatInr(pending)} pending`
                : isPaid
                  ? `Installment ${idx + 1}: paid`
                  : `Installment ${idx + 1}`
            }
            className={cn(
              "inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums",
              isPending
                ? "bg-warning-soft text-warning-soft-foreground"
                : isPaid
                  ? "bg-success-soft text-success-soft-foreground"
                  : "bg-surface-2 text-muted-foreground",
            )}
          >
            I{idx + 1}
          </span>
        );
      })}
    </div>
  );
}

function ExpandedShell({ children, colSpan }: { children: ReactNode; colSpan: number }) {
  return (
    <tr className="border-t border-border bg-surface-2/30">
      <td colSpan={colSpan} className="px-6 py-4">
        {children}
      </td>
    </tr>
  );
}

function EmptyShell({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

function MobileEmpty({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
      {label}
    </p>
  );
}

function StudentHeader({ row }: { row: OfficeWorkbookStudentRow }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{row.studentName}</div>
      <div className="text-xs text-muted-foreground">
        {row.classLabel} · SR {row.admissionNo}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Installment tracker table
// ---------------------------------------------------------------------------

export function InstallmentTrackerTable({
  rows,
  sessionLabel,
}: {
  rows: OfficeWorkbookStudentRow[];
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const { isExpanded, toggle } = useExpandedRows();
  const colSpan = 6;
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <MobileEmpty label="No dues tracker rows found." />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((row) => (
              <Link
                key={`tracker-mobile-${row.studentId}`}
                href={withSession(`/protected/students/${row.studentId}`)}
                className="block px-4 py-3.5 transition-colors hover:bg-surface-2/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <StudentHeader row={row} />
                  <div className="shrink-0 text-right">
                    <Money value={row.outstandingAmount} size="lg" />
                    {row.nextDueAmount !== null && row.nextDueAmount > 0 && (
                      <p className="mt-0.5 text-[11px] text-warning">
                        Next: {formatInr(row.nextDueAmount)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <InstallmentChips
                    values={[row.inst1Pending, row.inst2Pending, row.inst3Pending, row.inst4Pending]}
                    paidCount={row.paidInstallmentCount}
                  />
                  <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                    {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                  </ValueStatePill>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" aria-label="Expand row" />
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Installments</th>
              <th className="px-4 py-3 text-right">Paid / Total</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Status</th>
              <th className="w-10 px-2 py-3 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyShell label="No dues tracker rows found." colSpan={colSpan + 1} />
            ) : (
              rows.map((row) => {
                const expanded = isExpanded(row.studentId);
                return (
                  <Fragment key={row.studentId}>
                    <tr
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/30"
                      onClick={() => toggle(row.studentId)}
                    >
                      <td className="w-8 px-2 py-3">
                        <ChevronToggle
                          expanded={expanded}
                          label={expanded ? "Collapse row" : "Expand row"}
                          onClick={() => toggle(row.studentId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StudentHeader row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <InstallmentChips
                          values={[row.inst1Pending, row.inst2Pending, row.inst3Pending, row.inst4Pending]}
                          paidCount={row.paidInstallmentCount}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        <span className="text-foreground">{formatInr(row.totalPaid)}</span>
                        <span className="mx-1">/</span>
                        {formatInr(row.totalDue)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                          {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                        </ValueStatePill>
                      </td>
                      <td className="w-10 px-2 py-3 text-right">
                        <RowActionsMenu
                          label={row.studentName}
                          actions={[
                            {
                              type: "link",
                              href: withSession(`/protected/payments?studentId=${row.studentId}`),
                              label: "Take payment",
                              icon: <CreditCard className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}/statement`),
                              label: "Open statement",
                              icon: <FileText className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}`),
                              label: "Open student",
                              icon: <User className="size-3.5" aria-hidden="true" />,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <ExpandedShell colSpan={colSpan + 1}>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          <DetailItem label="Inst 1" value={formatInr(row.inst1Pending)} />
                          <DetailItem label="Inst 2" value={formatInr(row.inst2Pending)} />
                          <DetailItem label="Inst 3" value={formatInr(row.inst3Pending)} />
                          <DetailItem label="Inst 4" value={formatInr(row.inst4Pending)} />
                          <DetailItem label="Late fee" value={formatInr(row.lateFeeTotal)} />
                          <DetailItem label="Waiver" value={formatInr(row.lateFeeWaiverAmount)} />
                          <DetailItem label="Discount" value={formatInr(row.discountAmount)} />
                          <DetailItem
                            label="Next due"
                            value={
                              row.nextDueDate
                                ? `${formatShortDate(row.nextDueDate)} · ${formatInr(row.nextDueAmount ?? 0)}`
                                : "—"
                            }
                          />
                          <DetailItem
                            label="Last payment"
                            value={formatOptionalDate(row.lastPaymentDate)}
                          />
                          <DetailItem label="SR no" value={row.admissionNo} />
                          <DetailItem label="Father" value={row.fatherName ?? "—"} />
                          <DetailItem label="Phone" value={<PhoneLink phone={row.fatherPhone} />} />
                        </div>
                      </ExpandedShell>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Student dues table
// ---------------------------------------------------------------------------

export function StudentDuesTable({
  rows,
  sessionLabel,
  canCloseBalance,
}: {
  rows: OfficeWorkbookStudentRow[];
  sessionLabel: string;
  canCloseBalance?: boolean;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const { isExpanded, toggle } = useExpandedRows();
  const colSpan = 6;
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <MobileEmpty label="No students found for statement view." />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((row) => (
              <Link
                key={row.studentId}
                href={withSession(`/protected/students/${row.studentId}`)}
                className="block px-4 py-3.5 transition-colors hover:bg-surface-2/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <StudentHeader row={row} />
                  <div className="shrink-0 text-right">
                    <Money value={row.outstandingAmount} size="lg" />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">outstanding</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                  <span>Paid: {formatInr(row.totalPaid)}</span>
                  <span>Total: {formatInr(row.totalDue)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" aria-label="Expand row" />
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">SR no</th>
              <th className="px-4 py-3 text-right">Paid / Total</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Next due</th>
              <th className="w-10 px-2 py-3 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyShell label="No students found for statement view." colSpan={colSpan + 1} />
            ) : (
              rows.map((row) => {
                const expanded = isExpanded(row.studentId);
                const nextDue = formatRelativeDue(row.nextDueDate);
                return (
                  <Fragment key={row.studentId}>
                    <tr
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/30"
                      onClick={() => toggle(row.studentId)}
                    >
                      <td className="w-8 px-2 py-3">
                        <ChevronToggle
                          expanded={expanded}
                          label={expanded ? "Collapse row" : "Expand row"}
                          onClick={() => toggle(row.studentId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StudentHeader row={row} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.admissionNo}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        <span className="text-foreground">{formatInr(row.totalPaid)}</span>
                        <span className="mx-1">/</span>
                        {formatInr(row.totalDue)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {row.duesStatus === "missing_dues" ? (
                          <span className="text-xs text-muted-foreground">Dues not prepared</span>
                        ) : row.nextDueDate ? (
                          <div className="flex flex-col">
                            <span className="text-sm tabular-nums text-foreground">
                              {formatShortDate(row.nextDueDate)}
                            </span>
                            <span
                              className={cn(
                                "text-[11px]",
                                nextDue.tone === "danger" && "text-destructive",
                                nextDue.tone === "warning" && "text-warning",
                                nextDue.tone === "muted" && "text-muted-foreground",
                              )}
                            >
                              {formatInr(row.nextDueAmount ?? 0)} · {nextDue.text}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No pending</span>
                        )}
                      </td>
                      <td className="w-10 px-2 py-3 text-right">
                        <RowActionsMenu
                          label={row.studentName}
                          actions={[
                            {
                              type: "link",
                              href: withSession(`/protected/payments?studentId=${row.studentId}`),
                              label: "Take payment",
                              icon: <CreditCard className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}/statement`),
                              label: "Print statement",
                              icon: <Printer className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}`),
                              label: "Open student",
                              icon: <User className="size-3.5" aria-hidden="true" />,
                            },
                            ...(canCloseBalance && row.outstandingAmount > 0
                              ? ([
                                  {
                                    type: "node",
                                    node: (
                                      <CloseDueTrigger
                                        studentId={row.studentId}
                                        studentLabel={row.studentName}
                                        studentAdmissionNo={row.admissionNo}
                                        classLabel={row.classLabel}
                                        pendingAmount={row.outstandingAmount}
                                        currentDiscount={row.discountAmount}
                                        sessionLabel={sessionLabel}
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start gap-2 text-xs"
                                      />
                                    ),
                                  },
                                ] as RowAction[])
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <ExpandedShell colSpan={colSpan + 1}>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          <DetailItem label="Tuition" value={formatInr(row.tuitionFee)} />
                          <DetailItem label="Transport" value={formatInr(row.transportFee)} />
                          <DetailItem label="Academic" value={formatInr(row.academicFee)} />
                          <DetailItem
                            label={row.otherAdjustmentHead ? row.otherAdjustmentHead : "Other adj."}
                            value={formatInr(row.otherAdjustmentAmount)}
                          />
                          <DetailItem label="Discount" value={formatInr(row.discountAmount)} />
                          <DetailItem label="Late fee" value={formatInr(row.lateFeeTotal)} />
                          <DetailItem label="Waiver" value={formatInr(row.lateFeeWaiverAmount)} />
                          <DetailItem label="Father" value={row.fatherName ?? "—"} />
                          <DetailItem label="Phone" value={<PhoneLink phone={row.fatherPhone} />} />
                          <DetailItem
                            label="Last payment"
                            value={formatOptionalDate(row.lastPaymentDate)}
                          />
                        </div>
                      </ExpandedShell>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Class register table
// ---------------------------------------------------------------------------

export function ClassRegisterTable({
  rows,
  sessionLabel,
}: {
  rows: OfficeWorkbookStudentRow[];
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const { isExpanded, toggle } = useExpandedRows();
  const colSpan = 6;
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <MobileEmpty label="No class register rows found." />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((row) => (
              <Link
                key={row.studentId}
                href={withSession(`/protected/students/${row.studentId}`)}
                className="block px-4 py-3.5 transition-colors hover:bg-surface-2/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <StudentHeader row={row} />
                  <div className="shrink-0 text-right">
                    <Money value={row.outstandingAmount} size="lg" />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">outstanding</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                    {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                  </ValueStatePill>
                  {row.transportRouteName && (
                    <span className="text-[11px] text-muted-foreground">{row.transportRouteName}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" aria-label="Expand row" />
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Father / Phone</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="w-10 px-2 py-3 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyShell label="No class register rows found." colSpan={colSpan + 1} />
            ) : (
              rows.map((row) => {
                const expanded = isExpanded(row.studentId);
                return (
                  <Fragment key={row.studentId}>
                    <tr
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/30"
                      onClick={() => toggle(row.studentId)}
                    >
                      <td className="w-8 px-2 py-3">
                        <ChevronToggle
                          expanded={expanded}
                          label={expanded ? "Collapse row" : "Expand row"}
                          onClick={() => toggle(row.studentId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StudentHeader row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">{row.fatherName ?? "—"}</span>
                          <span className="text-xs">
                            <PhoneLink phone={row.fatherPhone} />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.transportRouteName ?? "No transport"}
                      </td>
                      <td className="px-4 py-3">
                        <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                          {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                        </ValueStatePill>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="w-10 px-2 py-3 text-right">
                        <RowActionsMenu
                          label={row.studentName}
                          actions={[
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}`),
                              label: "Open student",
                              icon: <User className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/payments?studentId=${row.studentId}`),
                              label: "Take payment",
                              icon: <CreditCard className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}/statement`),
                              label: "Open statement",
                              icon: <FileText className="size-3.5" aria-hidden="true" />,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <ExpandedShell colSpan={colSpan + 1}>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          <DetailItem label="Total due" value={formatInr(row.totalDue)} />
                          <DetailItem label="Paid" value={formatInr(row.totalPaid)} />
                          <DetailItem label="Discount" value={formatInr(row.discountAmount)} />
                          <DetailItem label="Late fee waived" value={formatInr(row.lateFeeWaiverAmount)} />
                          <DetailItem label="Tuition" value={formatInr(row.tuitionFee)} />
                          <DetailItem label="Transport" value={formatInr(row.transportFee)} />
                          <DetailItem label="Academic" value={formatInr(row.academicFee)} />
                          <DetailItem
                            label={row.otherAdjustmentHead ? row.otherAdjustmentHead : "Other adj."}
                            value={formatInr(row.otherAdjustmentAmount)}
                          />
                          <DetailItem
                            label="Next due"
                            value={
                              row.nextDueDate
                                ? `${formatShortDate(row.nextDueDate)} · ${formatInr(row.nextDueAmount ?? 0)}`
                                : "—"
                            }
                          />
                          <DetailItem
                            label="Last payment"
                            value={formatOptionalDate(row.lastPaymentDate)}
                          />
                          <DetailItem label="Student status" value={row.studentStatusLabel} />
                          <DetailItem label="SR no" value={row.admissionNo} />
                          {row.receiptHistory.length > 0 && (
                            <div className="col-span-2 md:col-span-4">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Recent receipts
                              </span>
                              <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-foreground md:grid-cols-3">
                                {row.receiptHistory.map((item) => (
                                  <div
                                    key={`${row.studentId}-${item.receiptNumber}`}
                                    className="rounded border border-border bg-card px-2 py-1 tabular-nums"
                                  >
                                    {item.receiptNumber} · {formatShortDate(item.paymentDate)} · {formatInr(item.totalAmount)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </ExpandedShell>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Defaulters table
// ---------------------------------------------------------------------------

export function DefaultersTable({
  rows,
  sessionLabel,
}: {
  rows: OfficeWorkbookStudentRow[];
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const { isExpanded, toggle } = useExpandedRows();
  const colSpan = 6;
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <MobileEmpty label="No overdue students found." />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((row) => {
              const nextDue = formatRelativeDue(row.nextDueDate);
              return (
                <Link
                  key={row.studentId}
                  href={withSession(`/protected/students/${row.studentId}`)}
                  className="block px-4 py-3.5 transition-colors hover:bg-surface-2/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <StudentHeader row={row} />
                    <div className="shrink-0 text-right">
                      <Money value={row.outstandingAmount} size="lg" />
                      <p
                        className={cn(
                          "mt-0.5 text-[11px]",
                          nextDue.tone === "danger" && "text-destructive",
                          nextDue.tone === "warning" && "text-warning",
                          nextDue.tone === "muted" && "text-muted-foreground",
                        )}
                      >
                        {nextDue.text}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.fatherName ?? "—"} · <PhoneLink phone={row.fatherPhone} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" aria-label="Expand row" />
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Father / Phone</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Overdue</th>
              <th className="px-4 py-3">Last payment</th>
              <th className="w-10 px-2 py-3 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyShell label="No overdue students found." colSpan={colSpan + 1} />
            ) : (
              rows.map((row) => {
                const expanded = isExpanded(row.studentId);
                const nextDue = formatRelativeDue(row.nextDueDate);
                return (
                  <Fragment key={row.studentId}>
                    <tr
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/30"
                      onClick={() => toggle(row.studentId)}
                    >
                      <td className="w-8 px-2 py-3">
                        <ChevronToggle
                          expanded={expanded}
                          label={expanded ? "Collapse row" : "Expand row"}
                          onClick={() => toggle(row.studentId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StudentHeader row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">{row.fatherName ?? "—"}</span>
                          <span className="text-xs">
                            <PhoneLink phone={row.fatherPhone} />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatInr(row.outstandingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              "text-sm",
                              nextDue.tone === "danger" && "font-medium text-destructive",
                              nextDue.tone === "warning" && "text-warning",
                              nextDue.tone === "muted" && "text-muted-foreground",
                            )}
                          >
                            {nextDue.text}
                          </span>
                          {row.nextDueDate && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              since {formatShortDate(row.nextDueDate)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatOptionalDate(row.lastPaymentDate)}
                      </td>
                      <td className="w-10 px-2 py-3 text-right">
                        <RowActionsMenu
                          label={row.studentName}
                          actions={[
                            {
                              type: "link",
                              href: withSession(`/protected/payments?studentId=${row.studentId}`),
                              label: "Take payment",
                              icon: <CreditCard className="size-3.5" aria-hidden="true" />,
                            },
                            ...(row.fatherPhone
                              ? ([
                                  {
                                    type: "link",
                                    href: `tel:${row.fatherPhone}`,
                                    label: `Call ${row.fatherPhone}`,
                                    icon: <Phone className="size-3.5" aria-hidden="true" />,
                                  },
                                ] as RowAction[])
                              : []),
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}`),
                              label: "Open student",
                              icon: <User className="size-3.5" aria-hidden="true" />,
                            },
                            {
                              type: "link",
                              href: withSession(`/protected/students/${row.studentId}/statement`),
                              label: "Print statement",
                              icon: <Printer className="size-3.5" aria-hidden="true" />,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expanded && (
                      <ExpandedShell colSpan={colSpan + 1}>
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                          <DetailItem label="Total due" value={formatInr(row.totalDue)} />
                          <DetailItem label="Paid" value={formatInr(row.totalPaid)} />
                          <DetailItem label="Late fee" value={formatInr(row.lateFeeTotal)} />
                          <DetailItem label="Waiver" value={formatInr(row.lateFeeWaiverAmount)} />
                          <DetailItem label="Discount" value={formatInr(row.discountAmount)} />
                          <DetailItem label="Route" value={row.transportRouteName ?? "No transport"} />
                          <DetailItem
                            label="Next due"
                            value={
                              row.nextDueDate
                                ? `${formatShortDate(row.nextDueDate)} · ${formatInr(row.nextDueAmount ?? 0)}`
                                : "—"
                            }
                          />
                          <DetailItem label="SR no" value={row.admissionNo} />
                        </div>
                      </ExpandedShell>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Collection table (already lean; just polish)
// ---------------------------------------------------------------------------

export type CollectionRow = {
  paymentDate: string;
  paymentMode: string;
  receiptCount: number;
  studentCount: number;
  totalAmount: number;
};

export function CollectionTable({ rows }: { rows: CollectionRow[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <MobileEmpty label="No collection rows found for today." />
        ) : (
          rows.map((row) => (
            <div
              key={`${row.paymentDate}-${row.paymentMode}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{row.paymentMode}</p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(row.paymentDate)} · {row.receiptCount} receipt
                  {row.receiptCount === 1 ? "" : "s"} · {row.studentCount} student
                  {row.studentCount === 1 ? "" : "s"}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {formatInr(row.totalAmount)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3 text-right">Receipts</th>
              <th className="px-4 py-3 text-right">Students</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyShell label="No collection rows found for today." colSpan={5} />
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.paymentDate}-${row.paymentMode}`}
                  className="border-t border-border transition-colors hover:bg-surface-2/30"
                >
                  <td className="px-4 py-3 tabular-nums">{formatShortDate(row.paymentDate)}</td>
                  <td className="px-4 py-3">{row.paymentMode}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.receiptCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.studentCount}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                    {formatInr(row.totalAmount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
