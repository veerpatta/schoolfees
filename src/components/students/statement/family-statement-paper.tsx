import { StatementExplainer } from "@/components/students/statement/statement-explainer";
import { StatementFooter } from "@/components/students/statement/statement-footer";
import { StatementKpiTiles } from "@/components/students/statement/statement-kpi-tiles";
import { StatementLetterhead } from "@/components/students/statement/statement-letterhead";
import { StatementPaper } from "@/components/students/statement/statement-paper";
import { StatementPayeeBlock } from "@/components/students/statement/statement-payee-block";
import { StatementReceiptsTable } from "@/components/students/statement/statement-receipts-table";
import { StudentChargeBlock } from "@/components/students/statement/student-charge-block";
import { formatInr } from "@/platform/helpers/currency";
import { formatShortDate } from "@/platform/helpers/date";
import type { StatementFamilyView } from "@/lib/students/statement-view-model";
import { cn } from "@/platform/utils";

/**
 * The A4 family statement: two sheets.
 *
 * Sheet 1 is what the family is charged — the money band, a row per sibling,
 * and each sibling's charge block. Sheet 2 is the evidence — every receipt
 * against the family, how the balance was arrived at, and what falls due next.
 *
 * The "Page 1 of 2" labels name those two SECTIONS, which is how a parent reads
 * them. A family with many siblings will physically spill sheet 1 onto a second
 * piece of paper; spilling is the right failure, because the alternative — a
 * fixed page height — clips the tables instead.
 */
