import Link from "next/link";

import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { formatShortDate } from "@/lib/helpers/date";
import type { StudentStatus } from "@/lib/db/types";

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
  };
  outstandingAmount: number;
  creditBalance: number;
  nextDueDate: string | null;
  nextDueLabel: string | null;
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

  return { label: `Due ${formatShortDate(nextDueDate)}`, tone: "neutral" };
}

const toneClasses = {
  neutral: "bg-surface-2 text-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive-soft text-destructive-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
} as const;

export function StudentIdentityStrip({
  student,
  outstandingAmount,
  creditBalance,
  nextDueDate,
  nextDueLabel,
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
  const initials =
    student.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <section
      aria-label="Student summary"
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Students
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {student.fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>SR {student.admissionNo}</span>
              <span aria-hidden="true" className="text-subtle-foreground">|</span>
              <span>{student.classLabel}</span>
              <span aria-hidden="true" className="text-subtle-foreground">|</span>
              <StudentStatusBadge status={student.status} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 lg:items-center lg:text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Outstanding
          </p>
          <Money
            value={outstandingAmount}
            size="xl"
            tone={outstandingAmount > 0 ? "danger" : "auto"}
            className="text-2xl font-semibold tabular-nums sm:text-3xl"
          />
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[hint.tone]}`}
          >
            {hint.label}
          </span>
          {nextDueLabel && outstandingAmount > 0 ? (
            <p className="text-xs text-muted-foreground">Next: {nextDueLabel}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canPostPayments ? (
            <Button asChild variant="accent" size="default">
              <Link href={`/protected/payments?studentId=${student.id}&returnTo=${encodedReturnTo}`}>
                Collect at Payment Desk
              </Link>
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="default">
              <Link href={`/protected/students/${student.id}/statement?returnTo=${encodedReturnTo}`}>
                Print statement
              </Link>
            </Button>
            {latestReceiptId ? (
              <Button asChild variant="outline" size="default">
                <Link href={`/protected/receipts/${latestReceiptId}?returnTo=${encodedReturnTo}`}>
                  {canPrintReceipts ? "Print latest receipt" : "Open latest receipt"}
                </Link>
              </Button>
            ) : null}
            {canViewLedger ? (
              <Button asChild variant="ghost" size="default">
                <Link href={`/protected/ledger?studentId=${student.id}&returnTo=${encodedReturnTo}`}>Ledger</Link>
              </Button>
            ) : null}
            {canEditStudent ? (
              <Button asChild variant="ghost" size="default">
                <Link href={`/protected/students/${student.id}/edit?returnTo=${encodedReturnTo}`}>
                  Edit
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="default">
              <Link href={returnTo}>Back</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
