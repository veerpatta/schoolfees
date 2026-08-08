import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";

import {
  MobileCard,
  MobileNote,
  MobileSectionCard,
  MobileStatStrip,
} from "@/components/mobile-app/mobile-kit";
import { OfficeRecentTracker, ValueStatePill } from "@/components/office/office-ui";
import { MobileStudentFamilyTab } from "@/components/students/mobile-student-family-tab";
import { MobileStudentProfile } from "@/components/students/mobile-student-profile";
import { StudentAboutPanel } from "@/components/students/student-about-panel";
import { StudentDangerZone } from "@/components/students/student-danger-zone";
import { StudentFeePlanEditButton } from "@/components/students/student-fee-plan-edit-button";
import { StudentIdentityStrip } from "@/components/students/student-identity-strip";
import { StudentQuickReference } from "@/components/students/student-quick-reference";
import { ShareFeeWhatsApp } from "@/components/students/share-fee-whatsapp";
import { StudentReceiptsPanel } from "@/components/students/student-receipts-panel";
import { StudentStatCards } from "@/components/students/student-stat-cards";
import { StudentStickyHeader } from "@/components/students/student-sticky-header";
import { StudentWorkspaceTabs } from "@/components/students/student-workspace-tabs";
import { StudentFamilyPanel } from "@/components/students/family-panel";
import { StudentFinanceGlance } from "@/components/students/student-finance-glance";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/section";
import { buildFeeBreakupDisplayRows } from "@/lib/fees/display-breakdown";
import { getDefaultAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  getDisplayInstallmentLabel,
  isCarryForwardInstallment,
} from "@/lib/prev-year-dues/display";
import { cn } from "@/lib/utils";
import {
  calculateInstallmentBasePending,
  calculateOverdueBaseAmount,
  calculatePendingLateFeeAmount,
} from "@/lib/fees/due-amounts";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst, formatShortDate } from "@/lib/helpers/date";
import { recordActivity } from "@/lib/activity/events";
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

/**
 * The phone shows three tabs where the desktop shows five. Map the desktop
 * deep links onto them so a `?tab=` URL shared from a computer opens the right
 * screen on a phone instead of silently falling back to the first tab. The
 * client only ever receives the resolved value, so there is one table.
 */
function normalizeMobileTab(value: string | undefined): "fees" | "family" | "about" {
  const desktopTab = normalizeTab(value);
  if (desktopTab === "about") return "about";
  if ((value ?? "").trim() === "family") return "family";
  // dues, receipts, payments and fee-plan all live on the phone's Fees tab.
  return "fees";
}

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

const formatDateTime = (value: string) => formatDateTimeIst(value);


