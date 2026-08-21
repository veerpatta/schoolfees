import { Stamp } from "@/ui/primitives/stamp";
import { schoolProfile } from "@/platform/config/school";
import { buildFeeBreakupDisplayRows } from "@/modules/fees/domain/display-breakdown";
import { isYearCleared } from "@/modules/fees/domain/year-clear";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import type { getFamilyWorkspaceData } from "@/modules/students/data/workspace";

type FamilyWorkspace = Awaited<ReturnType<typeof getFamilyWorkspaceData>>;

type FamilyStatementDocumentProps = {
  familyGroup: FamilyWorkspace["familyGroup"];
  students: FamilyWorkspace["students"];
};

/**
 * The consolidated sibling statement as a phone reads it: stacked cards, no
 * column-headed tables.
 *
 * This document used to be the pre-redesign one, kept deliberately frozen while
 * the A4 redesign was scoped to desktop and paper. Measured at 375px it was
 * exactly what that exemption predicted: the two six-column installment tables
 * laid out at 506px inside a 291px container, so every column ran off the edge,
 * and the letterhead put a four-line school name in a head-on fight with the
 * family ID for about 170px each.
 *
 * It now follows the same rules the per-student phone document already used —
 * see `./master-statement-mobile.tsx`. The A4 sheet in
 * `./family-statement-paper.tsx` is untouched and is still the only thing
 * desktop and print see, so a statement printed from a phone is the same paper
 * document it always was.
 */

