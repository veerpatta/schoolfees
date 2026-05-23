import Link from "next/link";
import { Fingerprint, GraduationCap, User, AlertCircle, Printer, BookOpen, Edit2, ArrowLeft, Wallet } from "lucide-react";

import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
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

  return { label: `Due by ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(nextDueDate))}`, tone: "neutral" };
}


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
  const outstandingBlockClasses = {
    danger: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-warning-soft text-warning-soft-foreground border-warning/20",
    success: "bg-success-soft text-success-soft-foreground border-success/20",
    info: "bg-info-soft text-info-soft-foreground border-info/20",
    neutral: "bg-surface-2 text-foreground border-border",
  } as const;
  const initials =
    student.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="space-y-4">
      {/* Ledger Payee Strip Header */}
      <div className="bg-primary text-primary-foreground rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row items-stretch border border-border/10">
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6 flex-grow">
          {/* Avatar / Initials Box */}
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10 border border-white/20 text-xl font-bold text-white tracking-wider"
          >
            {initials}
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground/50">
              Student Ledger Profile
            </p>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {student.fullName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-primary-foreground/80">
              <div className="flex items-center gap-1">
                <Fingerprint className="h-3.5 w-3.5 text-primary-foreground/40" />
                <span>SR No: {student.admissionNo}</span>
              </div>
              <span className="hidden sm:inline text-primary-foreground/30">•</span>
              <div className="flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5 text-primary-foreground/40" />
                <span>Class: {student.classLabel}</span>
              </div>
              {student.fatherName ? (
                <>
                  <span className="hidden sm:inline text-primary-foreground/30">•</span>
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-primary-foreground/40" />
                    <span>Father: {student.fatherName}</span>
                  </div>
                </>
              ) : null}
              <span className="hidden sm:inline text-primary-foreground/30">•</span>
              <StudentStatusBadge status={student.status} />
            </div>
          </div>
        </div>

        {/* Outstanding Dues Block */}
        <div
          className={cn(
            outstandingBlockClasses[hint.tone],
            "p-6 min-w-[260px] flex flex-col justify-center border-t md:border-t-0 md:border-l",
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            Total Outstanding
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-bold mt-1 leading-none tabular-nums">
            {formatInr(outstandingAmount)}
          </h3>
          <div className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold">
            <AlertCircle className="h-3.5 w-3.5 opacity-80" />
            <span>{hint.label}</span>
          </div>
          {nextDueLabel && outstandingAmount > 0 ? (
            <p className="text-[10px] opacity-60 mt-0.5">
              Next: {nextDueLabel}
            </p>
          ) : null}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-card rounded-lg border border-border p-3 shadow-xs">
        {/* Left Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
            <Link href={`/protected/students/${student.id}/statement?returnTo=${encodedReturnTo}`}>
              <Printer className="h-4 w-4" />
              <span>Print statement</span>
            </Link>
          </Button>
          {latestReceiptId ? (
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
              <Link href={`/protected/receipts/${latestReceiptId}?returnTo=${encodedReturnTo}`}>
                <Printer className="h-4 w-4" />
                <span>{canPrintReceipts ? "Print latest receipt" : "Open latest receipt"}</span>
              </Link>
            </Button>
          ) : null}
        </div>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {canPostPayments && student.status === "active" ? (
            <Button asChild variant="accent" size="sm" className="h-9 gap-1.5 font-semibold">
              <Link href={`/protected/payments?studentId=${student.id}&returnTo=${encodedReturnTo}`}>
                <Wallet className="h-4 w-4" />
                <span>Collect at Payment Desk</span>
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
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 gap-1.5",
              (canViewLedger || canEditStudent) && "border-l border-border pl-3",
            )}
          >
            <Link href={returnTo}>
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
