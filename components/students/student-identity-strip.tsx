import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Edit2,
  Fingerprint,
  GraduationCap,
  Phone,
  Printer,
  User,
} from "lucide-react";

import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";
import { StudentAvatar } from "@/components/students/student-avatar";
import { StudentContactActions } from "@/components/students/student-contact-actions";
import { TrustBadge } from "@/components/trust/trust-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatMediumDate } from "@/lib/helpers/date";
import type { StudentStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StudentIdentityStripProps = {
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
    classLabel: string;
    status: StudentStatus;
    fatherName: string | null;
    fatherPhone: string | null;
    motherPhone: string | null;
    photoPath?: string | null;
  };
  outstandingAmount: number;
  overdueAmount: number;
  pendingLateFeeAmount: number;
  creditBalance: number;
  nextDueDate: string | null;
  nextDueLabel: string | null;
  nextDueAmount: number | null;
  todayIso: string;
  canPostPayments: boolean;
  canEditStudent: boolean;
  canPrintReceipts: boolean;
  canViewLedger: boolean;
  latestReceiptId: string | null;
  returnTo: string;
  encodedReturnTo: string;
};

function computeTemporalHint(
  nextDueDate: string | null,
  outstanding: number,
  credit: number,
  todayIso: string,
): { label: string; tone: "neutral" | "info" | "warning" | "danger" | "success" } {
  if (credit > 0) {
    return { label: "Refund or adjust", tone: "warning" };
  }

  if (outstanding <= 0) {
    return { label: "All dues settled", tone: "success" };
  }

  if (!nextDueDate) {
    return { label: "Dues pending", tone: "neutral" };
  }

  const due = new Date(`${nextDueDate}T00:00:00`).getTime();
  const today = new Date(`${todayIso}T00:00:00`).getTime();
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, tone: "danger" };
  }

  if (days === 0) {
    return { label: "Due today", tone: "danger" };
  }

  if (days <= 7) {
    return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "info" };
  }

  return {
    label: `Due by ${formatMediumDate(nextDueDate)}`,
    tone: "neutral",
  };
}

function formatReadableDate(value: string | null) {
  return formatMediumDate(value, "No date");
}

type NextActionStripProps = {
  student: StudentIdentityStripProps["student"];
  outstandingAmount: number;
  latestReceiptId: string | null;
  canPostPayments: boolean;
  canPrintReceipts: boolean;
  returnTo: string;
  encodedReturnTo: string;
};