export default async function StudentDetailPage({
  params,
  searchParams,
}: StudentDetailPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = normalizeTab(resolvedSearchParams?.tab);
  const mobileTab = normalizeMobileTab(resolvedSearchParams?.tab);
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/students")
    ? resolvedSearchParams.returnTo
    : "/protected/students";
  const encodedReturnTo = encodeURIComponent(returnTo);
  // Run three independent loaders in parallel. familyMembersDetail needs the
  // policy session label from the workspace snapshot, so it gets chained after
  // — but the round trips that were previously 4-deep now collapse to 2-deep,
  // with the heavy workspace fetch and the two side loaders overlapping.
  const [workspaceResult, deletionSafetyResult] =
    await Promise.all([
      getStudentWorkspaceData(resolvedParams.studentId),
      getStudentDeletionSafety(resolvedParams.studentId).catch(() => null),
    ]);
  const { student, financialSnapshot, ledger, receipts, installmentBalances } =
    workspaceResult;

  // Bail to the not-found UI before running any dependent rendering.
  if (!student) {
    notFound();
  }

  const familyMembersDetail = await getStudentFamilyMembersDetail(
    resolvedParams.studentId,
    financialSnapshot?.policy.academicSessionLabel || "2026-27",
  ).catch(
    () =>
      ({ familyGroupId: null, confidence: null, members: [] }) as Awaited<
        ReturnType<typeof getStudentFamilyMembersDetail>
      >,
  );

  const deletionSafety = deletionSafetyResult;

  // Fire-and-forget student view event after the response is sent — keeps
  // it off the critical path entirely.
  after(() => {
    void recordActivity({
      userId: (staff?.id as string | undefined) ?? null,
      kind: "student_view",
      refId: student.id,
      payload: {
        sessionLabel: financialSnapshot?.policy.academicSessionLabel ?? null,
      },
    });
  });

  const canEditStudent = hasStaffPermission(staff, "students:write");
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canWaiveLateFee = hasStaffPermission(staff, "payments:waive_late_fee");
  // Admin-only: `fees:write` sits in adminPermissions, while accountants get
  // only `fees:view`.
  const canEditFeePlan = hasStaffPermission(staff, "fees:write");
  const canViewLedger = hasStaffPermission(staff, "ledger:view");
  const canShowDangerZone = staff.appRole === "admin" && canEditStudent && deletionSafety;
  const outstandingAmount = installmentBalances.reduce((sum, row) => sum + row.pendingAmount, 0);
  const prevYearDuesAmount = installmentBalances.reduce(
    (sum, row) => (isCarryForwardInstallment(row) && row.pendingAmount > 0 ? sum + row.pendingAmount : sum),
    0,
  );
  const overdueAmount = calculateOverdueBaseAmount(installmentBalances);
  const pendingLateFeeAmount = calculatePendingLateFeeAmount(installmentBalances);

  // No "candidate" late fee any more. Both engines now charge an overdue
  // installment its flat late fee (migration 20260808140000), so finalLateFee off
  // the workbook view IS the pending late fee. Adding a candidate amount on top
  // would double-count: a grandfathered installment reads finalLateFee = 0
  // because it is fully waived, while still being balance_status = 'overdue' —
  // exactly what the old candidate check keyed on.
  const effectivePendingLateFeeAmount = pendingLateFeeAmount;

  // Writing a balance off is admin-only and money-moving, so it lives in the
  // Danger Zone next to withdraw and delete — not in the middle of the
  // Transactions table, and not on a phone-only card the desktop never showed.
  const closeBalanceProps =
    student.status === "active"
      ? {
          studentLabel: student.fullName,
          studentAdmissionNo: student.admissionNo,
          classLabel: student.classLabel,
          sessionLabel: financialSnapshot?.policy.academicSessionLabel ?? "",
          pendingAmount: outstandingAmount,
          oldBalanceAmount: prevYearDuesAmount,
        }
      : undefined;

  // Installments that still carry a late fee, so the waive sheet can aim at one
  // rather than handing the server a bare rupee amount. Capped at what is still
  // outstanding on the row: a late fee already collected is not "waivable" in the
  // sense the cashier means.
  const waivableInstallments = installmentBalances
    .map((item) => ({
      installmentId: item.installmentId,
      label: getDisplayInstallmentLabel(item),
      remainingLateFee: Math.min(item.finalLateFee, item.pendingAmount),
    }))
    .filter((item) => item.remainingLateFee > 0);

  // The policy RATE, used only by the mobile overdue warning ("a ₹1,000 late fee
  // applies"). Not a figure this student owes — that is pendingLateFeeAmount.
  const lateFeeFlatAmount = financialSnapshot?.policy.lateFeeFlatAmount ?? 0;

  const todayIso = getSchoolDateStamp();
  const feeBreakupRows = financialSnapshot
    ? buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown)
    : [];
  // The Discount card used to render `student.discountAmount`, which is the raw
  // student_fee_overrides column and therefore ZERO for anyone on an RTE /
  // Staff Child / 3rd Child policy — the card said "no discount" while the fee
  // table two divs below listed a Rs 15,000 conventional discount. Sum the
  // resolver's discount rows instead, exactly as the mobile Finance glance
  // already does, so the two halves of the same page agree.
  const totalDiscountAmount = feeBreakupRows
    .filter((row) => row.kind === "discount")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const conventionalDiscountLabels =
    financialSnapshot?.resolvedBreakdown.conventionalDiscountLabels ?? [];

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
        label: getDisplayInstallmentLabel(firstPendingInstallment),
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ValueStatePill tone="policy">From Fee Setup</ValueStatePill>
            <ValueStatePill tone="calculated">Fee summary</ValueStatePill>
            {canEditFeePlan ? (
              <div className="ml-auto">
                <StudentFeePlanEditButton
                  studentId={student.id}
                  studentLabel={student.fullName}
                  sessionLabel={financialSnapshot.policy.academicSessionLabel}
                  currentTuitionOverride={student.tuitionOverride}
                  currentTransportOverride={student.transportOverride}
                  classDefaultTuitionFee={financialSnapshot.classDefaultTuitionFee}
                  routeDefaultTransportFee={financialSnapshot.routeDefaultTransportFee}
                  currentHeads={financialSnapshot.resolvedBreakdown.otherAdjustmentHeads}
                  conventionalDiscountLabels={
                    financialSnapshot.resolvedBreakdown.conventionalDiscountLabels
                  }
                />
              </div>
            ) : null}
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
              <p className="mt-2 font-semibold text-foreground"><Money value={totalDiscountAmount} /></p>
              {conventionalDiscountLabels.length > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{conventionalDiscountLabels.join(", ")}</p>
              ) : null}
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

  // `paidAmount` on the workbook installment row is cash-only (the view
  // splits out discount-mode receipts into a separate column). Sum it
  // directly for "Paid till now"; "Closed as discount" is sourced from
  // discount-mode receipts on the receipts list.
  const cashPaidAllInstallments = installmentBalances.reduce(
    (sum, b) => sum + b.paidAmount,
    0,
  );
  const discountClosedAmount = receipts
    .filter((r) => r.paymentMode === "discount")
    .reduce((sum, r) => sum + r.totalAmount, 0);
  const totalAnnualForGlance = installmentBalances.reduce(
    (sum, b) => sum + b.baseCharge,
    0,
  );
  const lateFeeWaivedTotal = installmentBalances.reduce(
    (sum, b) => sum + b.waiverApplied,
    0,
  );
  // Build the snapshot rows from the same source as the Fee plan tab so the
  // tuition row shows the gross amount and the discount line subtracts it
  // cleanly — otherwise the resolver's post-conventional-discount tuition
  // would appear alongside the conventional discount, producing nonsensical
  // arithmetic on the screen.
  const glanceBreakdownRows = financialSnapshot
    ? buildFeeBreakupDisplayRows(financialSnapshot.resolvedBreakdown)
    : [];
  const glanceAnnualHeads = glanceBreakdownRows
    .filter((row) => row.kind === "charge" && row.amount > 0)
    .map((row) => ({ label: row.label, amount: row.amount }));
  const glanceDiscountAmount = glanceBreakdownRows
    .filter((row) => row.kind === "discount")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const glanceDiscountLabels =
    financialSnapshot?.resolvedBreakdown.conventionalDiscountLabels ?? [];

  const installmentCount = financialSnapshot?.policy.installmentCount ?? installmentBalances.length ?? 4;
  // Use the same display-breakdown rows the snapshot and Fee plan tab use,
  // so the per-installment slice (mobile dues) stays consistent with the
  // pre-conventional-discount tuition + discount-line presentation.
  const annualBreakdownRows = glanceBreakdownRows;

  function buildPerInstallmentHeads(item: typeof installmentBalances[number]) {
    if (isCarryForwardInstallment(item)) {
      return [{ label: "Previous year tuition balance", amount: item.baseCharge }];
    }
    if (annualBreakdownRows.length === 0 || installmentCount <= 0) {
      return [] as Array<{ label: string; amount: number }>;
    }
    const isFirstInstallment = item.installmentNo === 1;
    const headRows: Array<{ label: string; amount: number }> = [];
    for (const row of annualBreakdownRows) {
      if (row.kind === "charge") {
        if (row.amount <= 0) continue;
        // Academic fee is bundled into installment 1 only (workbook model).
        if (row.id === "academic_fee") {
          if (isFirstInstallment) {
            headRows.push({ label: row.label, amount: row.amount });
          }
        } else {
          headRows.push({ label: row.label, amount: Math.round(row.amount / installmentCount) });
        }
      } else {
        // Conventional + student discount rows split evenly across installments.
        // Labels are preserved so RTE/Staff Child/3rd Child stay legible per row.
        const slice = -Math.round(Math.abs(row.amount) / installmentCount);
        if (slice !== 0) {
          headRows.push({ label: row.label, amount: slice });
        }
      }
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
              {installmentBalances.map((item) => {
                return (
                <tr key={item.installmentId} className="even:bg-surface-2/30 hover:bg-surface-2/10 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{getDisplayInstallmentLabel(item)}</td>
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
                    ) : item.waiverApplied > 0 ? (
                      // Fully waived. This used to fall through to a bare ₹0, which
                      // hid the fact that a late fee had been charged at all and
                      // then forgiven — the single most confusing cell on the page.
                      <span className="text-[11px] font-semibold text-success-soft-foreground">
                        {formatInr(item.waiverApplied)} waived
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
                );
              })}
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
    <StudentReceiptsPanel
      receipts={receipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        paymentDate: r.paymentDate,
        totalAmount: r.totalAmount,
        paymentModeLabel: r.paymentModeLabel,
        referenceNumber: r.referenceNumber,
        receivedBy: r.receivedBy,
      }))}
      receiptsBySession={receiptsBySession.map(([sessionLabel, list]) => ({
        sessionLabel,
        receipts: list.map((r) => ({
          id: r.id,
          receiptNumber: r.receiptNumber,
          paymentDate: r.paymentDate,
          totalAmount: r.totalAmount,
          paymentModeLabel: r.paymentModeLabel,
          referenceNumber: r.referenceNumber,
          receivedBy: r.receivedBy,
        })),
      }))}
      activeSessionLabel={activeSessionLabel}
      canPrintReceipts={canPrintReceipts}
      encodedReturnTo={encodedReturnTo}
    />
  );

  // ── Phone screens (mobile app v2 §STUDENT DETAIL) ────────────────────────
  // Built from the values already computed above — no extra loaders. The
  // desktop tree below is untouched, just wrapped in `hidden md:block`.
  const tm = await getTranslations("MobileApp");

  const mobileStatusPill = (status: string) => {
    const tone =
      status === "paid"
        ? "bg-success-soft text-success-soft-foreground"
        : status === "overdue"
          ? "bg-destructive-soft text-destructive-soft-foreground"
          : status === "partial"
            ? "bg-warning-soft text-warning-soft-foreground"
            : "bg-surface-2 text-muted-foreground";
    const label =
      status === "paid"
        ? tm("instStatusPaid")
        : status === "overdue"
          ? tm("instStatusOverdue")
          : status === "partial"
            ? tm("instStatusPartial")
            : tm("instStatusUpcoming");
    return (
      <span
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9.5px] font-extrabold",
          tone,
        )}
      >
        {label}
      </span>
    );
  };

  const mobileFeesContent = (
    <div className="flex flex-col gap-2.5">
      {student.status !== "active" ? (
        <MobileNote icon="🗄️">{tm("studentArchivedNotice")}</MobileNote>
      ) : null}

      <MobileStatStrip
        stats={[
          {
            label: tm("studentStatTotal"),
            value: formatInr(totalAnnualForGlance + lateFeeWaivedTotal),
          },
          {
            label: tm("studentStatPaid"),
            value: formatInr(cashPaidAllInstallments),
            tone: "success",
          },
          {
            label: tm("studentStatDue"),
            value: formatInr(outstandingAmount),
            tone:
              outstandingAmount <= 0 ? "success" : overdueAmount > 0 ? "danger" : "warning",
          },
        ]}
      />

      {overdueAmount > 0 ? (
        <MobileNote icon="⏰" className="border-destructive/30 bg-destructive-soft">
          <span className="text-destructive-soft-foreground">
            {tm("studentOverdueNote", {
              amount: formatInr(overdueAmount),
              lateFee: formatInr(lateFeeFlatAmount),
            })}
          </span>
        </MobileNote>
      ) : nextPendingInfo ? (
        <MobileNote icon="📅">
          {tm("studentNextDue", {
            label: nextPendingInfo.label,
            amount: formatInr(nextPendingInfo.amount),
            date: formatShortDate(nextPendingInfo.dueDate),
          })}
        </MobileNote>
      ) : null}

      {installmentBalances.length === 0 ? (
        <MobileNote icon="⚠️" className="border-warning/50 bg-warning-soft">
          <span className="font-bold text-warning-soft-foreground">{tm("studentNoDues")}</span>{" "}
          <span className="text-warning-soft-foreground">{tm("studentNoDuesBody")}</span>
        </MobileNote>
      ) : (
        <MobileSectionCard title={tm("studentInstallmentsTitle")}>
          <ul className="flex flex-col gap-1.5">
            {installmentBalances.map((item) => {
              const headRows = buildPerInstallmentHeads(item);
              return (
                <li key={item.installmentId}>
                  <details className="group rounded-xl border border-border bg-card">
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 p-2.5">
                      <span
                        className={cn(
                          "grid size-[26px] shrink-0 place-items-center rounded-full text-[11px] font-extrabold",
                          item.balanceStatus === "paid"
                            ? "bg-success-soft text-success-soft-foreground"
                            : item.balanceStatus === "overdue"
                              ? "bg-destructive-soft text-destructive-soft-foreground"
                              : "bg-surface-2 text-muted-foreground",
                        )}
                      >
                        {item.installmentNo}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-bold text-foreground">
                          {getDisplayInstallmentLabel(item)}
                        </span>
                        <span className="block text-[10.5px] font-medium text-muted-foreground">
                          {formatShortDate(item.dueDate)}
                          <span className="group-open:hidden"> · {tm("studentTapForHeads")}</span>
                        </span>
                      </span>
                      <span
                        className={cn(
                          "tabular shrink-0 text-[12.5px] font-extrabold",
                          item.balanceStatus === "paid"
                            ? "text-success"
                            : item.balanceStatus === "overdue"
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {formatInr(item.pendingAmount)}
                      </span>
                      {mobileStatusPill(item.balanceStatus)}
                    </summary>
                    {item.finalLateFee > 0 ? (
                      <p className="px-2.5 pb-2 text-[10.5px] font-semibold text-destructive">
                        {tm("lateFeeIncluded", { amount: formatInr(item.finalLateFee) })}
                        {item.waiverApplied > 0
                          ? ` ${tm("lateFeeWaivedSuffix", { amount: formatInr(item.waiverApplied) })}`
                          : ""}
                      </p>
                    ) : item.waiverApplied > 0 ? (
                      // Fully waived — say so, rather than showing nothing at all.
                      <p className="px-2.5 pb-2 text-[10.5px] font-semibold text-success-soft-foreground">
                        {tm("lateFeeFullyWaived", { amount: formatInr(item.waiverApplied) })}
                      </p>
                    ) : null}
                    {headRows.length > 0 ? (
                      <div className="border-t border-border bg-surface-2/40 px-2.5 py-2">
                        <p className="mobile-eyebrow text-muted-foreground">
                          {tm("studentFeeHeadsTitle")}
                        </p>
                        <ul className="mt-1 flex flex-col gap-1">
                          {headRows.map((head) => (
                            <li key={head.label} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">{head.label}</span>
                              <span
                                className={cn(
                                  "tabular text-[11px] font-semibold",
                                  head.amount < 0 ? "text-success" : "text-foreground",
                                )}
                              >
                                {head.amount < 0
                                  ? `−${formatInr(Math.abs(head.amount))}`
                                  : formatInr(head.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ul>
        </MobileSectionCard>
      )}

      <MobileSectionCard title={tm("studentReceiptsTitle")}>
        {receipts.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">{tm("studentNoReceipts")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {receipts.slice(0, 12).map((receipt) => (
              <li key={receipt.id}>
                <Link
                  href={`/protected/receipts/${receipt.id}?returnTo=${encodedReturnTo}`}
                  className="focus-ring flex items-center justify-between gap-2.5 rounded-xl border border-border px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[12px] font-extrabold text-foreground",
                        receipt.isReversed && "line-through",
                      )}
                    >
                      {receipt.receiptNumber}
                    </span>
                    <span className="block text-[10.5px] font-medium text-muted-foreground">
                      {formatShortDate(receipt.paymentDate)} · {receipt.paymentModeLabel}
                    </span>
                  </span>
                  {receipt.isReversed ? (
                    <span className="shrink-0 rounded-full bg-destructive-soft px-2 py-0.5 text-[9.5px] font-extrabold text-destructive-soft-foreground">
                      {tm("studentReceiptReversed")}
                    </span>
                  ) : (
                    <span className="tabular shrink-0 text-[12.5px] font-extrabold text-success">
                      {formatInr(receipt.totalAmount)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </MobileSectionCard>

      {/* The annual half of the desktop "Fee plan" tab. Collapsed: it answers a
          policy question, not the one a parent is asking at the counter. */}
      {financialSnapshot ? (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none p-4 text-[13.5px] font-extrabold text-foreground">
            {tm("studentAnnualPlanTitle")}
          </summary>
          <div className="border-t border-border px-4 py-3">
            <ul className="flex flex-col gap-1.5">
              {feeBreakupRows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">{row.label}</span>
                  <span
                    className={cn(
                      "tabular text-[11.5px] font-semibold",
                      row.kind === "discount" ? "text-success" : "text-foreground",
                    )}
                  >
                    {formatInr(row.amount)}
                  </span>
                </li>
              ))}
              <li className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-[12px] font-extrabold text-foreground">
                  {tm("studentAnnualTotal")}
                </span>
                <span className="tabular text-[12.5px] font-extrabold text-foreground">
                  {formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}
                </span>
              </li>
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );

  const mobileAboutRows: Array<{ key: string; value: string }> = [
    { key: tm("aboutSrNumber"), value: student.admissionNo || "—" },
    {
      key: tm("aboutDob"),
      value: student.dateOfBirth ? formatShortDate(student.dateOfBirth) : tm("aboutNotSet"),
    },
    { key: tm("aboutFather"), value: student.fatherName || tm("aboutNotSet") },
    { key: tm("aboutMother"), value: student.motherName || tm("aboutNotSet") },
    { key: tm("aboutClass"), value: student.classLabel },
    { key: tm("aboutRoute"), value: student.transportRouteLabel || tm("aboutNotSet") },
    { key: tm("aboutOldBalance"), value: formatInr(prevYearDuesAmount) },
    { key: tm("aboutCredit"), value: formatInr(financialSnapshot?.creditBalance ?? 0) },
    { key: tm("aboutLateFeeWaiver"), value: formatInr(student.lateFeeWaiverAmount ?? 0) },
    {
      key: tm("aboutStatus"),
      value: `${student.studentStatusLabel} · ${student.status}`,
    },
  ];

  const mobileAboutContent = (
    <div className="flex flex-col gap-2.5">
      <MobileCard>
        <dl className="flex flex-col gap-2.5">
          {mobileAboutRows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] font-semibold text-muted-foreground">{row.key}</dt>
              <dd className="text-right text-[12.5px] font-bold text-foreground">{row.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[12px] font-semibold text-muted-foreground">
              {tm("aboutDiscount")}
            </dt>
            <dd className="flex flex-wrap justify-end gap-1 text-right">
              {/* The real assigned policies — RTE / Staff Child / 3rd Child. */}
              {glanceDiscountLabels.length > 0 ? (
                glanceDiscountLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-extrabold text-success-soft-foreground"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-[12.5px] font-bold text-foreground">
                  {glanceDiscountAmount > 0 ? formatInr(glanceDiscountAmount) : tm("aboutNoDiscount")}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </MobileCard>

      {canShowDangerZone ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive-soft/40 p-4">
          <p className="text-[12.5px] font-extrabold text-destructive">{tm("dangerTitle")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-destructive/90">
            {tm("dangerBody")}
          </p>
          <div className="mt-3">
            <StudentDangerZone
              studentId={student.id}
              deletionSafety={deletionSafety}
              closeBalance={closeBalanceProps}
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    // Flex gap rather than space-y — the desktop-only sticky header sits above
    // the phone branch, and `space-y` counts `display:none` siblings, leaving a
    // gap above the phone header. See the same note on the Students list page.
    <div className="flex flex-col gap-6">
      <OfficeRecentTracker
        student={{
          id: student.id,
          fullName: student.fullName,
          admissionNo: student.admissionNo,
        }}
      />

      {/* Desktop only: `sticky top-14` is meaningless on a phone, where `main`
          is the scroll region and the phone profile carries its own header. */}
      <div className="hidden md:block">
        <StudentStickyHeader
          fullName={student.fullName}
          classLabel={student.classLabel}
          admissionNo={student.admissionNo}
          outstandingAmount={outstandingAmount}
        />
      </div>

      {/* ── Phone (mobile app v2 §STUDENT DETAIL) ──────────────────────
          Three tabs and a fixed action bar. The desktop tree below is the
          same components as before, wrapped so a phone never renders both. */}
      <div className="md:hidden">
        <MobileStudentProfile
          studentId={student.id}
          studentName={student.fullName}
          classLabel={student.classLabel}
          admissionNo={student.admissionNo}
          fatherPhone={student.fatherPhone}
          motherPhone={student.motherPhone}
          canPostPayments={canPostPayments}
          canShare={Boolean(student.fatherPhone || student.motherPhone)}
          isActive={student.status === "active"}
          returnTo={returnTo}
          initialTab={mobileTab}
          familyGroupId={familyMembersDetail.familyGroupId}
          pendingAmount={outstandingAmount}
          familyCount={familyMembersDetail.members.filter((member) => !member.isSelf).length}
          feesContent={mobileFeesContent}
          familyContent={
            <MobileStudentFamilyTab
              studentId={student.id}
              familyGroupId={familyMembersDetail.familyGroupId}
              confidence={familyMembersDetail.confidence}
              members={familyMembersDetail.members}
              sessionLabel={financialSnapshot?.policy.academicSessionLabel || "2026-27"}
              canEditStudent={canEditStudent}
              canCollectPayments={canPostPayments}
              returnTo={returnTo}
              currentStudent={{
                fullName: student.fullName,
                admissionNo: student.admissionNo,
                classLabel: student.classLabel,
                fatherName: student.fatherName ?? null,
                primaryPhone: student.fatherPhone ?? student.motherPhone ?? null,
              }}
            />
          }
          aboutContent={mobileAboutContent}
        />
      </div>

      <div className="hidden space-y-6 md:block">
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
        prevYearDuesAmount={prevYearDuesAmount}
        overdueAmount={overdueAmount}
        pendingLateFeeAmount={effectivePendingLateFeeAmount}
        waivableInstallments={waivableInstallments}
        creditBalance={financialSnapshot?.creditBalance ?? 0}
        nextDueDate={firstPendingInstallment?.dueDate ?? null}
        nextDueLabel={firstPendingInstallment ? getDisplayInstallmentLabel(firstPendingInstallment) : null}
        nextDueAmount={firstPendingInstallment?.pendingAmount ?? null}
        todayIso={todayIso}
        canPostPayments={canPostPayments}
        canEditStudent={canEditStudent}
        canWaiveLateFee={canWaiveLateFee}
        lateFeeWaiverAmount={student.lateFeeWaiverAmount ?? 0}
        sessionLabel={financialSnapshot?.policy.academicSessionLabel ?? ""}
        canPrintReceipts={canPrintReceipts}
        canViewLedger={canViewLedger}
        latestReceiptId={receipts[0]?.id ?? null}
        returnTo={returnTo}
        encodedReturnTo={encodedReturnTo}
      />

      <StudentFinanceGlance
        annualHeads={glanceAnnualHeads}
        discountAmount={glanceDiscountAmount}
        discountLabels={glanceDiscountLabels}
        totalAnnual={totalAnnualForGlance + lateFeeWaivedTotal}
        totalPaid={cashPaidAllInstallments}
        discountClosedAmount={discountClosedAmount}
        totalPending={outstandingAmount}
        overdueAmount={overdueAmount}
        pendingLateFeeAmount={effectivePendingLateFeeAmount}
        lateFeeWaivedTotal={lateFeeWaivedTotal}
        creditBalance={financialSnapshot?.creditBalance ?? 0}
        installments={installmentBalances.map((b) => ({
          installmentId: b.installmentId,
          installmentNo: b.installmentNo,
          installmentLabel: getDisplayInstallmentLabel(b),
          dueDate: b.dueDate,
          baseCharge: b.baseCharge,
          pendingAmount: b.pendingAmount,
          paidAmount: b.paidAmount,
          rawLateFee: b.rawLateFee,
          finalLateFee: b.finalLateFee,
          waiverApplied: b.waiverApplied,
          adjustmentAmount: b.adjustmentAmount,
          lastPaymentDate: b.lastPaymentDate,
          balanceStatus: b.balanceStatus,
        }))}
        nextDueDate={firstPendingInstallment?.dueDate ?? null}
        nextDueLabel={firstPendingInstallment ? getDisplayInstallmentLabel(firstPendingInstallment) : null}
        nextDueAmount={firstPendingInstallment?.pendingAmount ?? null}
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
          <ShareFeeWhatsApp
            studentId={student.id}
            studentName={student.fullName}
            familyGroupId={familyMembersDetail.familyGroupId}
            fatherPhone={student.fatherPhone}
            motherPhone={student.motherPhone}
            pendingAmount={outstandingAmount}
          />
        </aside>
      </div>

      {canShowDangerZone ? (
        <StudentDangerZone
              studentId={student.id}
              deletionSafety={deletionSafety}
              closeBalance={closeBalanceProps}
            />
      ) : null}
      </div>
    </div>
  );
}
