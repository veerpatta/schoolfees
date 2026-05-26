"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { ValueStatePill } from "@/components/office/office-ui";
import { CloseDueTrigger } from "@/components/students/close-due-trigger";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { OfficeWorkbookStudentRow } from "@/lib/transactions/dues";

function formatOptionalDate(value: string | null | undefined) {
  return value ? formatShortDate(value) : "-";
}

function getStatusTone(status: OfficeWorkbookStudentRow["statusLabel"]) {
  switch (status) {
    case "PAID": return "locked";
    case "OVERDUE": return "review";
    case "PARTLY PAID": return "editable";
    case "NOT STARTED": return "policy";
    default: return "calculated";
  }
}

// ---------------------------------------------------------------------------
// Installment tracker table
// ---------------------------------------------------------------------------

export function InstallmentTrackerTable({ rows, sessionLabel }: { rows: OfficeWorkbookStudentRow[]; sessionLabel: string }) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">No dues tracker rows found.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {rows.map((row) => (
              <Link key={`tracker-mobile-${row.studentId}`} href={withSession(`/protected/students/${row.studentId}`)}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/40 transition-colors block">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.classLabel} · SR {row.admissionNo}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                      {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                    </ValueStatePill>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={row.outstandingAmount} size="lg" />
                  {row.nextDueAmount !== null && row.nextDueAmount > 0 && (
                    <p className="text-xs text-warning mt-0.5"><Money value={row.nextDueAmount} size="xs" tone="warning" /> due</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-[900px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Student","Class","SR no","Father / Phone","Inst 1","Inst 2","Inst 3","Inst 4","Late fee","Total due","Paid","Outstanding","Next due date","Next due amount","Discount","Waiver","Status","Actions"].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={18} className="px-4 py-6 text-center text-muted-foreground">No dues tracker rows found.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.studentId} className="border-t border-border hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{row.studentName}</td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{row.admissionNo}</td>
                  <td className="px-4 py-3"><div>{row.fatherName ?? "-"}</div><div className="text-xs text-muted-foreground">{row.fatherPhone ?? "-"}</div></td>
                  <td className="px-4 py-3">{formatInr(row.inst1Pending)}</td>
                  <td className="px-4 py-3">{formatInr(row.inst2Pending)}</td>
                  <td className="px-4 py-3">{formatInr(row.inst3Pending)}</td>
                  <td className="px-4 py-3">{formatInr(row.inst4Pending)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.outstandingAmount)}</td>
                  <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                  <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                  <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                  <td className="px-4 py-3">
                    <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                      {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                    </ValueStatePill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment</Link></Button>
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/students/${row.studentId}/statement`)}>Statement</Link></Button>
                    </div>
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
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">No students found for statement view.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {rows.map((row) => (
              <Link key={row.studentId} href={withSession(`/protected/students/${row.studentId}`)}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/40 transition-colors block">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.classLabel} · SR {row.admissionNo}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <p>Total due: {formatInr(row.totalDue)}</p>
                    <p>Paid: {formatInr(row.totalPaid)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={row.outstandingAmount} size="lg" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">outstanding</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Student","Class","Tuition","Transport","Academic","Other adj.","Discount","Late fee","Total due","Paid","Outstanding","Next due","Actions"].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-6 text-center text-muted-foreground">No students found for statement view.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.studentId} className="border-t border-border hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3"><div className="font-medium text-foreground">{row.studentName}</div><div className="text-xs text-muted-foreground">{row.admissionNo}</div></td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{formatInr(row.tuitionFee)}</td>
                  <td className="px-4 py-3">{formatInr(row.transportFee)}</td>
                  <td className="px-4 py-3">{formatInr(row.academicFee)}</td>
                  <td className="px-4 py-3">{row.otherAdjustmentHead ? `${row.otherAdjustmentHead}: ` : ""}{formatInr(row.otherAdjustmentAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.outstandingAmount)}</td>
                  <td className="px-4 py-3">
                    <div>{row.duesStatus === "missing_dues" ? "Dues not prepared" : row.nextDueLabel ?? "No pending dues"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.duesStatus === "missing_dues" ? "Prepare dues before collection" : row.nextDueDate ? `${formatShortDate(row.nextDueDate)} | ${formatInr(row.nextDueAmount ?? 0)}` : "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/students/${row.studentId}/statement`)}>Print statement</Link></Button>
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment</Link></Button>
                      {canCloseBalance && row.outstandingAmount > 0 ? (
                        <CloseDueTrigger
                          studentId={row.studentId}
                          studentLabel={row.studentName}
                          studentAdmissionNo={row.admissionNo}
                          classLabel={row.classLabel}
                          pendingAmount={row.outstandingAmount}
                          currentDiscount={row.discountAmount}
                          sessionLabel={sessionLabel}
                          size="sm"
                          variant="outline"
                        />
                      ) : null}
                    </div>
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

// ---------------------------------------------------------------------------
// Class register table
// ---------------------------------------------------------------------------

export function ClassRegisterTable({ rows, sessionLabel }: { rows: OfficeWorkbookStudentRow[]; sessionLabel: string }) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">No class register rows found.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {rows.map((row) => (
              <Link key={row.studentId} href={withSession(`/protected/students/${row.studentId}`)}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/40 transition-colors block">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.classLabel} · SR {row.admissionNo}</p>
                  <div className="mt-1.5">
                    <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                      {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                    </ValueStatePill>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={row.outstandingAmount} size="lg" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">outstanding</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-[900px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Student","SR no","Father","Phone","Status label","Route","Total due","Paid","Outstanding","Next due date","Next due amount","Status","Last payment","Other head","Other adj.","Discount","Late fee waived","Tuition","Transport","Academic","Receipt history","Actions"].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={22} className="px-4 py-6 text-center text-muted-foreground">No class register rows found.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.studentId} className="border-t border-border hover:bg-surface-2/30 transition-colors align-top">
                  <td className="px-4 py-3 font-medium text-foreground">{row.studentName}</td>
                  <td className="px-4 py-3">{row.admissionNo}</td>
                  <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                  <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                  <td className="px-4 py-3">{row.studentStatusLabel}</td>
                  <td className="px-4 py-3">{row.transportRouteName ?? "No Transport"}</td>
                  <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.outstandingAmount)}</td>
                  <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                  <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                  <td className="px-4 py-3">
                    <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                      {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                    </ValueStatePill>
                  </td>
                  <td className="px-4 py-3">{formatOptionalDate(row.lastPaymentDate)}</td>
                  <td className="px-4 py-3">{row.otherAdjustmentHead ?? "-"}</td>
                  <td className="px-4 py-3">{formatInr(row.otherAdjustmentAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.tuitionFee)}</td>
                  <td className="px-4 py-3">{formatInr(row.transportFee)}</td>
                  <td className="px-4 py-3">{formatInr(row.academicFee)}</td>
                  <td className="px-4 py-3">
                    {row.receiptHistory.length === 0 ? (
                      <span className="text-muted-foreground">No receipts yet</span>
                    ) : (
                      <div className="space-y-1">
                        {row.receiptHistory.map((item) => (
                          <div key={`${row.studentId}-${item.receiptNumber}`} className="text-xs text-foreground">
                            {item.receiptNumber} | {formatShortDate(item.paymentDate)} | {formatInr(item.totalAmount)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/students/${row.studentId}`)}>Student</Link></Button>
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment</Link></Button>
                    </div>
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

// ---------------------------------------------------------------------------
// Defaulters table
// ---------------------------------------------------------------------------

export function DefaultersTable({ rows, sessionLabel }: { rows: OfficeWorkbookStudentRow[]; sessionLabel: string }) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  return (
    <>
      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">No overdue students found.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {rows.map((row) => (
              <Link key={row.studentId} href={withSession(`/protected/students/${row.studentId}`)}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2/40 transition-colors block">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.classLabel} · SR {row.admissionNo}</p>
                  <div className="mt-1.5">
                    <ValueStatePill tone={getStatusTone(row.statusLabel)} className="normal-case tracking-normal">
                      {row.duesStatus === "missing_dues" ? "Dues not prepared" : row.statusLabel || "-"}
                    </ValueStatePill>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money value={row.outstandingAmount} size="lg" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-[900px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Student","Class","SR no","Father","Phone","Total due","Paid","Outstanding","Late fee","Next due date","Next due amount","Last payment","Route","Discount","Waiver","Actions"].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={16} className="px-4 py-6 text-center text-muted-foreground">No overdue students found.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.studentId} className="border-t border-border hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{row.studentName}</td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{row.admissionNo}</td>
                  <td className="px-4 py-3">{row.fatherName ?? "-"}</td>
                  <td className="px-4 py-3">{row.fatherPhone ?? "-"}</td>
                  <td className="px-4 py-3">{formatInr(row.totalDue)}</td>
                  <td className="px-4 py-3">{formatInr(row.totalPaid)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.outstandingAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeTotal)}</td>
                  <td className="px-4 py-3">{formatOptionalDate(row.nextDueDate)}</td>
                  <td className="px-4 py-3">{formatInr(row.nextDueAmount ?? 0)}</td>
                  <td className="px-4 py-3">{formatOptionalDate(row.lastPaymentDate)}</td>
                  <td className="px-4 py-3">{row.transportRouteName ?? "No Transport"}</td>
                  <td className="px-4 py-3">{formatInr(row.discountAmount)}</td>
                  <td className="px-4 py-3">{formatInr(row.lateFeeWaiverAmount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment</Link></Button>
                      <Button asChild size="sm" variant="outline"><Link href={withSession(`/protected/students/${row.studentId}`)}>Student</Link></Button>
                    </div>
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

// ---------------------------------------------------------------------------
// Collection table
// ---------------------------------------------------------------------------

export type CollectionRow = { paymentDate: string; paymentMode: string; receiptCount: number; studentCount: number; totalAmount: number };

export function CollectionTable({ rows }: { rows: CollectionRow[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">No collection rows found for today.</p>
        ) : (
          rows.map((row) => (
            <div key={`${row.paymentDate}-${row.paymentMode}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{row.paymentMode}</p>
                <p className="text-xs text-muted-foreground">{formatShortDate(row.paymentDate)} · {row.receiptCount} receipt{row.receiptCount === 1 ? "" : "s"} · {row.studentCount} student{row.studentCount === 1 ? "" : "s"}</p>
              </div>
              <span className="shrink-0 font-semibold text-foreground">{formatInr(row.totalAmount)}</span>
            </div>
          ))
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Date","Mode","Receipts","Students","Total"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No collection rows found for today.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.paymentDate}-${row.paymentMode}`} className="border-t border-border hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                  <td className="px-4 py-3">{row.paymentMode}</td>
                  <td className="px-4 py-3">{row.receiptCount}</td>
                  <td className="px-4 py-3">{row.studentCount}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.totalAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

