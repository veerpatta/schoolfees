import { Money } from "@/components/ui/money";
import { Section } from "@/components/ui/section";
import type { StudentFinancialSnapshot } from "@/lib/fees/types";
import type { StudentDetail } from "@/lib/students/types";

type StudentQuickReferenceProps = {
  student: StudentDetail;
  financialSnapshot: StudentFinancialSnapshot | null;
};

function PhoneRow({ label, phone }: { label: string; phone: string | null }) {
  if (!phone) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${phone}`}>
        {phone}
      </a>
    </div>
  );
}

export function StudentQuickReference({ student, financialSnapshot }: StudentQuickReferenceProps) {
  const hasContacts = Boolean(student.fatherPhone || student.motherPhone);
  const showConventionalDiscount = Boolean(
    student.conventionalDiscountLabels.length > 0 ||
      student.conventionalDiscountFamilyGroupLabel ||
      student.conventionalDiscountReason ||
      student.conventionalDiscountManualOverrideReason,
  );

  return (
    <Section title="Quick reference" description="Review-only student context." variant="card" padding="tight">
      <div className="space-y-3">
        {showConventionalDiscount ? (
          <div className="rounded-lg bg-success-soft px-3 py-3 text-sm text-success-soft-foreground">
            <p className="font-semibold">Conventional discounts</p>
            {student.conventionalDiscountLabels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {student.conventionalDiscountLabels.map((label) => (
                  <span key={label} className="rounded-full bg-card/70 px-2 py-0.5 text-xs font-medium">
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="mt-2">
              Tuition changed from{" "}
              <Money value={student.tuitionBeforeConventionalDiscount} size="sm" tone="success" /> to{" "}
              <Money value={student.tuitionAfterConventionalDiscount} size="sm" tone="success" />.
            </p>
            {student.conventionalDiscountFamilyGroupLabel ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-card/70 px-2 py-0.5 text-xs font-medium">
                  Family: {student.conventionalDiscountFamilyGroupLabel}
                </span>
                {/* TODO: Add sibling chips when a scoped family-group lookup helper exists in the student data layer. */}
              </div>
            ) : null}
            {student.conventionalDiscountReason ? (
              <p className="mt-2">Reason: {student.conventionalDiscountReason}</p>
            ) : null}
            {student.conventionalDiscountManualOverrideReason ? (
              <p className="mt-2">Manual note: {student.conventionalDiscountManualOverrideReason}</p>
            ) : null}
          </div>
        ) : null}

        {financialSnapshot?.activeOverrideReason ? (
          <div className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning-soft-foreground">
            <p className="font-semibold">Override</p>
            <p className="mt-1">{financialSnapshot.activeOverrideReason}</p>
          </div>
        ) : null}

        {financialSnapshot && financialSnapshot.creditBalance > 0 ? (
          <div className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning-soft-foreground">
            <p className="font-semibold">Credit / refund</p>
            <p className="mt-1">
              Amount to refund or adjust:{" "}
              <Money value={financialSnapshot.refundableAmount} size="sm" tone="warning" />.
            </p>
          </div>
        ) : null}

        {financialSnapshot && financialSnapshot.rowsKeptForReview > 0 ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm text-foreground">
            Rows kept for review:{" "}
            <span className="font-semibold tabular-nums">{financialSnapshot.rowsKeptForReview}</span>.
          </div>
        ) : null}

        {financialSnapshot?.resolvedBreakdown.booksExcludedFromWorkbook ? (
          <div className="rounded-lg bg-info-soft px-3 py-3 text-sm text-info-soft-foreground">
            Books are kept outside fee calculation for AY 2026-27.
          </div>
        ) : null}

        {hasContacts ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Contacts</p>
            <PhoneRow label="Father" phone={student.fatherPhone} />
            <PhoneRow label="Mother" phone={student.motherPhone} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
