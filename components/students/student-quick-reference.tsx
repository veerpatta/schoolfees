import { Money } from "@/components/ui/money";
import { Section } from "@/components/ui/section";

type QuickRefStudent = {
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  conventionalDiscountLabels: string[];
  conventionalDiscountReason: string | null;
  conventionalDiscountFamilyGroupLabel: string | null;
  tuitionBeforeConventionalDiscount: number;
  tuitionAfterConventionalDiscount: number;
};

type QuickRefSnapshot = {
  activeOverrideReason: string | null;
  creditBalance: number;
  refundableAmount: number;
  rowsKeptForReview: number;
  resolvedBreakdown: {
    booksExcludedFromWorkbook: boolean;
  };
} | null;

type StudentQuickReferenceProps = {
  student: QuickRefStudent;
  financialSnapshot: QuickRefSnapshot;
};

export function StudentQuickReference({ student, financialSnapshot }: StudentQuickReferenceProps) {
  const hasDiscount = student.conventionalDiscountLabels.length > 0;
  const hasOverride = Boolean(financialSnapshot?.activeOverrideReason);
  const hasCredit = (financialSnapshot?.creditBalance ?? 0) > 0;
  const hasRowsForReview = (financialSnapshot?.rowsKeptForReview ?? 0) > 0;
  const booksExcluded = financialSnapshot?.resolvedBreakdown.booksExcludedFromWorkbook ?? false;
  const hasFatherPhone = Boolean(student.fatherPhone);
  const hasMotherPhone = Boolean(student.motherPhone);

  const hasAnyContent =
    hasDiscount || hasOverride || hasCredit || hasRowsForReview || booksExcluded ||
    hasFatherPhone || hasMotherPhone;

  if (!hasAnyContent) return null;

  return (
    <Section variant="card" padding="tight" title="Quick reference" description="At-a-glance fee and contact info.">
      <div className="space-y-3">
        {hasDiscount ? (
          <div className="rounded-lg bg-success-soft px-3 py-3 text-sm text-success-soft-foreground">
            <p className="font-semibold">Conventional discounts</p>
            <p className="mt-1">{student.conventionalDiscountLabels.join(", ")}</p>
            <p className="mt-1">
              Tuition{" "}
              <Money value={student.tuitionBeforeConventionalDiscount} size="sm" />
              {" → "}
              <Money value={student.tuitionAfterConventionalDiscount} size="sm" />
            </p>
            {student.conventionalDiscountReason ? (
              <p className="mt-1 text-xs">Reason: {student.conventionalDiscountReason}</p>
            ) : null}
            {student.conventionalDiscountFamilyGroupLabel ? (
              <p className="mt-1 text-xs">
                Family group: {student.conventionalDiscountFamilyGroupLabel}
                {/* TODO: add sibling list when a helper is added to lib/students/data.ts */}
              </p>
            ) : null}
          </div>
        ) : null}

        {hasOverride ? (
          <div className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning-soft-foreground">
            <p className="font-semibold">Override active</p>
            <p className="mt-1">{financialSnapshot!.activeOverrideReason}</p>
          </div>
        ) : null}

        {hasCredit ? (
          <div className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning-soft-foreground">
            <p className="font-semibold">Credit / refund</p>
            <p className="mt-1">
              Amount to refund or adjust:{" "}
              <Money value={financialSnapshot!.refundableAmount} size="sm" />
            </p>
          </div>
        ) : null}

        {hasRowsForReview ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm text-foreground">
            <p className="font-semibold">Rows kept for review</p>
            <p className="mt-1">{financialSnapshot!.rowsKeptForReview} row(s) flagged.</p>
          </div>
        ) : null}

        {booksExcluded ? (
          <div className="rounded-lg bg-info-soft px-3 py-3 text-sm text-info-soft-foreground">
            <p className="font-semibold">Books excluded</p>
            <p className="mt-1">Books kept outside fee calculation for AY 2026-27.</p>
          </div>
        ) : null}

        {hasFatherPhone || hasMotherPhone ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm text-foreground">
            <p className="mb-2 font-semibold">Contacts</p>
            {hasFatherPhone ? (
              <p>
                <span className="text-muted-foreground">Father</span>{" "}
                <a href={`tel:${student.fatherPhone}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {student.fatherPhone}
                </a>
              </p>
            ) : null}
            {hasMotherPhone ? (
              <p className="mt-1">
                <span className="text-muted-foreground">Mother</span>{" "}
                <a href={`tel:${student.motherPhone}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {student.motherPhone}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
