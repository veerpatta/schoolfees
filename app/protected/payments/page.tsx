import { Suspense } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { OfficeNotice, WorkflowGuard } from "@/components/office/office-ui";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaymentEntryClient } from "@/components/payments/payment-entry-client";
import { PaymentDeskSkeleton } from "@/components/payments/payment-desk-skeleton";
import {
  getPaymentDeskClassOptions,
  getPaymentDeskReadiness,
  getPaymentDeskStudentSummary,
  getPaymentEntryPageData,
} from "@/lib/payments/data";
import { INITIAL_PAYMENT_ENTRY_ACTION_STATE } from "@/lib/payments/types";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  repairPaymentDeskStudentDuesAction,
  submitPaymentEntryAction,
} from "./actions";

type PaymentsPageProps = {
  searchParams?: Promise<{
    studentId?: string;
    classId?: string;
    session?: string;
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
  const studentId = normalizeStudentId(resolvedSearchParams?.studentId);
  const classId = normalizeStudentId(resolvedSearchParams?.classId);
  const repairNotice = (resolvedSearchParams?.repairNotice ?? "").trim();
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });

  const [staff, classOptions] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getPaymentDeskClassOptions(viewSession.sessionLabel),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payment Desk"
        description="Select a student, review dues, collect payment, and print the receipt."
      />

      {repairNotice ? (
        <OfficeNotice tone="warning">{repairNotice}</OfficeNotice>
      ) : null}

      <Suspense fallback={<PaymentDeskSkeleton />}>
        <PaymentDeskDataLoader
          staff={staff}
          classOptions={classOptions}
          studentId={studentId}
          classId={classId}
          sessionLabel={viewSession.sessionLabel}
        />
      </Suspense>
    </div>
  );
}

async function PaymentDeskDataLoader({
  staff,
  classOptions,
  studentId,
  classId,
  sessionLabel,
}: {
  staff: Awaited<ReturnType<typeof requireStaffPermission>>;
  classOptions: Array<{ id: string; label: string }>;
  studentId: string | null;
  classId: string | null;
  sessionLabel: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const canWritePayments = hasStaffPermission(staff, "payments:write");
  const readinessPromise = getPaymentDeskReadiness({
    sessionLabel,
    staffAppRole: staff.appRole,
    canWritePayments,
  });
  if (!studentId) {
    // Readiness and page data use independent reads, so start them together for normal desk opens.
    const [readiness, data] = await Promise.all([
      readinessPromise,
      getPaymentEntryPageData({
        searchQuery: "",
        studentId,
        classId: classId ?? undefined,
        sessionLabel,
        autoPrepareMissingDues: false,
        initialSelectedSummary: null,
      }),
    ]);
    const { canPostPayments } = readiness;
    const blockingReason = readiness.blockingReason;

    return (
      <>
        <div className="flex justify-end">
          <StatusBadge
            label={canPostPayments ? "Posting enabled" : "Read-only access"}
            tone={canPostPayments ? "good" : "warning"}
          />
        </div>

        {blockingReason ? (
          <WorkflowGuard
            title={blockingReason.title}
            detail={blockingReason.detail}
            actionLabel={blockingReason.actionLabel}
            actionHref={blockingReason.actionHref}
          />
        ) : null}

        <PaymentEntryClient
          data={data}
          canPost={canPostPayments}
          canViewDiagnostics={staff.appRole === "admin"}
          classOptions={classOptions}
          workflowGuard={blockingReason}
          initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
          defaultReceivedBy={staff.email ?? "Office desk"}
          submitPaymentEntryAction={submitPaymentEntryAction}
          repairPaymentDeskStudentDuesAction={repairPaymentDeskStudentDuesAction}
        />
      </>
    );
  }

  // Readiness and selected-student summary use independent reads, so start them together.
  const [readiness, initialSelectedSummary] = await Promise.all([
    readinessPromise,
    getPaymentDeskStudentSummary({
      studentId,
      paymentDate: today,
      sessionLabel,
      autoPrepareMissingDues: false,
    }),
  ]);
  const { canPostPayments, canRepairOrPrepareDues } = readiness;
  const data = await getPaymentEntryPageData({
    searchQuery: "",
    studentId,
    classId: classId ?? undefined,
    sessionLabel,
    autoPrepareMissingDues: canRepairOrPrepareDues,
    initialSelectedSummary,
  });
  const blockingReason = readiness.blockingReason;

  return (
    <>
      <div className="flex justify-end">
        <StatusBadge
          label={canPostPayments ? "Posting enabled" : "Read-only access"}
          tone={canPostPayments ? "good" : "warning"}
        />
      </div>

      {blockingReason ? (
        <WorkflowGuard
          title={blockingReason.title}
          detail={blockingReason.detail}
          actionLabel={blockingReason.actionLabel}
          actionHref={blockingReason.actionHref}
        />
      ) : null}

      <PaymentEntryClient
        data={data}
        canPost={canPostPayments}
        canViewDiagnostics={staff.appRole === "admin"}
        classOptions={classOptions}
        workflowGuard={blockingReason}
        initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
        defaultReceivedBy={staff.email ?? "Office desk"}
        submitPaymentEntryAction={submitPaymentEntryAction}
        repairPaymentDeskStudentDuesAction={repairPaymentDeskStudentDuesAction}
      />
    </>
  );
}
