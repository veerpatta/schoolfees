import Link from "next/link";
import { ArrowLeft, Edit2, FileText, Printer } from "lucide-react";

import { OldBalanceChip } from "@/components/shared/old-balance-chip";
import { StudentContactActions } from "@/components/students/student-contact-actions";
import { StudentPhotoAvatarButton } from "@/components/students/student-photo-sheet";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import type { StudentStatus } from "@/lib/db/types";

/**
 * One row of identity, one primary action.
 *
 * Replaces the two-card identity strip, its separate action bar, and the
 * scroll-triggered sticky header — a bar that is always there needs no twin.
 *
 * Design system §6 rule 1 is "one saffron CTA per screen"; the page shipped
 * two, because `StudentRowCollectButton variant="primary"` hardcodes
 * `bg-accent` and appeared in both the action strip and the due panel. Exactly
 * one survives, and it names the amount so nobody has to look elsewhere first.
 *
 * Desktop only — the caller keeps this inside `hidden md:block`. Phones render
 * `MobileStudentProfile`, which carries its own header.
 */
export function StudentDetailHeader({
  student,
  outstandingAmount,
  prevYearDuesAmount,
  canPostPayments,
  canEditStudent,
  canPrintReceipts,
  latestReceiptId,
  returnTo,
  encodedReturnTo,
}: {
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
  /** Pending previous-year carry-forward balance. Chip appears only when > 0. */
  prevYearDuesAmount: number;
  canPostPayments: boolean;
  canEditStudent: boolean;
  canPrintReceipts: boolean;
  latestReceiptId: string | null;
  returnTo: string;
  encodedReturnTo: string;
}) {
  const isActive = student.status === "active";
  const hasPhone = Boolean(student.fatherPhone || student.motherPhone);
  const initials =
    student.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  // One line of context instead of a four-cell definition list. Everything here
  // is an identifier, not money — money lives in the band below.
  const meta = [
    student.admissionNo ? `SR ${student.admissionNo}` : null,
    student.classLabel,
    student.fatherName,
  ].filter(Boolean);

  return (
    <header className="sticky top-14 z-20 -mx-1 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Tappable when the staff member can edit, so a photo can be added
              or replaced without opening the whole form. Falls back to the
              initials tile when there is no photo and no permission — a
              control that looks pressable and refuses is worse than a tile. */}
          {student.photoPath || canEditStudent ? (
            <StudentPhotoAvatarButton
              studentId={student.id}
              studentName={student.fullName}
              admissionNo={student.admissionNo}
              photoPath={student.photoPath ?? null}
              canEditStudent={canEditStudent}
              size="xl"
              className="shrink-0 rounded-lg"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-primary text-lg font-bold tracking-wider text-primary-foreground"
            >
              {initials}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
                {student.fullName}
              </h1>
              <StudentStatusBadge status={student.status} />
              <OldBalanceChip amount={prevYearDuesAmount} />
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {meta.join(" · ")}
            </p>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs">
            <Link href={returnTo}>
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
            <Link href={`/protected/students/${student.id}/statement?returnTo=${encodedReturnTo}`}>
              <FileText className="h-3.5 w-3.5" />
              <span>Statement</span>
            </Link>
          </Button>

          {latestReceiptId ? (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
              <Link href={`/protected/receipts/${latestReceiptId}?returnTo=${encodedReturnTo}`}>
                <Printer className="h-3.5 w-3.5" />
                <span>{canPrintReceipts ? "Print last receipt" : "Last receipt"}</span>
              </Link>
            </Button>
          ) : null}

          {canEditStudent ? (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
              <Link href={`/protected/students/${student.id}/edit?returnTo=${encodedReturnTo}`}>
                <Edit2 className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Link>
            </Button>
          ) : null}

          {hasPhone ? (
            <StudentContactActions
              fullName={student.fullName}
              classLabel={student.classLabel}
              admissionNo={student.admissionNo}
              fatherName={student.fatherName}
              fatherPhone={student.fatherPhone}
              motherPhone={student.motherPhone}
              outstandingAmount={outstandingAmount}
            />
          ) : null}

          {/* The one saffron action on this screen. */}
          {canPostPayments && isActive && outstandingAmount > 0 ? (
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
          ) : null}
        </div>
      </div>
    </header>
  );
}
