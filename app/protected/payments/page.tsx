import { PageHeader } from "@/components/admin/page-header";
import { WorkflowGuard } from "@/components/office/office-ui";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaymentEntryClient } from "@/components/payments/payment-entry-client";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getPaymentEntryPageData } from "@/lib/payments/data";
import { INITIAL_PAYMENT_ENTRY_ACTION_STATE } from "@/lib/payments/types";
import { getSetupWizardData } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  repairPaymentDeskStudentDuesAction,
  submitPaymentEntryAction,
} from "./actions";

type PaymentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    studentId?: string;
    classId?: string;
    repairNotice?: string;
  }>;
};

function normalizeStudentId(rawValue: string | undefined) {
  const value = (rawValue ?? "").trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) ? value : null;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = (resolvedSearchParams?.query ?? "").trim();
  const studentId = normalizeStudentId(resolvedSearchParams?.studentId);
  const classId = normalizeStudentId(resolvedSearchParams?.classId);
  const repairNotice = (resolvedSearchParams?.repairNotice ?? "").trim();

  const [staff, setup, { classOptions }] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getSetupWizardData(),
    getStudentFormOptions(),
  ]);

  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const canPostPayments =
    hasStaffPermission(staff, "payments:write") && readiness.postPayments.isReady;
  const data = await getPaymentEntryPageData({
    searchQuery,
    studentId,
    classId: classId ?? undefined,
    autoPrepareMissingDues: canPostPayments,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payment Desk"
        description="Select student, collect payment, print receipt."
        actions={
          <StatusBadge
            label={canPostPayments ? "Posting enabled" : "Read-only access"}
            tone={canPostPayments ? "good" : "warning"}
          />
        }
      />

      {!readiness.postPayments.isReady ? (
        <WorkflowGuard
          title={readiness.postPayments.title}
          detail={readiness.postPayments.detail}
          actionLabel={readiness.postPayments.actionLabel}
          actionHref={readiness.postPayments.actionHref}
        />
      ) : null}

      {repairNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {repairNotice}
        </div>
      ) : null}

      <PaymentEntryClient
        data={data}
        canPost={canPostPayments}
        canViewDiagnostics={staff.appRole === "admin"}
        classOptions={classOptions}
        workflowGuard={!readiness.postPayments.isReady ? readiness.postPayments : null}
        initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
        defaultReceivedBy={staff.email ?? "Office desk"}
        submitPaymentEntryAction={submitPaymentEntryAction}
        repairPaymentDeskStudentDuesAction={repairPaymentDeskStudentDuesAction}
      />
    </div>
  );
}
