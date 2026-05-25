import Link from "next/link";
import { notFound } from "next/navigation";

import { OfficeRecentTracker, ValueStatePill } from "@/components/office/office-ui";
import { StudentAboutPanel } from "@/components/students/student-about-panel";
import { StudentDangerZone } from "@/components/students/student-danger-zone";
import { StudentIdentityStrip } from "@/components/students/student-identity-strip";
import { StudentQuickReference } from "@/components/students/student-quick-reference";
import { StudentStatCards } from "@/components/students/student-stat-cards";
import { StudentWorkspaceTabs } from "@/components/students/student-workspace-tabs";
import { StudentFamilyPanel } from "@/components/students/family-panel";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/section";
import { buildFeeBreakupDisplayRows } from "@/lib/fees/display-breakdown";
import { getDefaultAcademicSessionLabel } from "@/lib/config/fee-rules";
import { cn } from "@/lib/utils";
import {
  calculateInstallmentBasePending,
  calculateOverdueBaseAmount,
  calculatePendingLateFeeAmount,
} from "@/lib/fees/due-amounts";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getStudentDeletionSafety, getStudentFamilyMembersDetail } from "@/lib/students/data";
import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

type StudentDetailPageProps = {
  params: Promise<{
    studentId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    returnTo?: string;
  }>;
};

const newWorkspaceTabs = ["dues", "receipts", "payments", "fee-plan", "about"] as const;
type NewWorkspaceTab = (typeof newWorkspaceTabs)[number];

function normalizeTab(value: string | undefined): NewWorkspaceTab {
  const normalized = (value ?? "").trim();

  if (normalized === "profile" || normalized === "notes" || normalized === "history") {
    return "about";
  }

  return newWorkspaceTabs.includes(normalized as NewWorkspaceTab)
    ? (normalized as NewWorkspaceTab)
    : "dues";
}

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}


