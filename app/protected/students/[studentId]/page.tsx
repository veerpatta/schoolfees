import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeRecentTracker, ValueStatePill } from "@/components/office/office-ui";
import { StudentStatusBadge } from "@/components/students/student-status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { getStudentDeletionSafety } from "@/lib/students/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  archiveStudentAction,
  hardDeleteStudentAction,
} from "../actions";

type StudentDetailPageProps = {
  params: Promise<{
    studentId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const workspaceTabs = [
  "profile",
  "fee-plan",
  "dues",
  "payments",
  "receipts",
  "notes",
  "history",
] as const;

type WorkspaceTab = (typeof workspaceTabs)[number];

function normalizeTab(value: string | undefined): WorkspaceTab {
  const normalized = (value ?? "").trim();
  return workspaceTabs.includes(normalized as WorkspaceTab)
    ? (normalized as WorkspaceTab)
    : "profile";
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readValue(value: string | null) {
  return value?.trim() || "-";
}

function installmentTone(status: string) {
  if (status === "paid") {
    return "locked";
  }

  if (status === "overdue" || status === "partial") {
    return "review";
  }

  return "calculated";
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: StudentDetailPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = normalizeTab(resolvedSearchParams?.tab);
  const { student, financialSnapshot, ledger, receipts, installmentBalances } =
    await getStudentWorkspaceData(resolvedParams.studentId);
  const deletionSafety = await getStudentDeletionSafety(resolvedParams.studentId);

  if (!student) {
    notFound();
  }

  const canEditStudent = hasStaffPermission(staff, "students:write");
  const canPrintReceipts = hasStaffPermission(staff, "receipts:print");
  const canPostPayments = hasStaffPermission(staff, "payments:write");
  const canViewLedger = hasStaffPermission(staff, "ledger:view");
  const tabs = workspaceTabs.map((tab) => ({
    key: tab,
    label:
      tab === "fee-plan"
        ? "Fee Plan"
        : tab === "dues"
          ? "Dues"
          : tab === "history"
            ? "History"
            : tab === "payments"
              ? "Payments"
              : tab === "receipts"
                ? "Receipts"
                : tab === "notes"
                  ? "Notes"
                  : "Profile",
  }));

  return (
    <div className="space-y-6">
      <OfficeRecentTracker
        student={{
          id: student.id,
          fullName: student.fullName,
          admissionNo: student.admissionNo,
        }}
      />

      <PageHeader
        eyebrow="Students"
        title={student.fullName}
        description={`SR no ${student.admissionNo} | ${student.classLabel}`}
        actions={<StudentStatusBadge status={student.status} />}
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Student workspace"
          description="Keep workbook identity, dues, and action shortcuts together on one staff screen."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Class</p>
              <p className="mt-2 font-semibold text-slate-950">{student.classLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Route</p>
              <p className="mt-2 font-semibold text-slate-950">{student.transportRouteLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Student status</p>
              <p className="mt-2 font-semibold text-slate-950">{student.studentStatusLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Primary contact</p>
              <p className="mt-2 font-semibold text-slate-950">{student.fatherPhone ?? student.motherPhone ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Outstanding</p>
              <p className="mt-2 font-semibold text-slate-950">
                {financialSnapshot ? formatInr(financialSnapshot.currentOutstanding) : "-"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {canPostPayments ? (
              <Button asChild>
                <Link href={`/protected/payments?studentId=${student.id}`}>Post payment</Link>
              </Button>
            ) : null}
            {canViewLedger ? (
              <Button asChild variant="outline">
                <Link href={`/protected/ledger?studentId=${student.id}`}>Open ledger</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/protected/students/${student.id}/statement`}>Print master statement</Link>
            </Button>
            {receipts[0] ? (
              <Button asChild variant="outline">
                <Link href={`/protected/receipts/${receipts[0].id}`}>
                  {canPrintReceipts ? "Print latest receipt" : "Open latest receipt"}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/protected/students">Back to students</Link>
            </Button>
            {canEditStudent ? (
              <Button asChild variant="outline">
                <Link href={`/protected/students/${student.id}/edit`}>Edit student</Link>
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Computed Fee Snapshot" description="Read-only current policy, class/route defaults, student overrides, next due, and outstanding position.">
          {financialSnapshot ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <ValueStatePill tone="policy">Policy-driven</ValueStatePill>
                <ValueStatePill tone="calculated">Calculated dues</ValueStatePill>
                {financialSnapshot.activeOverrideReason ? (
                  <ValueStatePill tone="review">Override active</ValueStatePill>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-950">{financialSnapshot.policy.academicSessionLabel}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Next due: {financialSnapshot.nextDueLabel ?? "No pending dues"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {financialSnapshot.nextDueDate && financialSnapshot.nextDueAmount !== null
                    ? `${formatShortDate(financialSnapshot.nextDueDate)} | ${formatInr(financialSnapshot.nextDueAmount)}`
                    : "All installments are settled"}
                </p>
                {financialSnapshot.activeOverrideReason ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Override reason: {financialSnapshot.activeOverrideReason}
                  </p>
                ) : null}
                {financialSnapshot.resolvedBreakdown.booksExcludedFromWorkbook ? (
                  <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    Books are kept outside workbook-mode calculation for AY 2026-27.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Financial snapshot is not available yet.</p>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Workspace tabs" description="Open one section at a time instead of jumping across several routes.">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/protected/students/${student.id}?tab=${tab.key}`}
              className={
                activeTab === tab.key
                  ? "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-3 py-2 text-sm text-white"
                  : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
              }
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </SectionCard>

      {activeTab === "profile" ? (
        <SectionCard title="Basic Details" description="Identity, family, class, route, and record status.">
          <div className="grid gap-5 lg:grid-cols-2">
            <dl className="space-y-3 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Student name</dt>
                <dd>{student.fullName}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">SR no</dt>
                <dd>{student.admissionNo}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">DOB</dt>
                <dd>{formatDate(student.dateOfBirth)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Address</dt>
                <dd>{readValue(student.address)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Student status</dt>
                <dd>{student.studentStatusLabel}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Record status</dt>
                <dd>{student.status}</dd>
              </div>
            </dl>
            <dl className="space-y-3 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Father</dt>
                <dd>{readValue(student.fatherName)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Mother</dt>
                <dd>{readValue(student.motherName)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Father phone</dt>
                <dd>{readValue(student.fatherPhone)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Mother phone</dt>
                <dd>{readValue(student.motherPhone)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <dt className="font-medium text-slate-500">Route</dt>
                <dd>{student.transportRouteLabel}</dd>
              </div>
            </dl>
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "fee-plan" && financialSnapshot ? (
        <SectionCard title="Fee Profile" description="Student-level fee profile and resolved annual workbook fee breakup. School-wide defaults stay in Fee Setup.">
          <div className="mb-4 flex flex-wrap gap-2">
            <ValueStatePill tone="policy">Policy-driven values</ValueStatePill>
            <ValueStatePill tone="calculated">Calculated totals</ValueStatePill>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tuition override</p>
              <p className="mt-2 font-semibold text-slate-950">
                {student.tuitionOverride !== null ? formatInr(student.tuitionOverride) : "Class default"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Transport override</p>
              <p className="mt-2 font-semibold text-slate-950">
                {student.transportOverride !== null ? formatInr(student.transportOverride) : "Route default"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Discount</p>
              <p className="mt-2 font-semibold text-slate-950">{formatInr(student.discountAmount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Late fee waiver</p>
              <p className="mt-2 font-semibold text-slate-950">{formatInr(student.lateFeeWaiverAmount)}</p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Other fee / adjustment:</span>{" "}
            {student.otherAdjustmentHead ? `${student.otherAdjustmentHead} | ` : ""}
            {formatInr(student.otherAdjustmentAmount ?? 0)}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Fee head</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...financialSnapshot.resolvedBreakdown.coreHeads,
                  ...financialSnapshot.resolvedBreakdown.customHeads,
                ].map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{item.label}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatInr(item.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-3">Resolved annual total</td>
                  <td className="px-4 py-3">{formatInr(financialSnapshot.resolvedBreakdown.annualTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {canEditStudent ? (
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href={`/protected/students/${student.id}/edit`}>Edit student fee profile</Link>
              </Button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {activeTab === "dues" ? (
        <SectionCard title="Dues / Installments" description="Current workbook installment position for the student.">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Base due</th>
                  <th className="px-4 py-3">Late fee</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Adjustments</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {installmentBalances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No installment balance rows are available yet.
                    </td>
                  </tr>
                ) : (
                  installmentBalances.map((item) => (
                    <tr key={item.installmentId} className="border-t border-slate-100">
                      <td className="px-4 py-3">{item.installmentLabel}</td>
                      <td className="px-4 py-3">{formatShortDate(item.dueDate)}</td>
                      <td className="px-4 py-3">{formatInr(item.baseCharge)}</td>
                      <td className="px-4 py-3">{formatInr(item.finalLateFee)}</td>
                      <td className="px-4 py-3">{formatInr(item.paidAmount)}</td>
                      <td className="px-4 py-3">{formatInr(item.adjustmentAmount)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatInr(item.pendingAmount)}</td>
                      <td className="px-4 py-3">
                        <ValueStatePill tone={installmentTone(item.balanceStatus)} className="normal-case tracking-normal">
                          {item.balanceStatus}
                        </ValueStatePill>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "payments" && ledger ? (
        <SectionCard title="Payments" description="Posted payment rows stay append-only and visible here in newest-first order.">
          <div className="mb-4 flex flex-wrap gap-2">
            <ValueStatePill tone="locked">Locked payment history</ValueStatePill>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Posted at</th>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ledger.payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No payment rows found for this student yet.
                    </td>
                  </tr>
                ) : (
                  ledger.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{formatDateTime(payment.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{payment.receiptNumber}</td>
                      <td className="px-4 py-3">
                        {payment.installmentLabel}
                        <div className="text-xs text-slate-500">Due {formatShortDate(payment.dueDate)}</div>
                      </td>
                      <td className="px-4 py-3">{payment.paymentMode}</td>
                      <td className="px-4 py-3">{formatInr(payment.paymentAmount)}</td>
                      <td className="px-4 py-3">{payment.notes || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "receipts" ? (
        <SectionCard title="Receipts" description="Latest receipts and quick print/open actions for this student.">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Received by</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No receipts found for this student.
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => (
                    <tr key={receipt.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{receipt.receiptNumber}</td>
                      <td className="px-4 py-3">{formatShortDate(receipt.paymentDate)}</td>
                      <td className="px-4 py-3">{receipt.paymentModeLabel}</td>
                      <td className="px-4 py-3">{formatInr(receipt.totalAmount)}</td>
                      <td className="px-4 py-3">{receipt.referenceNumber ?? "-"}</td>
                      <td className="px-4 py-3">{receipt.receivedBy || "-"}</td>
                      <td className="px-4 py-3">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/protected/receipts/${receipt.id}`}>
                            {canPrintReceipts ? "Print" : "Open"}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "notes" ? (
        <SectionCard title="Notes" description="Office notes remain part of the student master record.">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            {readValue(student.notes)}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "history" ? (
        <SectionCard title="Audit / History" description="High-level history summary without exposing risky finance edits.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Created</p>
              <p className="mt-2 text-sm text-slate-900">{formatDateTime(student.createdAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Last updated</p>
              <p className="mt-2 text-sm text-slate-900">{formatDateTime(student.updatedAt)}</p>
            </div>
          </div>
          {ledger ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Payment rows</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{ledger.paymentOptions.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Adjustment rows</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{ledger.adjustments.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Latest receipt</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{receipts[0]?.receiptNumber ?? "-"}</p>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {canEditStudent && deletionSafety ? (
        <SectionCard
          title="Admin record action"
          description="Use delete only for wrong no-history records. Use archive / withdraw when finance records must stay valid."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p>
                Receipts: {deletionSafety.receiptCount}, payments: {deletionSafety.paymentCount},
                installments: {deletionSafety.installmentCount}, adjustments: {deletionSafety.adjustmentCount}.
              </p>
              <p className="mt-2">
                {deletionSafety.hardDeleteAllowed
                  ? deletionSafety.generatedDuesDeleteAllowed
                    ? "Only generated dues are linked. Admin can delete this wrong record and its unpaid generated dues."
                    : "No finance rows are linked, so admin can delete this wrong record."
                  : "Posted finance history exists, so archive keeps old receipts and records true."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <form action={archiveStudentAction}>
                <input type="hidden" name="studentId" value={student.id} />
                <Button type="submit" variant="outline">
                  Archive / Withdraw student
                </Button>
              </form>
              {deletionSafety.hardDeleteAllowed || deletionSafety.canForceDeleteTestRecord ? (
                <form action={hardDeleteStudentAction} className="flex max-w-xs flex-col gap-2">
                  <input type="hidden" name="studentId" value={student.id} />
                  {deletionSafety.canForceDeleteTestRecord && !deletionSafety.hardDeleteAllowed ? (
                    <input type="hidden" name="forceTestRecord" value="yes" />
                  ) : null}
                  <label className="text-xs font-medium text-slate-600" htmlFor="confirmDelete">
                    Type SR {deletionSafety.admissionNo} to confirm delete
                  </label>
                  <input
                    id="confirmDelete"
                    name="confirmDelete"
                    required
                    className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                    placeholder={deletionSafety.admissionNo}
                  />
                  <Button type="submit" variant="destructive">
                    {deletionSafety.generatedDuesDeleteAllowed
                      ? "Delete wrong record and unpaid dues"
                      : "Delete wrong record"}
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
