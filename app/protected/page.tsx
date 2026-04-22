import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeRecentActions, ValueStatePill } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { getOfficeHomeData } from "@/lib/office/data";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getSetupWizardData } from "@/lib/setup/data";
import { requireStaffPermission } from "@/lib/supabase/session";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ProtectedPage() {
  const staff = await requireStaffPermission("dashboard:view", { onDenied: "redirect" });
  const [home, setup] = await Promise.all([getOfficeHomeData(), getSetupWizardData()]);
  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);

  const primaryActions: Array<{
    title: string;
    detail: string;
    href: string;
    action: string;
    tone: "editable" | "calculated" | "policy" | "review";
  }> = [
    !readiness.postPayments.isReady
      ? {
          title: readiness.postPayments.title,
          detail: readiness.postPayments.detail,
          href: readiness.postPayments.actionHref ?? getDefaultProtectedHref(staff.appRole),
          action: readiness.postPayments.actionLabel ?? "Open collection status",
          tone: "review" as const,
        }
      : {
          title: "Open Payment Desk",
          detail: `${home.todayCollection.receiptCount} receipt${home.todayCollection.receiptCount === 1 ? "" : "s"} posted today.`,
          href: "/protected/payments",
          action: "Open counter desk",
          tone: "editable" as const,
        },
    !readiness.importStudents.isReady
      ? {
          title: readiness.importStudents.title,
          detail: readiness.importStudents.detail,
          href: readiness.importStudents.actionHref ?? "/protected/setup",
          action: readiness.importStudents.actionLabel ?? "Review setup",
          tone: "review" as const,
        }
      : {
          title: "Continue student work",
          detail:
            home.importAnomalies.length > 0
              ? `${home.importAnomalies.length} import batch${home.importAnomalies.length === 1 ? "" : "es"} still need review.`
              : "Student entry and import are ready for office work.",
          href: home.importAnomalies.length > 0 ? "/protected/imports" : "/protected/students",
          action: home.importAnomalies.length > 0 ? "Review import issues" : "Open students",
          tone: home.importAnomalies.length > 0 ? "review" : "editable",
        },
    !readiness.recalculateLedgers.isReady
      ? {
          title: readiness.recalculateLedgers.title,
          detail: readiness.recalculateLedgers.detail,
          href: readiness.recalculateLedgers.actionHref ?? "/protected/fee-setup",
          action: readiness.recalculateLedgers.actionLabel ?? "Review fee setup",
          tone: "review" as const,
        }
      : {
          title: "Fee Structure and dues",
          detail:
            home.pendingConfigChanges.length > 0
              ? `${home.pendingConfigChanges.length} preview-ready fee change${home.pendingConfigChanges.length === 1 ? "" : "s"} waiting for apply or review.`
              : "Defaults, overrides, and due recalculation are ready for review.",
          href: home.pendingConfigChanges.length > 0 ? "/protected/fee-setup" : "/protected/fee-setup/generate",
          action: home.pendingConfigChanges.length > 0 ? "Continue fee setup change" : "Open recalculation",
          tone: home.pendingConfigChanges.length > 0 ? "policy" : "calculated",
        },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Start Here"
        title="Today’s work"
        description="Use this page like the first worksheet in the fee workbook: start with blockers, continue live tasks, then open the correct operational screen."
        actions={
          <StatusBadge
            label={setup.readiness.collectionDeskReady ? "Collection desk ready" : "Setup attention needed"}
            tone={setup.readiness.collectionDeskReady ? "good" : "warning"}
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        {primaryActions.map((item) => (
          <SectionCard key={item.title} title={item.title} description={item.detail}>
            <div className="flex items-center justify-between gap-3">
              <ValueStatePill tone={item.tone}>
                {item.tone === "review"
                  ? "Needs attention"
                  : item.tone === "policy"
                    ? "Preview ready"
                    : item.tone === "editable"
                      ? "Ready now"
                      : "Calculated"}
              </ValueStatePill>
              <Button asChild size="sm" variant="outline">
                <Link href={item.href}>{item.action}</Link>
              </Button>
            </div>
          </SectionCard>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Continue task"
          description="Resume the last student or receipt, or open the right queue from the latest auditable batch."
        >
          <div className="space-y-3">
            <OfficeRecentActions />

            {home.pendingConfigChanges.slice(0, 2).map((batch) => (
              <div key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{batch.scopeLabel}: {batch.targetLabel}</p>
                  <ValueStatePill tone="policy">Preview ready</ValueStatePill>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {batch.summary
                    ? `${batch.summary.studentsAffected} students affected, ${batch.blockedInstallmentCount} blocked rows for review.`
                    : "Impact preview is ready for review."}
                </p>
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/protected/fee-setup">Continue fee setup change</Link>
                  </Button>
                </div>
              </div>
            ))}

            {home.ledgerRegenerationBatches
              .filter((batch) => batch.status === "preview_ready")
              .slice(0, 1)
              .map((batch) => (
                <div key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{batch.policyRevisionLabel}</p>
                    <ValueStatePill tone="review">Manual review queue</ValueStatePill>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {batch.rowsRecalculated} rows recalculated in preview and {batch.rowsRequiringReview} need manual review.
                  </p>
                  <div className="mt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/protected/fee-setup/generate">Continue blocked recalculation review</Link>
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Setup blockers"
          description="Clear these before the desk is treated as fully live."
        >
          <ul className="space-y-3">
            {setup.readiness.missingBlockingItems.length === 0 ? (
              <li className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                Blocking setup checks are complete.
              </li>
            ) : (
              setup.readiness.missingBlockingItems.map((item) => (
                <li key={item.key} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <Button asChild size="sm" variant="outline">
                      <Link href={item.href}>Open step</Link>
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.detail}</p>
                </li>
              ))
            )}
          </ul>
        </SectionCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Students due today and overdue"
          description="Open the exact student workspace from the action list instead of browsing through reports."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Due today</p>
                <ValueStatePill tone="calculated">{formatShortDate(home.today)}</ValueStatePill>
              </div>
              <div className="space-y-3">
                {home.studentsDueToday.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No students are due today in the current balance view.
                  </div>
                ) : (
                  home.studentsDueToday.map((row) => (
                    <div key={`${row.studentId}-${row.dueDate}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-950">{row.fullName}</p>
                          <p className="text-sm text-slate-600">{row.classLabel} • {row.admissionNo}</p>
                        </div>
                        <ValueStatePill tone={row.balanceStatus === "overdue" ? "review" : "calculated"}>
                          {row.balanceStatus}
                        </ValueStatePill>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        Due {formatShortDate(row.dueDate)} • {formatInr(row.outstandingAmount)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/protected/students/${row.studentId}`}>Student workspace</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/protected/payments?studentId=${row.studentId}`}>Post payment</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Overdue follow-up</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/protected/dues?view=defaulters">Open defaulters</Link>
                </Button>
              </div>
              <div className="space-y-3">
                {home.overdueStudents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No overdue students are visible right now.
                  </div>
                ) : (
                  home.overdueStudents.map((row) => (
                    <div key={`${row.studentId}-${row.dueDate}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="font-semibold text-slate-950">{row.fullName}</p>
                      <p className="mt-1 text-sm text-slate-600">{row.classLabel} • {row.admissionNo}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        Oldest due {formatShortDate(row.dueDate)} • {formatInr(row.outstandingAmount)}
                      </p>
                      <div className="mt-3">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/protected/students/${row.studentId}`}>Open student</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Import and review queues"
          description="Use these links when workbook migration work still needs staff attention."
        >
          <div className="space-y-3">
            {home.importAnomalies.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No recent import batches show unresolved anomalies.
              </div>
            ) : (
              home.importAnomalies.map((batch) => (
                <div key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{batch.filename}</p>
                    <ValueStatePill tone="review">{batch.issueCount} issues</ValueStatePill>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Uploaded {formatDateTime(batch.createdAt)}</p>
                  <div className="mt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/protected/imports?batchId=${batch.id}`}>Continue import review</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Total students"
          value={home.dashboard.totalStudents}
          hint="Active and inactive student records in current office use"
        />
        <MetricCard
          title="Total due"
          value={formatInr(home.dashboard.totalDue)}
          hint="Scheduled installment amount excluding waived rows"
        />
        <MetricCard
          title="Total collected"
          value={formatInr(home.dashboard.totalCollected)}
          hint="Posted receipt amount across all collections"
        />
        <MetricCard
          title="Total pending"
          value={formatInr(home.dashboard.totalPending)}
          hint={`${home.dashboard.studentsWithPending} students still have open dues`}
        />
        <MetricCard
          title="Overdue installments"
          value={home.dashboard.overdueInstallmentCount}
          hint="Installments past due date and still unpaid"
        />
      </section>

      <SectionCard
        title="Recent receipts"
        description="Keep the last few desk entries visible from the Start Here sheet."
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Receipt no</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {home.dashboard.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No payments posted yet.
                  </td>
                </tr>
              ) : (
                home.dashboard.recentPayments.map((payment) => (
                  <tr key={`${payment.receiptNumber}-${payment.paymentDate}`} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{payment.receiptNumber}</td>
                    <td className="px-4 py-3">{formatShortDate(payment.paymentDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{payment.studentName}</div>
                      <div className="text-xs text-slate-500">{payment.admissionNo}</div>
                    </td>
                    <td className="px-4 py-3">{payment.classLabel}</td>
                    <td className="px-4 py-3">{payment.paymentMode}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatInr(payment.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