export function FamilyStatementPaper({
  view,
  issuedOn,
}: {
  view: StatementFamilyView;
  issuedOn: string;
}) {
  const receiptCount = view.receiptRows.filter((row) => !row.isReversed && !row.isWriteOff).length;
  const identifier = `Family ${view.identifier}`;
  // The group label already reads as a family name — "Family 8591353690 c74bdcf3"
  // for an auto-created group, "TEST-FAMILY-SHARMA" for a named one. Appending
  // "family" to either doubles the word.
  const payeeName = view.familyName;

  // "A, B and C" — a plain join reads "A and B and C" past two siblings.
  const siblingList = view.students.map(
    (student) => `${student.name} (${student.classLabel}, SR ${student.identifier})`,
  );
  const siblingSentence =
    siblingList.length <= 1
      ? siblingList.join("")
      : `${siblingList.slice(0, -1).join(", ")} and ${siblingList[siblingList.length - 1]}`;

  const nextDue = view.students
    .filter((student) => student.nextDueDate)
    .sort((left, right) => (left.nextDueDate ?? "").localeCompare(right.nextDueDate ?? ""))[0];

  const overdueCount = view.students.reduce(
    (total, student) =>
      total + student.installmentRows.filter((row) => row.status === "overdue").length,
    0,
  );

  const reconciliation = [
    { label: "Charged for the year (all students)", amount: formatInr(view.totalCharged), tone: "" },
    {
      label: "Less: received in cash",
      amount: `− ${formatInr(view.paidInCash)}`,
      tone: "text-success-soft-foreground",
    },
    {
      label: "Less: written off as discount",
      amount: `− ${formatInr(view.writtenOff)}`,
      tone: "text-accent-soft-foreground",
    },
  ];

  const TH = "px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground";

  return (
    <>
      <StatementPaper isLastPage={false}>
        <StatementLetterhead
          docTitle="Family fee statement"
          sessionLabel={view.sessionLabel}
          issuedOn={issuedOn}
          identifier={identifier}
          pageLabel="Page 1 of 2"
          isYearClear={view.isYearClear}
        />

        <StatementPayeeBlock
          scopeLabel="Family"
          name={payeeName}
          meta={`${view.students.length} student${view.students.length === 1 ? "" : "s"} · ${siblingSentence}`}
          fatherName={view.fatherName}
          fatherPhone={view.fatherPhone}
          transportRouteLabel={view.transportRouteLabel}
          villageCity={view.villageCity}
        />

        <StatementKpiTiles
          totalCharged={view.totalCharged}
          paidInCash={view.paidInCash}
          writtenOff={view.writtenOff}
          feesPending={view.feesPending}
          lateFeePending={view.lateFeePending}
          stillPayable={view.stillPayable}
          chargedHint="all students, incl. any carried balance and late fee"
          paidHint={`${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`}
        />

        <div className="pb-2.5">
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            What each student is charged
          </p>
          <table className="w-full border-collapse border border-border-strong text-[12.5px]">
            <thead className="table-header-group">
              <tr className="bg-surface-2">
                <th className={cn(TH, "text-left")}>Student</th>
                <th className={cn(TH, "text-left")}>Class</th>
                <th className={cn(TH, "text-right")}>Annual fee</th>
                <th className={cn(TH, "text-right")}>Old balance</th>
                <th className={cn(TH, "text-right")}>Late fee</th>
                <th className={cn(TH, "text-right")}>Charged</th>
                <th className={cn(TH, "text-right")}>Paid</th>
                <th className={cn(TH, "text-right")}>Payable</th>
              </tr>
            </thead>
            <tbody>
              {view.students.map((student, index) => (
                <tr
                  key={student.studentId}
                  className={cn("border-t border-border", index % 2 === 1 && "bg-surface-2/40")}
                >
                  <td className="px-2.5 py-1.5 font-semibold">{student.name}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{student.classLabel}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {formatInr(student.annualFee)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {student.previousYearBalance > 0
                      ? formatInr(student.previousYearBalance)
                      : "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">
                    {student.lateFeeCharged > 0 ? formatInr(student.lateFeeCharged) : "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">
                    {formatInr(student.totalCharged)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-success-soft-foreground">
                    {formatInr(student.paidInCash)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-bold tabular-nums text-destructive-soft-foreground">
                    {formatInr(student.stillPayable)}
                  </td>
                </tr>
              ))}

              <tr className="border-t-[1.5px] border-border-strong bg-surface-2">
                <td className="px-2.5 py-2 font-bold" colSpan={5}>
                  Family total
                </td>
                <td className="px-2.5 py-2 text-right font-bold tabular-nums">
                  {formatInr(view.totalCharged)}
                </td>
                <td className="px-2.5 py-2 text-right font-bold tabular-nums text-success-soft-foreground">
                  {formatInr(view.paidInCash)}
                </td>
                <td className="px-2.5 py-2 text-right font-bold tabular-nums text-destructive-soft-foreground">
                  {formatInr(view.stillPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <StatementExplainer isFamily />

        {view.students.map((student) => (
          <StudentChargeBlock key={student.studentId} view={student} />
        ))}

        <StatementFooter
          stillPayable={view.stillPayable}
          lateFeeFlatAmount={view.lateFeeFlatAmount}
          identifier={identifier}
          closingNote="Every receipt is listed on the next sheet, against the student it was applied to."
        />
      </StatementPaper>

      <StatementPaper>
        <StatementLetterhead
          compact
          continuedFor={payeeName}
          docTitle="Family fee statement"
          sessionLabel={view.sessionLabel}
          issuedOn={issuedOn}
          identifier={identifier}
          pageLabel="Page 2 of 2"
        />

        <StatementReceiptsTable
          title="Every receipt against this family"
          rows={view.receiptRows}
          totalReceived={view.paidInCash}
          outstanding={view.stillPayable}
          showStudentColumn
          balanceLabel="Family balance after"
          isYearClear={view.isYearClear}
        />

        <div className="grid grid-cols-2 gap-3.5 pt-3">
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              How the family balance is arrived at
            </p>
            <table className="w-full border-collapse border border-border-strong text-[12.5px]">
              <tbody>
                {reconciliation.map((line) => (
                  <tr key={line.label} className={cn("border-t border-border", line.tone)}>
                    <td className="px-2.5 py-1.5">{line.label}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">
                      {line.amount}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-[1.5px] border-border-strong bg-destructive-soft font-bold text-destructive-soft-foreground">
                  <td className="px-2.5 py-2">Still payable</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    {formatInr(view.stillPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              What is due next
            </p>
            <div className="rounded-[9px] border border-destructive-soft-foreground/35 bg-destructive-soft px-3 py-2.5 text-destructive-soft-foreground">
              <p className="text-[12.5px] font-semibold">
                {nextDue?.nextDueDate
                  ? `${formatShortDate(nextDue.nextDueDate)} · ${nextDue.nextDueLabel ?? "Next installment"}`
                  : "No pending dues"}
              </p>
              <p className="mt-1 text-[11.5px] leading-[1.5]">
                {overdueCount > 0
                  ? `${overdueCount} installment${overdueCount === 1 ? " is" : "s are"} already past the due date across this family.`
                  : "Nothing is past its due date for this family."}
              </p>
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground">
              A flat late fee of {formatInr(view.lateFeeFlatAmount)} applies to each installment that
              passes its due date, per student. Ask the office for a monthly EMI plan if the family
              needs one.
            </p>
          </div>
        </div>

        <StatementFooter
          stillPayable={view.stillPayable}
          lateFeeFlatAmount={view.lateFeeFlatAmount}
          identifier={identifier}
          // The panel above already states the late-fee policy, per student.
          showLateFeePolicy={false}
          closingNote="Each receipt above names the student it was applied to; nothing is pooled across the family."
        />
      </StatementPaper>
    </>
  );
}