/** One installment as a phone reads it: the money first, the detail under it. */
function InstallmentCard({
  label,
  dueDate,
  baseCharge,
  finalLateFee,
  paidAmount,
  pendingAmount,
}: {
  label: string;
  dueDate: string;
  baseCharge: number;
  finalLateFee: number;
  paidAmount: number;
  pendingAmount: number;
}) {
  return (
    <div className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            pendingAmount > 0 ? "text-review" : "text-success"
          }`}
        >
          {formatInr(pendingAmount)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Due {formatShortDate(dueDate)}</span>
        <span>Outstanding</span>
      </div>
      {/* Wraps rather than truncating: at 375px these three would otherwise be
          the first thing to run off the edge. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Base <span className="font-medium text-foreground">{formatInr(baseCharge)}</span>
        </span>
        <span>
          Paid <span className="font-medium text-foreground">{formatInr(paidAmount)}</span>
        </span>
        {finalLateFee > 0 ? (
          <span>
            Late fee <span className="font-medium text-destructive">{formatInr(finalLateFee)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function FamilyStatementMobile({
  familyGroup,
  students,
}: FamilyStatementDocumentProps) {
  if (!students || students.length === 0) {
    return null;
  }

  // Get primary guardian/family details from the first student record
  const primaryStudent = students[0].student;
  const fatherName = primaryStudent.fatherName || "-";
  const fatherPhone = primaryStudent.fatherPhone || "-";
  const motherName = primaryStudent.motherName || "-";
  const motherPhone = primaryStudent.motherPhone || "-";
  const address = primaryStudent.address || "-";
  const sessionLabel = familyGroup.academic_session_label;

  // Calculate family totals
  const totalDue = students.reduce((sum, s) => {
    return sum + s.installmentBalances.reduce((subSum, item) => subSum + item.baseCharge, 0);
  }, 0);

  const totalPaid = students.reduce((sum, s) => {
    return sum + s.installmentBalances.reduce((subSum, item) => subSum + item.paidAmount, 0);
  }, 0);

  const totalOutstanding = students.reduce((sum, s) => {
    return sum + (s.financialSnapshot?.currentOutstanding ?? 0);
  }, 0);

  // Group installment-wise dues across all siblings
  const installmentAggregatesMap = new Map<
    string,
    {
      label: string;
      dueDate: string;
      baseCharge: number;
      finalLateFee: number;
      paidAmount: number;
      pendingAmount: number;
    }
  >();

  students.forEach(({ installmentBalances }) => {
    installmentBalances.forEach((item) => {
      const key = item.installmentLabel;
      const existing = installmentAggregatesMap.get(key);
      if (existing) {
        existing.baseCharge += item.baseCharge;
        existing.finalLateFee += item.finalLateFee;
        existing.paidAmount += item.paidAmount;
        existing.pendingAmount += item.pendingAmount;
      } else {
        installmentAggregatesMap.set(key, {
          label: item.installmentLabel,
          dueDate: item.dueDate,
          baseCharge: item.baseCharge,
          finalLateFee: item.finalLateFee,
          paidAmount: item.paidAmount,
          pendingAmount: item.pendingAmount,
        });
      }
    });
  });

  const aggregatedInstallments = Array.from(installmentAggregatesMap.values()).sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  return (
    <article className="mx-auto w-full max-w-4xl space-y-6 rounded-xl border border-border-strong bg-card p-4 text-foreground shadow-sm sm:p-6">
      {/* Header */}
      <header className="border-b border-border-strong pb-4">
        {/*
          Letterhead left, family right is an A4 idea. On a phone the two halves
          get about 170px each, the school name wraps to four lines and the
          family id wraps under it — so they stack, and go side by side from sm.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <p className="text-base font-semibold uppercase tracking-wide sm:text-lg">
              {schoolProfile.name}
            </p>
            <h1 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Consolidated Sibling Fee Statement
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Academic session {sessionLabel}
            </p>
          </div>
          <div className="text-sm sm:text-right">
            {/* break-words, because the generated family label is one long
                unbroken token and would otherwise push the card wider. */}
            <p className="font-semibold break-words text-foreground">
              Family ID: {familyGroup.name}
            </p>
            <p className="text-muted-foreground">{students.length} linked children</p>
          </div>
        </div>
      </header>

      {/* Guardian Details */}
      <section className="grid gap-3 border-b border-border-strong py-4 text-sm sm:grid-cols-2 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father / Guardian</p>
          <p className="font-medium">{fatherName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother</p>
          <p className="font-medium">{motherName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Father Phone</p>
          <p className="font-medium">{fatherPhone}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mother Phone</p>
          <p className="font-medium">{motherPhone}</p>
        </div>
        {/* Wraps instead of truncating. An address cut off mid-word on the one
            screen a parent is shown is worse than an address on two lines. */}
        <div className="sm:col-span-2 md:col-span-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Address</p>
          <p className="font-medium break-words">{address}</p>
        </div>
      </section>

      {/* Sibling Summary Chips */}
      <section className="py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Linked Siblings
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map(({ student, financialSnapshot }) => (
            <div
              key={student.id}
              className="rounded-lg border border-border bg-surface-2 p-3 text-xs"
            >
              <p className="truncate font-bold text-foreground">{student.fullName}</p>
              <p className="text-muted-foreground">
                SR no {student.admissionNo} • {student.classLabel}
              </p>
              <div className="mt-2 flex justify-between border-t border-border pt-1 font-semibold">
                <span>Dues:</span>
                <span
                  className={
                    financialSnapshot && financialSnapshot.currentOutstanding > 0
                      ? "text-review"
                      : "text-success"
                  }
                >
                  {formatInr(financialSnapshot?.currentOutstanding ?? 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/*
        Consolidated Aggregates. Stacked on a phone as three labelled rows
        rather than three centred columns — centring three numbers in a 343px
        column reads as a broken grid, and the vertical rules between them only
        make sense once they are side by side.
      */}
      <section className="rounded-md border-y border-border-strong bg-surface-1/50">
        <dl className="divide-y divide-border sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-baseline justify-between gap-3 px-3 py-3 sm:block sm:text-center">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Family Due
            </dt>
            <dd className="text-base font-bold tabular-nums text-foreground sm:mt-1 sm:text-lg">
              {formatInr(totalDue)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-3 sm:block sm:text-center">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Family Paid
            </dt>
            <dd className="text-base font-bold tabular-nums text-success sm:mt-1 sm:text-lg">
              {formatInr(totalPaid)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-3 sm:block sm:text-center">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Consolidated Outstanding
            </dt>
            <dd className="text-base font-extrabold tabular-nums text-review sm:mt-1 sm:text-lg">
              {formatInr(totalOutstanding)}
            </dd>
          </div>
        </dl>
      </section>

      {/*
        Consolidated installment dues. Six columns measured 506px inside a 291px
        container at 375px, so the same rows are stacked as cards — matching how
        receipts, dues and the per-student statement are read everywhere else.
      */}
      <section className="py-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Consolidated Installment-wise Dues
        </h2>
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border-strong">
          {aggregatedInstallments.map((item) => (
            <InstallmentCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      {/* Detailed Child-wise breakdown */}
      <section className="space-y-6 border-t border-dashed border-border-strong pt-4">
        <h2 className="border-b border-border pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Detailed Child-wise Breakdown
        </h2>
        {students.map(({ student, financialSnapshot, installmentBalances }) => {
          if (!financialSnapshot) return null;
          const feeHeads = buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown);

          return (
            <div
              key={student.id}
              className="space-y-4 rounded-lg border border-border bg-card p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">{student.fullName}</h3>
                  {/* No "Class" prefix: classLabel already reads "Class 9", so
                      the prefix rendered "Class Class 9". Matches the sibling
                      chip above, which never had it. */}
                  <p className="text-xs text-muted-foreground">
                    SR no {student.admissionNo} • {student.classLabel}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {/* Per child, because siblings clear at different times — one
                      may be settled while another still owes. */}
                  {isYearCleared({
                    outstandingAmount: financialSnapshot.currentOutstanding,
                    totalPaid: installmentBalances.reduce((sum, item) => sum + item.paidAmount, 0),
                    discountClosedAmount: installmentBalances.reduce(
                      (sum, item) => sum + item.discountCloseoutAmount,
                      0,
                    ),
                    hasPreparedDues: installmentBalances.length > 0,
                  }) ? (
                    <Stamp variant="year-cleared" size="sm">
                      Year Cleared
                    </Stamp>
                  ) : (
                    <>
                      <span className="text-xs uppercase text-muted-foreground">Outstanding</span>
                      <p className="text-sm font-bold tabular-nums text-review">
                        {formatInr(financialSnapshot.currentOutstanding)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Fee Breakup & Conventional Discounts */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Fee breakup
                  </p>
                  {/* Two columns, label and amount — this one reads fine at
                      375px and stays a table. */}
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full border-collapse text-left text-xs">
                      <tbody>
                        {feeHeads.map((item) => (
                          <tr
                            key={item.id}
                            className={
                              item.kind === "discount"
                                ? "border-t border-accent/20 bg-accent-soft/40 text-accent-soft-foreground"
                                : "border-t border-border first:border-t-0"
                            }
                          >
                            <td className="px-2 py-1.5">{item.label}</td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                              {formatInr(item.amount)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-border-strong bg-surface-2 font-semibold">
                          <td className="px-2 py-1.5">Annual Total</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Overrides and custom details */}
                  <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                      Fee Overrides &amp; Settings
                    </p>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Tuition Override:</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {student.tuitionOverride !== null
                          ? formatInr(student.tuitionOverride)
                          : "Class default"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Transport Override:</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {student.transportOverride !== null
                          ? formatInr(student.transportOverride)
                          : "Route default"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">General Discount:</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatInr(student.discountAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Late Fee Waiver:</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {formatInr(student.lateFeeWaiverAmount)}
                      </span>
                    </div>
                    {student.otherAdjustmentHead && (
                      <div className="flex justify-between gap-3 border-t border-border pt-1">
                        <span className="min-w-0 break-words text-muted-foreground">
                          {student.otherAdjustmentHead}:
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {formatInr(student.otherAdjustmentAmount ?? 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Installment Balances — cards, for the same reason as above. */}
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Installment Breakdown
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {installmentBalances.map((item) => (
                    <InstallmentCard
                      key={item.installmentId}
                      label={item.installmentLabel}
                      dueDate={item.dueDate}
                      baseCharge={item.baseCharge}
                      finalLateFee={item.finalLateFee}
                      paidAmount={item.paidAmount}
                      pendingAmount={item.pendingAmount}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </article>
  );
}