function NextActionStrip({
  student,
  outstandingAmount,
  latestReceiptId,
  canPostPayments,
  canPrintReceipts,
  returnTo,
  encodedReturnTo,
}: NextActionStripProps) {
  const hasPhone = Boolean(student.fatherPhone || student.motherPhone);
  const isActive = student.status === "active";
  const chips: Array<{ key: string; node: React.ReactNode }> = [];

  if (canPostPayments && isActive && outstandingAmount > 0) {
    chips.push({
      key: "collect",
      node: (
        <StudentRowCollectButton
          studentId={student.id}
          studentLabel={student.fullName}
          classLabel={student.classLabel}
          variant="primary"
          size="sm"
          label={`Collect ${formatInr(outstandingAmount)}`}
          returnTo={returnTo}
          className="h-8 px-3 text-xs font-semibold"
        />
      ),
    });
  }

  if (hasPhone) {
    chips.push({
      key: "contact",
      node: (
        <StudentContactActions
          fullName={student.fullName}
          classLabel={student.classLabel}
          admissionNo={student.admissionNo}
          fatherName={student.fatherName}
          fatherPhone={student.fatherPhone}
          motherPhone={student.motherPhone}
          outstandingAmount={outstandingAmount}
        />
      ),
    });
  }

  if (latestReceiptId) {
    chips.push({
      key: "print",
      node: (
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs">
          <Link href={`/protected/receipts/${latestReceiptId}?returnTo=${encodedReturnTo}`}>
            <Printer className="h-3.5 w-3.5" />
            <span>{canPrintReceipts ? "Print latest receipt" : "Open latest receipt"}</span>
          </Link>
        </Button>
      ),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 no-print">
      {chips.map((chip) => (
        <div key={chip.key} className="flex flex-wrap items-center gap-2">{chip.node}</div>
      ))}
    </div>
  );
}

export function StudentIdentityStrip({
  student,
  outstandingAmount,
  overdueAmount,
  pendingLateFeeAmount,
  creditBalance,
  nextDueDate,
  nextDueLabel,
  nextDueAmount,
  todayIso,
  canPostPayments,
  canEditStudent,
  canPrintReceipts,
  canViewLedger,
  latestReceiptId,
  returnTo,
  encodedReturnTo,
}: StudentIdentityStripProps) {
  const hint = computeTemporalHint(nextDueDate, outstandingAmount, creditBalance, todayIso);
  const duePanelClasses = {
    danger: "bg-destructive-soft/70 text-destructive-soft-foreground border-destructive/20",
    warning: "bg-warning-soft text-warning-soft-foreground border-warning/20",
    success: "bg-success-soft text-success-soft-foreground border-success/20",
    info: "bg-info-soft text-info-soft-foreground border-info/20",
    neutral: "bg-surface-2 text-foreground border-border",
  } as const;
  const phoneEntries = [
    student.fatherPhone?.trim() ? { label: "Father", phone: student.fatherPhone.trim() } : null,
    student.motherPhone?.trim() ? { label: "Mother", phone: student.motherPhone.trim() } : null,
  ].filter((entry): entry is { label: string; phone: string } => entry !== null);
  const nextDueText =
    nextDueLabel && outstandingAmount > 0
      ? `${nextDueLabel}${nextDueAmount !== null && nextDueAmount > 0 ? ` - ${formatInr(nextDueAmount)}` : ""}`
      : "No pending installment";
  const initials =
    student.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {student.photoPath ? (
                <StudentAvatar
                  photoPath={student.photoPath}
                  fullName={student.fullName}
                  size="lg"
                  className="rounded-xl shadow-xs"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-primary text-xl font-bold tracking-wider text-primary-foreground shadow-xs"
                >
                  {initials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Student Ledger Profile
                  </p>
                  <StudentStatusBadge status={student.status} />
                </div>
                <h1 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                  {student.fullName}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Office ledger, dues, receipts, and student master summary.
                </p>

                <NextActionStrip
                  student={student}
                  outstandingAmount={outstandingAmount}
                  latestReceiptId={latestReceiptId}
                  canPostPayments={canPostPayments}
                  canPrintReceipts={canPrintReceipts}
                  returnTo={returnTo}
                  encodedReturnTo={encodedReturnTo}
                />
              </div>
            </div>
          </div>

          <div className={cn("border-t p-5 sm:p-6 lg:border-l lg:border-t-0", duePanelClasses[hint.tone])}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">Session due</p>
                <p className="mt-2 font-display text-3xl font-bold leading-none tabular-nums text-foreground">
                  {formatInr(outstandingAmount)}
                </p>
                <div className="mt-2">
                  <TrustBadge source="Workbook v1" />
                </div>
              </div>
              <div className="inline-flex w-fit items-center gap-1 rounded-full border border-current/20 bg-card/55 px-2.5 py-1 text-xs font-semibold">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{hint.label}</span>
              </div>
            </div>

            <dl className="mt-5 grid gap-2 text-sm">
              {overdueAmount > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2">
                  <dt className="text-muted-foreground">Overdue base amount</dt>
                  <dd className="font-semibold tabular-nums text-destructive">
                    {formatInr(overdueAmount)}
                  </dd>
                </div>
              ) : null}
              {pendingLateFeeAmount > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2">
                  <dt className="text-muted-foreground">
                    {overdueAmount > 0 ? "Late fee accruing" : "Late fee"}
                  </dt>
                  <dd className="font-semibold tabular-nums text-destructive">
                    + {formatInr(pendingLateFeeAmount)}
                  </dd>
                </div>
              ) : null}
              {overdueAmount <= 0 && pendingLateFeeAmount <= 0 && outstandingAmount > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-semibold tabular-nums text-success-soft-foreground text-xs">
                    On track · no late fee
                  </dd>
                </div>
              ) : null}
              <div className="rounded-lg bg-card/60 px-3 py-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Next installment
                </dt>
                <dd className="mt-1 flex flex-wrap items-center justify-between gap-2 font-semibold text-foreground">
                  <span>{nextDueText}</span>
                  <span className="text-xs font-medium text-muted-foreground">{formatReadableDate(nextDueDate)}</span>
                </dd>
              </div>
            </dl>
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-border bg-surface-2/35 p-4 sm:grid-cols-4 sm:gap-3 lg:col-span-2">
            <div className="rounded-lg border border-border bg-card px-3 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Fingerprint className="h-3.5 w-3.5" />
                SR no
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-foreground">{student.admissionNo}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5" />
                Class
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-foreground">{student.classLabel}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Father
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-foreground">{student.fatherName || "-"}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </dt>
              {phoneEntries.length === 0 ? (
                <dd className="mt-1 truncate text-sm font-semibold text-foreground">-</dd>
              ) : (
                <dd className="mt-1 space-y-0.5">
                  {phoneEntries.map((entry) => (
                    <a
                      key={entry.phone}
                      href={`tel:${entry.phone.replace(/[^\d+]/g, "")}`}
                      className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground hover:underline"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {entry.label}
                      </span>
                      <span className="truncate font-mono">{entry.phone}</span>
                    </a>
                  ))}
                </dd>
              )}
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-col gap-2 bg-card rounded-lg border border-border p-3 shadow-xs">
        {/* Primary CTA — full-width on mobile, inline on larger screens */}
        {canPostPayments && student.status === "active" ? (
          <StudentRowCollectButton
            studentId={student.id}
            studentLabel={student.fullName}
            classLabel={student.classLabel}
            variant="primary"
            size="md"
            label="Collect at Payment Desk"
            returnTo={returnTo}
            className="h-10 w-full sm:hidden font-semibold"
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5">
              <Link href={returnTo}>
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
              <Link href={`/protected/students/${student.id}/statement?returnTo=${encodedReturnTo}`}>
                <Printer className="h-4 w-4" />
                <span className="hidden xs:inline">Print statement</span>
                <span className="xs:hidden">Statement</span>
              </Link>
            </Button>
            {latestReceiptId ? (
              <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                <Link href={`/protected/receipts/${latestReceiptId}?returnTo=${encodedReturnTo}`}>
                  <Printer className="h-4 w-4" />
                  <span className="hidden xs:inline">{canPrintReceipts ? "Print receipt" : "Open receipt"}</span>
                  <span className="xs:hidden">Receipt</span>
                </Link>
              </Button>
            ) : null}
            {canViewLedger ? (
              <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5">
                <Link href={`/protected/ledger?studentId=${student.id}&returnTo=${encodedReturnTo}`}>
                  <BookOpen className="h-4 w-4" />
                  <span>Ledger</span>
                </Link>
              </Button>
            ) : null}
            {canEditStudent ? (
              <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5">
                <Link href={`/protected/students/${student.id}/edit?returnTo=${encodedReturnTo}`}>
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
                </Link>
              </Button>
            ) : null}
          </div>

          {/* Desktop inline Collect CTA */}
          {canPostPayments && student.status === "active" ? (
            <StudentRowCollectButton
              studentId={student.id}
              studentLabel={student.fullName}
              classLabel={student.classLabel}
              variant="primary"
              size="md"
              label="Collect at Payment Desk"
              returnTo={returnTo}
              className="hidden sm:inline-flex font-semibold"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
