import Link from "next/link";
import { notFound } from "next/navigation";

import { OfficeRecentTracker, ValueStatePill } from "@/components/office/office-ui";
import { StudentAboutPanel } from "@/components/students/student-about-panel";
import { StudentDangerZone } from "@/components/students/student-danger-zone";
import { StudentIdentityStrip } from "@/components/students/student-identity-strip";
import { StudentQuickReference } from "@/components/students/student-quick-reference";
import { StudentWorkspaceTabs } from "@/components/students/student-workspace-tabs";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Notice } from "@/components/ui/notice";
import { formatShortDate } from "@/lib/helpers/date";
import { getStudentWorkspaceData } from "@/lib/students/workspace";
import { getStudentDeletionSafety } from "@/lib/students/data";
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function installmentTone(status: string) {
  if (status === "paid") return "locked";
  if (status === "overdue" || status === "partial") return "review";
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
  const returnTo = resolvedSearchParams?.returnTo?.startsWith("/protected/students")
    ? resolvedSearchParams.returnTo
    : "/protected/students";
  const encodedReturnTo = encodeURIComponent(returnTo);
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

  const outstandingAmount = installmentBalances.reduce(
    (sum, row) => sum + row.pendingAmount,
    0,
  );
  const todayIso = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const latestReceiptId = receipts[0]?.id ?? null;

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
        <Notice tone="warning" title="This student record is archived">
          Posting payments and editing are restricted. View only.
        </Notice>
      ) : null}

      <StudentIdentityStrip
        student={student}
        outstandingAmount={outstandingAmount}
        creditBalance={financialSnapshot?.creditBalance ?? 0}
        nextDueDate={financialSnapshot?.nextDueDate ?? null}
        nextDueLabel={financialSnapshot?.nextDueLabel ?? null}
        todayIso={todayIso}
        canPostPayments={canPostPayments}
        canEditStudent={canEditStudent}
        canPrintReceipts={canPrintReceipts}
        canViewLedger={canViewLedger}
        latestReceiptId={latestReceiptId}
        returnTo={returnTo}
        encodedReturnTo={encodedReturnTo}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <StudentWorkspaceTabs
          defaultTab={activeTab}
          counts={{
            dues: installmentBalances.filter((row) => row.pendingAmount > 0).length,
            receipts: receipts.length,
            payments: ledger?.payments.length ?? 0,
          }}
          duesContent={
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                      <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                        No installment balance rows are available yet.
                      </td>
                    </tr>
                  ) : (
                    installmentBalances.map((item) => (
                      <tr key={item.installmentId} className="border-t border-border">
                        <td className="px-4 py-3">{item.installmentLabel}</td>
                        <td className="px-4 py-3">{formatShortDate(item.dueDate)}</td>
                        <td className="px-4 py-3 tabular-nums"><Money value={item.baseCharge} /></td>
                        <td className="px-4 py-3 tabular-nums"><Money value={item.finalLateFee} /></td>
                        <td className="px-4 py-3 tabular-nums"><Money value={item.paidAmount} /></td>
                        <td className="px-4 py-3 tabular-nums"><Money value={item.adjustmentAmount} /></td>
                        <td className="px-4 py-3 font-medium tabular-nums"><Money value={item.pendingAmount} /></td>
                        <td className="px-4 py-3">
                          <ValueStatePill
                            tone={installmentTone(item.balanceStatus)}
                            className="normal-case tracking-normal"
                          >
                            {item.balanceStatus}
                          </ValueStatePill>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          receiptsContent={
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        No receipts found for this student.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium text-foreground">{receipt.receiptNumber}</td>
                        <td className="px-4 py-3">{formatShortDate(receipt.paymentDate)}</td>
                        <td className="px-4 py-3">{receipt.paymentModeLabel}</td>
                        <td className="px-4 py-3 tabular-nums"><Money value={receipt.totalAmount} /></td>
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
          }
          paymentsContent={
            ledger ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <div className="mb-3 flex flex-wrap gap-2">
                  <ValueStatePill tone="locked">Locked payment history</ValueStatePill>
                </div>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                        <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                          No payment rows found for this student yet.
                        </td>
                      </tr>
                    ) : (
                      ledger.payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-border">
                          <td className="px-4 py-3">{formatDateTime(payment.createdAt)}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{payment.receiptNumber}</td>
                          <td className="px-4 py-3">
                            {payment.installmentLabel}
                            <div className="text-xs text-muted-foreground">
                              Due {formatShortDate(payment.dueDate)}
                            </div>
                          </td>
                          <td className="px-4 py-3">{payment.paymentMode}</td>
                          <td className="px-4 py-3 tabular-nums"><Money value={payment.paymentAmount} /></td>
                          <td className="px-4 py-3">{payment.notes || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Payment history is not available.</p>
            )
          }
          feePlanContent={
            financialSnapshot ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <ValueStatePill tone="policy">From Fee Setup</ValueStatePill>
                  <ValueStatePill tone="calculated">Fee summary</ValueStatePill>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Tuition override
                    </p>
                    <p className="mt-2 font-semibold text-foreground">
                      {student.tuitionOverride !== null ? (
                        <Money value={student.tuitionOverride} />
                      ) : (
                        "Class default"
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Transport override
                    </p>
                    <p className="mt-2 font-semibold text-foreground">
                      {student.transportOverride !== null ? (
                        <Money value={student.transportOverride} />
                      ) : (
                        "Route default"
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Discount
                    </p>
                    <p className="mt-2 font-semibold text-foreground">
                      <Money value={student.discountAmount} />
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Late fee waiver
                    </p>
                    <p className="mt-2 font-semibold text-foreground">
                      <Money value={student.lateFeeWaiverAmount} />
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface-2 px-4 py-4 text-sm text-foreground">
                  <span className="font-semibold">Other fee / adjustment:</span>{" "}
                  {student.otherAdjustmentHead ? `${student.otherAdjustmentHead} | ` : ""}
                  <Money value={student.otherAdjustmentAmount ?? 0} />
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                        <tr key={item.id} className="border-t border-border">
                          <td className="px-4 py-3">{item.label}</td>
                          <td className="px-4 py-3 font-medium tabular-nums">
                            <Money value={item.amount} />
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-surface-2 font-semibold text-foreground">
                        <td className="px-4 py-3">Resolved annual total</td>
                        <td className="px-4 py-3 tabular-nums">
                          <Money value={financialSnapshot.resolvedBreakdown.annualTotal} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Fee plan is not available yet.</p>
            )
          }
          aboutContent={
            <StudentAboutPanel
              student={student}
              ledger={ledger}
              latestReceiptNumber={receipts[0]?.receiptNumber ?? null}
            />
          }
        />

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <StudentQuickReference student={student} financialSnapshot={financialSnapshot} />
        </aside>
      </div>

      {canEditStudent && deletionSafety ? (
        <StudentDangerZone student={student} deletionSafety={deletionSafety} />
      ) : null}
    </div>
  );
}
