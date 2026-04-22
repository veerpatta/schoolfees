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

import { submitPaymentEntryAction } from "./actions";

type PaymentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    studentId?: string;
    classId?: string;
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

  const [staff, data, setup, { classOptions }] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getPaymentEntryPageData({ searchQuery, studentId, classId: classId ?? undefined }),
    getSetupWizardData(),
    getStudentFormOptions(),
  ]);

  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);
  const canPostPayments =
    hasStaffPermission(staff, "payments:write") && readiness.postPayments.isReady;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payment entry desk"
        description="Search student, review dues, post append-only payment entries, and generate receipts in one office-friendly workflow."
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

      <PaymentEntryClient
        data={data}
        canPost={canPostPayments}
        classOptions={classOptions}
        workflowGuard={!readiness.postPayments.isReady ? readiness.postPayments : null}
        initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
        defaultReceivedBy={staff.email ?? "Office desk"}
        submitPaymentEntryAction={submitPaymentEntryAction}
      />
    </div>
  );
}