export default async function StudentDetailPage({
  params,
  searchParams,
}: StudentDetailPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = normalizeTab(resolvedSearchParams?.tab);
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/students")
    ? resolvedSearchParams.returnTo
    : "/protected/students";
  const encodedReturnTo = encodeURIComponent(returnTo);
  const { student, financialSnapshot, ledger, receipts, installmentBalances } =
    await getStudentWorkspaceData(resolvedParams.studentId);
  const deletionSafety = await getStudentDeletionSafety(resolvedParams.studentId);
  const familyMembersDetail = await getStudentFamilyMembersDetail(
    resolvedParams.studentId,
    financialSnapshot?.policy.academicSessionLabel || "2026-27"
  );

  if (!student) {
    notFound();
  }

  const canEditStudent = hasStaffPermission(staff, "students:write");
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewLedger = hasStaffPermission(staff, "ledger:view");
  const canShowDangerZone = staff.appRole === "admin" && canEditStudent && deletionSafety;
  const outstandingAmount = installmentBalances.reduce((sum, row) => sum + row.pendingAmount, 0);
  const overdueAmount = calculateOverdueBaseAmount(installmentBalances);
  const pendingLateFeeAmount = calculatePendingLateFeeAmount(installmentBalances);

  // Candidate late fee: for overdue installments where finalLateFee hasn't materialized yet
  // (only materializes in the view when a payment is made after the due date). If the installment
  // is overdue but has never received any payment, the view shows finalLateFee=0. We compute the
  // candidate amount using the policy flat rate minus any student-level waiver.
  const lateFeeFlatAmount = financialSnapshot?.policy.lateFeeFlatAmount ?? 0;
  const lateFeeWaiverPerInstallment = student.lateFeeWaiverAmount ?? 0;
  const perInstallmentCandidateLateFee = Math.max(0, lateFeeFlatAmount - lateFeeWaiverPerInstallment);
  const overdueUnmaterializedCount = installmentBalances.filter(
    (b) => b.balanceStatus === "overdue" && b.finalLateFee === 0,
  ).length;
  const candidateLateFeeAmount = overdueUnmaterializedCount * perInstallmentCandidateLateFee;
  const effectivePendingLateFeeAmount = pendingLateFeeAmount + candidateLateFeeAmount;

  const todayIso = getSchoolDateStamp();
  const feeBreakupRows = financialSnapshot
    ? buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown)
    : [];

  // Payment stat cards — computed from already-fetched data, no extra DB calls
  const allPayments = ledger?.payments ?? [];
  const paidInstallments = installmentBalances.filter((b) => b.balanceStatus === "paid").length;
  const overdueInstallments = installmentBalances.filter((b) => b.balanceStatus === "overdue").length;
  const partialInstallments = installmentBalances.filter((b) => b.balanceStatus === "partial").length;

  const modeLabels: Record<string, string> = {
    cash: "Cash",
    upi: "UPI",
    bank_transfer: "Bank transfer",
    cheque: "Cheque",
  };
  const receiptIdByNumber = new Map(receipts.map((r) => [r.receiptNumber, r.id]));
  const lastPaymentRow = allPayments[0] ?? null;
  const lastPaymentInfo = lastPaymentRow
    ? {
        date: lastPaymentRow.paymentDate,
        amount: lastPaymentRow.paymentAmount,
        mode: modeLabels[lastPaymentRow.paymentMode] ?? lastPaymentRow.paymentMode,
      }
    : null;

  const onTimePaid = allPayments.filter((p) => p.paymentDate <= p.dueDate).length;
  const paymentReliability =
    allPayments.length >= 3
      ? {
          onTimeCount: onTimePaid,
          totalCount: allPayments.length,
          percent: Math.round((onTimePaid / allPayments.length) * 100),
        }
      : null;

  const firstPendingInstallment = installmentBalances.find((b) => b.pendingAmount > 0) ?? null;
  const nextPendingInfo = firstPendingInstallment
    ? {
        label: firstPendingInstallment.installmentLabel,
        amount: firstPendingInstallment.pendingAmount,
        dueDate: firstPendingInstallment.dueDate,
        isOverdue: firstPendingInstallment.balanceStatus === "overdue",
      }
    : null;
  const paymentLinesDescription =
    "Each row is one installment allocation. A single receipt can appear as multiple rows here. Newest first.";

  const feePlanContent = (
    <Section
      title="Fee exceptions"
      description="Student-level fee exceptions and annual fee breakup. School-wide defaults stay in Fee Setup."
    >
      {financialSnapshot ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <ValueStatePill tone="policy">From Fee Setup</ValueStatePill>
            <ValueStatePill tone="calculated">Fee summary</ValueStatePill>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Tuition override</p>
              <p className="mt-2 font-semibold text-foreground">
                {student.tuitionOverride !== null ? <Money value={student.tuitionOverride} /> : "Class default"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Transport override</p>
              <p className="mt-2 font-semibold text-foreground">
                {student.transportOverride !== null ? <Money value={student.transportOverride} /> : "Route default"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Discount</p>
              <p className="mt-2 font-semibold text-foreground"><Money value={student.discountAmount} /></p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Late fee waiver</p>
              <p className="mt-2 font-semibold text-foreground"><Money value={student.lateFeeWaiverAmount} /></p>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-sm text-foreground">
            <span className="font-semibold text-foreground">Other fee / adjustment:</span>{" "}
            {student.otherAdjustmentHead ? (
              <>
                {student.otherAdjustmentHead} <span aria-hidden="true">|</span>{" "}
              </>
            ) : null}
            <Money value={student.otherAdjustmentAmount ?? 0} size="sm" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3">Fee head</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {feeBreakupRows.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.kind === "discount"
                        ? "bg-accent-soft/30 text-accent-soft-foreground"
                        : "even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors"
                    }
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{item.label}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-foreground">
                      <Money value={item.amount} size="sm" tone={item.kind === "discount" ? "auto" : "neutral"} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-2 font-bold text-foreground">
                  <td className="px-4 py-3">Resolved annual total</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums"><Money value={financialSnapshot.resolvedBreakdown.annualTotal} size="sm" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
          <p className="font-semibold text-foreground">Fee summary unavailable</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Fee summary is not available for this student yet.
          </p>
        </div>
      )}
    </Section>
  );

  const getInstallmentStatusPill = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success-soft-foreground">
            Paid
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center rounded-full bg-destructive-soft px-2.5 py-0.5 text-[11px] font-semibold text-destructive-soft-foreground">
            Overdue
          </span>
        );
      case "partial":
        return (
          <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning-soft-foreground">
            Partial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-surface-3/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  const installmentCount = financialSnapshot?.policy.installmentCount ?? installmentBalances.length ?? 4;
  const resolvedHeads = financialSnapshot?.resolvedBreakdown
    ? [
        ...financialSnapshot.resolvedBreakdown.coreHeads,
        ...financialSnapshot.resolvedBreakdown.customHeads,
      ].filter((head) => head.amount > 0)
    : [];
  const annualDiscount =
    (financialSnapshot?.resolvedBreakdown.discountApplied ?? 0) +
    (financialSnapshot?.resolvedBreakdown.conventionalDiscountApplied ?? 0);

  function buildPerInstallmentHeads(item: typeof installmentBalances[number]) {
    if (resolvedHeads.length === 0 || installmentCount <= 0) return [] as Array<{ label: string; amount: number }>;
    const headRows = resolvedHeads.map((head) => ({
      label: head.label,
      amount: Math.round(head.amount / installmentCount),
    }));
    if (annualDiscount > 0) {
      headRows.push({
        label: "Discount",
        amount: -Math.round(annualDiscount / installmentCount),
      });
    }
    if (item.finalLateFee > 0) {
      headRows.push({ label: "Late fee", amount: item.finalLateFee });
    }
    if (item.waiverApplied > 0) {
      headRows.push({ label: "Late fee waived", amount: -item.waiverApplied });
    }
    return headRows;
  }

  const duesContent = (
    <Section
      title="Dues"
      description={
        overdueAmount > 0
          ? `Overdue: ${formatInr(overdueAmount)} base${
              effectivePendingLateFeeAmount > 0 ? ` + ${formatInr(effectivePendingLateFeeAmount)} pending late fee` : ""
            }.`
          : installmentBalances.length > 0 && installmentBalances.every((b) => b.pendingAmount <= 0)
            ? "All installments settled for this session."
            : "Session dues breakdown below."
      }
    >
      {installmentBalances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
          <p className="font-semibold text-foreground">No dues prepared</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            No installment balance rows are available for this student yet.
          </p>
        </div>
      ) : (
        <>
        <div className="md:hidden space-y-2">
          {installmentBalances.map((item) => {
            const headRows = buildPerInstallmentHeads(item);
            return (
              <details
                key={item.installmentId}
                className="group rounded-lg border border-border bg-card"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">
                      {item.installmentLabel}
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground group-open:hidden">
                        · tap for fee heads
                      </span>
                    </span>
                    {getInstallmentStatusPill(item.balanceStatus)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Due {formatShortDate(item.dueDate)}</span>
                    <span className="font-mono font-semibold text-foreground">
                      <Money value={item.pendingAmount} size="sm" />
                    </span>
                  </div>
                  {item.finalLateFee > 0 ? (
                    <div className="text-xs text-destructive font-medium">
                      Includes {formatInr(item.finalLateFee)} late fee
                      {item.waiverApplied > 0 ? ` (−${formatInr(item.waiverApplied)} waived)` : ""}
                    </div>
                  ) : item.balanceStatus === "overdue" && perInstallmentCandidateLateFee > 0 ? (
                    <div className="text-xs text-destructive/80 font-medium">
                      + {formatInr(perInstallmentCandidateLateFee)} late fee pending
                    </div>
                  ) : null}
                </summary>
                {headRows.length > 0 ? (
                  <div className="border-t border-border bg-surface-2/40 px-4 py-2 text-xs">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Fee heads (approx · annual ÷ {installmentCount})
                    </p>
                    <ul className="space-y-1">
                      {headRows.map((head) => (
                        <li key={head.label} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{head.label}</span>
                          <span
                            className={cn(
                              "font-mono font-medium",
                              head.amount < 0 ? "text-success-soft-foreground" : "text-foreground",
                            )}
                          >
                            {head.amount < 0 ? `−${formatInr(Math.abs(head.amount))}` : formatInr(head.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">Installment</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3 text-right">Base due</th>
                <th className="px-4 py-3 text-right">Late fee</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Adjustments</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {installmentBalances.map((item) => (
                <tr key={item.installmentId} className="even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{item.installmentLabel}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{formatShortDate(item.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums"><Money value={item.baseCharge} size="sm" /></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {item.finalLateFee > 0 ? (
                      <>
                        <Money value={item.finalLateFee} size="sm" />
                        {item.waiverApplied > 0 ? (
                          <div className="text-[10px] text-success-soft-foreground font-medium mt-0.5">
                            −{formatInr(item.waiverApplied)} waived
                          </div>
                        ) : null}
                      </>
                    ) : item.balanceStatus === "overdue" && perInstallmentCandidateLateFee > 0 ? (
                      <span className="text-[11px] font-semibold text-destructive/80">
                        {formatInr(perInstallmentCandidateLateFee)} pending
                      </span>
                    ) : (
                      <Money value={0} size="sm" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-success-soft-foreground"><Money value={item.paidAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"><Money value={item.adjustmentAmount} size="sm" /></td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground font-mono tabular-nums"><Money value={item.pendingAmount} size="sm" /></td>
                  <td className="px-4 py-3">
                    {getInstallmentStatusPill(item.balanceStatus)}
                    {item.balanceStatus === "overdue" ? (
                      <div className="mt-1 text-[11px] font-medium text-destructive">
                        <Money value={calculateInstallmentBasePending(item)} size="sm" /> without late fee
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Section>
  );

  const paymentsContent = (
    <Section
      title="Payments"
      description={paymentLinesDescription}
    >
      <p className="mb-4 text-sm leading-6 text-muted-foreground sm:hidden">
        {paymentLinesDescription}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <ValueStatePill tone="locked">Locked payment history</ValueStatePill>
      </div>
      {!ledger || ledger.payments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
          <p className="font-semibold text-foreground">No payments posted yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            There are no payment history records found for this student.
          </p>
        </div>
      ) : (
        <>
        <div className="md:hidden space-y-2">
          {ledger.payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">
                  {payment.installmentLabel}
                </span>
                <Money value={payment.paymentAmount} size="sm" />
              </div>
              <div className="text-xs text-muted-foreground">
                Due {formatShortDate(payment.dueDate)}
              </div>
              <div className="flex items-center justify-between text-xs">
                {(() => {
                  const rid = receiptIdByNumber.get(payment.receiptNumber);
                  return rid ? (
                    <Link
                      href={`/protected/receipts/${rid}?returnTo=${encodedReturnTo}`}
                      className="font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {payment.receiptNumber}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">
                      {payment.receiptNumber}
                    </span>
                  );
                })()}
                <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium text-muted-foreground">
                  {modeLabels[payment.paymentMode] ?? payment.paymentMode}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">Posted at</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Installment</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {ledger.payments.map((payment) => (
                <tr key={payment.id} className="even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors">
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{formatDateTime(payment.createdAt)}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const rid = receiptIdByNumber.get(payment.receiptNumber);
                      return rid ? (
                        <Link
                          href={`/protected/receipts/${rid}?returnTo=${encodedReturnTo}`}
                          className="font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                          {payment.receiptNumber}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">
                          {payment.receiptNumber}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{payment.installmentLabel}</span>
                    <div className="text-[11px] text-muted-foreground font-mono tabular-nums">Due {formatShortDate(payment.dueDate)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium text-muted-foreground">
                      {modeLabels[payment.paymentMode] ?? payment.paymentMode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-foreground">
                    <Money value={payment.paymentAmount} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={payment.notes || undefined}>
                    {payment.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Section>
  );

  const receiptsBySession = (() => {
    const groups = new Map<string, typeof receipts>();
    for (const receipt of receipts) {
      let label = "Unknown";
      try {
        label = getDefaultAcademicSessionLabel(new Date(receipt.paymentDate));
      } catch {
        label = "Unknown";
      }
      const existing = groups.get(label) ?? [];
      existing.push(receipt);
      groups.set(label, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return b.localeCompare(a);
    });
  })();

  const activeSessionLabel = financialSnapshot?.policy.academicSessionLabel ?? null;

  const receiptsContent = (
    <Section title="Receipts" description="Receipts across every academic session for this student.">
      {receipts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-4 py-8 text-center">
          <p className="font-semibold text-foreground">No receipts found</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            No receipt records exist for this student yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {receiptsBySession.map(([sessionGroupLabel, sessionReceipts], groupIndex) => {
            const totalAmount = sessionReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
            const isActive = sessionGroupLabel === activeSessionLabel;
            const defaultOpen = isActive || groupIndex === 0;
            return (
              <details
                key={sessionGroupLabel}
                open={defaultOpen}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 bg-surface-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-2/80">
                  <span className="flex items-center gap-2">
                    Session {sessionGroupLabel}
                    {isActive ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-soft-foreground">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {sessionReceipts.length} receipt{sessionReceipts.length === 1 ? "" : "s"} ·{" "}
                    <Money value={totalAmount} size="xs" />
                  </span>
                </summary>

                <div className="md:hidden divide-y divide-border/60">
                  {sessionReceipts.map((receipt) => (
                    <div key={receipt.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{receipt.receiptNumber}</span>
                        <Money value={receipt.totalAmount} size="sm" />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatShortDate(receipt.paymentDate)}</span>
                        <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium">
                          {receipt.paymentModeLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        {receipt.referenceNumber ? (
                          <span className="text-xs text-muted-foreground font-mono">
                            Ref: {receipt.referenceNumber}
                          </span>
                        ) : <span />}
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs px-2">
                          <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}>
                            {canPrintReceipts ? "Print" : "Open"}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-4 py-3">Receipt</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Mode</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Received by</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {sessionReceipts.map((receipt) => (
                        <tr key={receipt.id} className="even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{receipt.receiptNumber}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{formatShortDate(receipt.paymentDate)}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className="inline-flex items-center rounded-md bg-surface-3/50 px-2 py-0.5 font-medium text-muted-foreground">
                              {receipt.paymentModeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-foreground">
                            <Money value={receipt.totalAmount} size="sm" />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{receipt.referenceNumber ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{receipt.receivedBy || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button asChild size="sm" variant="outline" className="h-8">
                              <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}>
                                {canPrintReceipts ? "Print" : "Open"}
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Section>
  );

  return (
    <div className="space-y-6">
      <OfficeRecentTracker
        student={{
          id: student.id,
          fullName: student.fullName,
          admissionNo: student.admissionNo,
        }}
      />

      {student.status !== "active" ? (
        <Notice
          tone="warning"
          title="This student record is archived"
        >
          Posting payments and editing are restricted. View only.
        </Notice>
      ) : null}

      <StudentIdentityStrip
        student={student}
        outstandingAmount={outstandingAmount}
        overdueAmount={overdueAmount}
        pendingLateFeeAmount={effectivePendingLateFeeAmount}
        creditBalance={financialSnapshot?.creditBalance ?? 0}
        nextDueDate={firstPendingInstallment?.dueDate ?? null}
        nextDueLabel={firstPendingInstallment?.installmentLabel ?? null}
        nextDueAmount={firstPendingInstallment?.pendingAmount ?? null}
        todayIso={todayIso}
        canPostPayments={canPostPayments}
        canEditStudent={canEditStudent}
        canPrintReceipts={canPrintReceipts}
        canViewLedger={canViewLedger}
        latestReceiptId={receipts[0]?.id ?? null}
        returnTo={returnTo}
        encodedReturnTo={encodedReturnTo}
      />

      <StudentStatCards
        installmentProgress={{
          paid: paidInstallments,
          overdue: overdueInstallments,
          partial: partialInstallments,
          total: installmentBalances.length,
        }}
        totalCollected={ledger?.totalPayments ?? 0}
        annualTotal={financialSnapshot?.resolvedBreakdown.annualTotal ?? 0}
        lastPayment={lastPaymentInfo}
        reliability={paymentReliability}
        nextPending={nextPendingInfo}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] min-w-0">
        <div className="min-w-0">
          <StudentWorkspaceTabs
            defaultTab={activeTab}
            counts={{
              dues: installmentBalances.filter((row) => row.pendingAmount > 0).length,
              receipts: receipts.length,
              payments: ledger?.payments.length ?? 0,
            }}
            duesContent={duesContent}
            receiptsContent={receiptsContent}
            paymentsContent={paymentsContent}
            feePlanContent={feePlanContent}
            aboutContent={<StudentAboutPanel student={student} ledger={ledger} receipts={receipts} />}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start space-y-6 min-w-0">
          <StudentQuickReference student={student} financialSnapshot={financialSnapshot} />
          <StudentFamilyPanel
            studentId={student.id}
            familyGroupId={familyMembersDetail.familyGroupId}
            confidence={familyMembersDetail.confidence}
            members={familyMembersDetail.members}
            sessionLabel={financialSnapshot?.policy.academicSessionLabel || "2026-27"}
            canLinkSibling={canEditStudent}
            currentStudent={{
              fullName: student.fullName,
              admissionNo: student.admissionNo,
              classLabel: student.classLabel,
              fatherName: student.fatherName ?? null,
              primaryPhone: student.fatherPhone ?? student.motherPhone ?? null,
            }}
          />
        </aside>
      </div>

      {canShowDangerZone ? (
        <StudentDangerZone studentId={student.id} deletionSafety={deletionSafety} />
      ) : null}
    </div>
  );
}
